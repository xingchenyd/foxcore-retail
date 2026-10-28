/** Executes actual native Page handlers + wx.request adapter against isolated MariaDB.
 * This is controller integration evidence, not WeChat rendering/device evidence.
 */
import {describe,expect,it,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {DateTime} from 'luxon';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||process.env.TEST_CONFIRM!=='yes')throw new Error('Dedicated localhost database required');
vi.mock('../../apps/miniprogram/src/config',()=>({apiBaseUrl:process.env.TEST_BASE_URL??'http://127.0.0.1:3000'}));
type P=Record<string,any>;
describe('actual Mini Program Page controllers with real shared API',()=>{
  it('completes native form handlers for inventory, sales, returns and commissions',async()=>{
    const store=new Map<string,unknown>(),navigation:string[]=[];let registered:P={};
    vi.stubGlobal('Page',(p:P)=>{registered=p;});
    vi.stubGlobal('wx',{
      getStorageSync:(k:string)=>store.get(k),setStorageSync:(k:string,v:unknown)=>store.set(k,v),removeStorageSync:(k:string)=>store.delete(k),getStorageInfoSync:()=>({keys:[...store.keys()]}),
      getRandomValues:(o:P)=>{const b=randomBytes(16);o.success({randomValues:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});},
      request:(o:P)=>{void fetch(o.url,{method:o.method,headers:o.header,body:o.method==='GET'?undefined:JSON.stringify(o.data??{})}).then(async r=>o.success({statusCode:r.status,data:await r.json()})).catch(()=>o.fail());},
      reLaunch:(o:P)=>navigation.push(o.url),switchTab:(o:P)=>navigation.push(o.url),navigateTo:(o:P)=>navigation.push(o.url),redirectTo:(o:P)=>navigation.push(o.url),showModal:(o:P)=>o.success({confirm:true}),showToast:()=>{},stopPullDownRefresh:()=>{}
    });
    async function page(name:string):Promise<P>{await import('../../apps/miniprogram/src/pages/'+name+'/index.ts');const p:P={data:structuredClone(registered.data)};p.setData=(values:P)=>{for(const [path,value]of Object.entries(values)){const parts=path.replace(/\[(\d+)\]/g,'.$1').split('.');let at=p.data;for(const part of parts.slice(0,-1))at=at[part];at[parts.at(-1)!]=value;}};for(const [k,v]of Object.entries(registered))if(typeof v==='function')p[k]=v.bind(p);return p;}
    const check=(p:P)=>expect(p.data.error).toBe('');
    const login=await page('login');login.setData({username:process.env.TEST_OWNER_USERNAME??'owner',password:process.env.TEST_OWNER_PASSWORD});await login.submit();check(login);expect(navigation.at(-1)).toBe('/pages/home/index');
    const api=await import('../../apps/miniprogram/src/lib/api');const session=await import('../../apps/miniprogram/src/lib/session');
    const tag=randomUUID().slice(0,8),day=DateTime.now().setZone('America/Toronto');
    const venue=await api.command<P>('/venues',{name:'Page '+tag,street:'1 Test St',city:'Toronto',province:'Ontario',postalCode:'M5V 2T6'}),categories=await api.request<P>('/categories');
    const event=await api.command<P>('/events',{venueId:venue.id,categoryId:categories.items[0].id,name:'Native Pages '+tag,startDate:day.toISODate(),endDate:day.toISODate(),taxBps:1300,policyConfirmed:true,currency:'CAD',priceBasis:'EXCLUSIVE',businessTimezone:'America/Toronto'});
    const booth=await api.command<P>('/booths',{eventId:event.id,location:'P-'+tag});await api.command('/events/'+event.id+'/open');
    const product=await api.command<P>('/products',{sku:'PAGE-'+tag,name:'原生页面测试商品 '+tag,wholesaleCost:'4.00',minPrice:'8.00',suggestedPrice:'10.00',currency:'CAD'}),person=await api.command<P>('/salespeople',{firstName:'Page',lastName:tag,commissionBps:500});
    const staffName='page_'+tag,initial='Initial-'+randomUUID();await api.command('/users',{username:staffName,password:initial,salespersonId:person.id});
    const shift=await api.command<P>('/shifts',{salespersonId:person.id,boothId:booth.id,plannedStart:day.startOf('day').toISO(),plannedEnd:day.endOf('day').toISO()});await api.command('/shifts/'+shift.id+'/start');
    const stock=await page('inventory-action');stock.setData({type:'receive'});await stock.load();stock.setData({productIndex:stock.data.products.findIndex((x:P)=>x.id===product.id),quantity:'12',reason:'Page receipt'});await stock.submit();check(stock);expect(stock.data.result).toContain('已登记');
    const locations=stock.data.locations,from=locations.findIndex((x:P)=>x.code==='MAIN'),to=locations.findIndex((x:P)=>x.event_id===event.id);
    stock.setData({type:'transfer',fromIndex:from,toIndex:to,quantity:'8',reason:'Page handover',handover:true});await stock.submit();check(stock);
    const draft=await page('sale-edit');await draft.load('');draft.setData({shiftIndex:draft.data.shifts.findIndex((x:P)=>x.id===shift.id),productIndex:draft.data.products.findIndex((x:P)=>x.id===product.id)});draft.add();draft.setData({'lines[0].quantity':'2'});draft.preview();expect(draft.data.subtotal).toBe('20.00');await draft.save();check(draft);
    const saleId=new URL(navigation.at(-1)!,'http://localhost').searchParams.get('id');expect(saleId).toBeTruthy();
    const sale=await page('sale-detail');sale.setData({id:saleId});await sale.load();await sale.prepare();check(sale);expect(sale.data.sale.state).toBe('CHECKOUT');sale.setData({cashReceived:'25.00',paidConfirmed:true});await sale.post();check(sale);expect(sale.data.sale.state).toBe('POSTED');expect(sale.data.result).toContain('2.40');
    const ret=await page('return-create');ret.setData({saleId});await ret.load();ret.setData({locationIndex:ret.data.locations.findIndex((x:P)=>x.code==='MAIN'),reason:'Page partial return','lines[0].selected':true});await ret.submit();check(ret);
    const returnId=new URL(navigation.at(-1)!,'http://localhost').searchParams.get('id'),refund=await page('return-detail');refund.setData({id:returnId});await refund.load();await refund.authorize();check(refund);expect(refund.data.total).toBe('11.30');refund.setData({refundReference:'PAGE-'+tag,refunded:true});await refund.post();check(refund);expect(refund.data.row.state).toBe('POSTED');
    const commissions=await page('commissions');await commissions.load();commissions.setData({personIndex:commissions.data.people.findIndex((x:P)=>x.id===person.id)});await commissions.prepare();check(commissions);
    const settlementId=new URL(navigation.at(-1)!,'http://localhost').searchParams.get('id'),settlement=await page('settlement-detail');settlement.setData({id:settlementId});await settlement.load();expect(settlement.data.total).toBe('0.50');settlement.setData({reference:'PAGE-PAID-'+tag,paid:true});await settlement.pay();check(settlement);expect(settlement.data.row.state).toBe('PAID');
    stock.setData({type:'adjust',toIndex:to});await stock.balance();stock.setData({quantity:'7',reason:'Page counted'});await stock.submit();check(stock);
    const home=await page('home');await home.load();check(home);const inventory=await page('inventory');await inventory.load();check(inventory);const sales=await page('sales');await sales.load();check(sales);while(!sales.data.items.some((x:P)=>x.id===saleId)&&sales.data.hasMore){await sales.load(true);check(sales);}sales.setData({query:saleId});sales.applyFilter();expect(sales.data.visible.some((x:P)=>x.id===saleId)).toBe(true);const returns=await page('returns');await returns.load();check(returns);
    const profile=await page('profile');await profile.logout();expect(session.session()).toBeNull();
    // Initial-password UI route is exercised with synthetic credentials, not a human account.
    session.clearSession();login.setData({username:staffName,password:initial,changing:false});await login.submit();check(login);expect(login.data.changing).toBe(true);
    const next='Next-'+randomUUID();login.setData({currentPassword:initial,newPassword:next,confirmPassword:next});await login.submit();check(login);expect(session.session()).toBeNull();login.setData({password:next});await login.submit();check(login);
    await inventory.load();check(inventory);expect(inventory.data.owner).toBe(false);expect(inventory.data.items.some((x:P)=>x.location_id!==locations[to].id)).toBe(true);
    await commissions.load();check(commissions);expect(commissions.data.owner).toBe(false);expect(commissions.data.settlements.every((x:P)=>x.salesperson_id===person.id)).toBe(true);
    expect(api.pendingCommands()).toHaveLength(0);
  },120_000);
});
