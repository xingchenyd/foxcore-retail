/** Regression probes reproducing the 2026-10-27 findings after remediation.
 * Run separately from the existing regression suite. Historical red evidence is preserved in docs/spec-kit-review.
 * Page adapters are not evidence of WeChat engine/device rendering.
 */
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||process.env.TEST_CONFIRM!=='yes')throw new Error('Explicit isolated loopback test environment required');
vi.mock('../../apps/miniprogram/src/config',()=>({apiBaseUrl:process.env.TEST_BASE_URL??'http://127.0.0.1:3000'}));
type P=Record<string,any>;
let registered:P={};
const storage=new Map<string,unknown>();
beforeEach(()=>{
  vi.resetModules();storage.clear();
  vi.stubGlobal('Page',(value:P)=>{registered=value;});
  vi.stubGlobal('wx',{
    getStorageSync:(k:string)=>storage.get(k),setStorageSync:(k:string,v:unknown)=>storage.set(k,structuredClone(v)),removeStorageSync:(k:string)=>storage.delete(k),getStorageInfoSync:()=>({keys:[...storage.keys()]}),
    getRandomValues:(o:P)=>{const bytes=randomBytes(16);o.success({randomValues:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});},
    request:(o:P)=>void fetch(o.url,{method:o.method,headers:o.header,body:o.method==='GET'?undefined:JSON.stringify(o.data??{})}).then(async r=>o.success({statusCode:r.status,data:await r.json()})).catch(()=>o.fail()),
    reLaunch:vi.fn(),redirectTo:vi.fn(),navigateTo:vi.fn(),switchTab:vi.fn(),stopPullDownRefresh:vi.fn(),showToast:vi.fn(),showModal:(o:P)=>o.success({confirm:true})
  });
});
async function page(name:string):Promise<P>{
  await import('../../apps/miniprogram/src/pages/'+name+'/index.ts');
  const result:P={data:structuredClone(registered.data)};
  result.setData=(data:P)=>{for(const [path,value]of Object.entries(data)){const parts=path.replace(/\[(\d+)\]/g,'.$1').split('.');let target=result.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)!]=value;}};
  for(const [key,value]of Object.entries(registered))if(typeof value==='function')result[key]=value.bind(result);
  return result;
}
async function owner(){
  const response=await fetch(base+'/api/v1/auth/mini/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.TEST_OWNER_USERNAME??'owner',password:process.env.TEST_OWNER_PASSWORD})});
  expect(response.status).toBe(200);const auth=await response.json() as P;
  (await import('../../apps/miniprogram/src/lib/session')).saveSession(auth);
  return auth;
}

describe('Spec Kit defect regression — production paths',()=>{
  it('SK-B01: first stock count at a product/location with no balance row can be recorded',async()=>{
    await owner();const api=await import('../../apps/miniprogram/src/lib/api');
    const product=await api.command<P>('/products',{sku:'COUNT-'+randomUUID().slice(0,8),name:'Review first count',wholesaleCost:'1.00',minPrice:'2.00'});
    const p=await page('inventory-action');p.setData({type:'adjust'});await p.load();
    p.setData({productIndex:p.data.products.findIndex((x:P)=>x.id===product.id),toIndex:p.data.locations.findIndex((x:P)=>x.code==='MAIN')});
    await p.balance();expect(p.data.version).toBe(0);expect(p.data.onHand).toBe('0');
    p.setData({quantity:'3',reason:'Independent initial physical count'});await p.submit();
    // Actual: 409 库存已变化，请重新盘点. Re-selecting the same empty row repeats it.
    expect(p.data.error,'Fresh product should support a version-safe first count').toBe('');
    expect(p.data.result).toContain('已登记');
  });

  it('SK-B02: re-opening an existing draft restores the locally saved edits',async()=>{
    const s=await import('../../apps/miniprogram/src/lib/session');
    s.saveSession({user:{id:'review-owner',username:'owner',role:'OWNER',salespersonId:null,mustChangePassword:false},csrf:'test',accessToken:'t'.repeat(43)});
    const shift={id:'10',status:'ACTIVE',planned_start:'2000-01-01 00:00:00',planned_end:'2099-01-01 00:00:00',event_name:'Review',booth_location:'A',first_name:'Staff',last_name:'Test'};
    const product={id:'20',name:'Product',sku:'R',active:1,min_price_cents:'100',suggested_price_cents:'200'};
    (wx.request as any)=(o:P)=>{const path=new URL(o.url).pathname;const data=path.includes('/operations/workspaces/')?{revision:0,payload:null}:path.endsWith('/shifts')?{items:[shift],offset:0,total:1,hasMore:false}:path.endsWith('/products')?{items:[product],offset:0,total:1,hasMore:false}:{sale:{id:'30',state:'DRAFT',version:1,shift_id:'10'},lines:[{product_id:'20',quantity:1,final_unit_price_cents:'200',current_name:'Product'}]};o.success({statusCode:200,data});};
    const first=await page('sale-edit');await first.load('30');
    first.inputLine({currentTarget:{dataset:{index:0,field:'quantity'}},detail:{value:'3'}});
    expect((storage.get('foxcore.draft.review-owner.30') as P).lines[0].quantity).toBe('3');
    expect(first.data.saved).toBe(true);
    const reopened=await page('sale-edit');await reopened.load('30');
    expect(reopened.data.lines[0].quantity,'The locally saved quantity must survive page recreation').toBe('3');
  });

  it('SK-B03: a web receipt retried after reload and a lost response does not create a second document',async()=>{
    const auth=await owner(),api=await import('../../apps/miniprogram/src/lib/api');
    const product=await api.command<P>('/products',{sku:'RETRY-'+randomUUID().slice(0,8),name:'Review uncertain web receipt',wholesaleCost:'1.00',minPrice:'2.00'});
    const persisted=new Map<string,string>();
    vi.stubGlobal('localStorage',{getItem:(k:string)=>persisted.get(k)??null,setItem:(k:string,v:string)=>persisted.set(k,v),removeItem:(k:string)=>persisted.delete(k),key:(i:number)=>[...persisted.keys()][i]??null,get length(){return persisted.size;}});
    vi.stubGlobal('window',new EventTarget());vi.stubGlobal('navigator',{locks:{request:async(_n:string,_o:object,fn:Function)=>fn({})}});
    const originalFetch=fetch;let loseResponse=true;
    vi.stubGlobal('fetch',async(path:string,init:P={})=>{const headers=new Headers(init.headers);headers.set('authorization','Bearer '+auth.accessToken);const response=await originalFetch(new URL(path,base),{...init,headers});if(loseResponse&&String(path).endsWith('/stock/receive')){loseResponse=false;await response.json();throw new Error('Injected response loss AFTER the server committed');}return response;});
    let web=await import('../../apps/web/src/lib/commands');
    const body={productId:product.id,quantity:1,reason:'One physical delivery'};
    await expect(web.webCommand(auth,'/stock/receive','POST',body)).rejects.toThrow('AFTER the server committed');
    vi.resetModules();web=await import('../../apps/web/src/lib/commands');
    await web.webCommand(auth,'/stock/receive','POST',body);vi.stubGlobal('fetch',originalFetch);
    const locations=await api.choices<P>('/stock/locations'),main=locations.find(x=>x.code==='MAIN')!;
    const balances=await api.choices<P>('/stock/balances?locationId='+main.id),balance=balances.find(x=>x.product_id===product.id)!;
    expect(String(balance.on_hand),'One physical delivery must be recorded exactly once across a page reload').toBe('1');
  });

  it('control: mini command replay after response loss and module restart records the receipt once',async()=>{
    await owner();let api=await import('../../apps/miniprogram/src/lib/api');
    const product=await api.command<P>('/products',{sku:'SAFE-'+randomUUID().slice(0,8),name:'Review durable mini receipt',wholesaleCost:'1.00',minPrice:'2.00'});
    const original=wx.request;let lose=true;
    (wx.request as any)=(o:P)=>original({...o,success:(r:P)=>{if(lose&&o.url.endsWith('/stock/receive')){lose=false;o.fail({errMsg:'Injected committed response loss'});}else o.success(r);}} as any);
    await expect(api.command('/stock/receive',{productId:product.id,quantity:1,reason:'One physical delivery'})).rejects.toThrow();
    expect(api.pendingCommands()).toHaveLength(1);vi.resetModules();api=await import('../../apps/miniprogram/src/lib/api');
    await api.retryPending(api.pendingCommands()[0].storageKey);
    const main=(await api.choices<P>('/stock/locations')).find(x=>x.code==='MAIN')!;
    const balance=(await api.choices<P>('/stock/balances?locationId='+main.id)).find(x=>x.product_id===product.id)!;
    expect(String(balance.on_hand)).toBe('1');expect(api.pendingCommands()).toHaveLength(0);
  });
});
