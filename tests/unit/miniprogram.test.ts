import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cents,parseMoney,quantity} from '../../apps/miniprogram/src/lib/format';
vi.mock('../../apps/miniprogram/src/config',()=>({apiBaseUrl:'https://api.example.test'}));
const storage=new Map<string,unknown>();
const http=vi.fn();
const user={id:'mini-test',username:'staff',role:'SALESPERSON',salespersonId:'1',mustChangePassword:false};
beforeEach(()=>{
  vi.resetModules();storage.clear();http.mockReset();
  vi.stubGlobal('wx',{
    getStorageSync:(key:string)=>storage.get(key),setStorageSync:(key:string,value:unknown)=>storage.set(key,value),removeStorageSync:(key:string)=>storage.delete(key),getStorageInfoSync:()=>({keys:[...storage.keys()]}),
    getRandomValues:(o:{success:(r:{randomValues:ArrayBuffer})=>void})=>o.success({randomValues:new Uint8Array(16).fill(7).buffer}),request:http,reLaunch:vi.fn()
  });
});
describe('mini program money input',()=>{
  it('formats signed integer cents without floating point',()=>{expect(cents('9000000000000')).toBe('90,000,000,000.00');expect(cents('-101')).toBe('-1.01');expect(cents('1.5')).toBe('—');});
  it('parses decimal CAD strings exactly',()=>{expect(parseMoney('0.29')).toBe(29);expect(parseMoney('90000000000.00')).toBe(9_000_000_000_000);});
  it.each(['1e3','-1','1.001','01.00','1,000','90000000000.01'])('rejects invalid amount %s',x=>expect(()=>parseMoney(x)).toThrow());
  it('validates counted stock and positive sale quantities',()=>{expect(quantity('0',true)).toBe(0);expect(()=>quantity('0')).toThrow();expect(()=>quantity('1.5')).toThrow();});
});
async function setup(){const session=await import('../../apps/miniprogram/src/lib/session');session.saveSession({user,csrf:'csrf-test',accessToken:'t'.repeat(43)});return import('../../apps/miniprogram/src/lib/api');}
describe('mini program command recovery',()=>{
  it('retains the original command after lost response, blocks changed body and replays once',async()=>{
    const api=await setup();http.mockImplementationOnce(o=>o.fail());
    await expect(api.command('/sales',{shiftId:'1',lines:[]})).rejects.toMatchObject({uncertain:true});
    const first=http.mock.calls[0][0];expect(first.header.Authorization).toBe('Bearer '+'t'.repeat(43));expect(first.header['x-csrf-token']).toBe('csrf-test');
    expect(api.pendingCommands()).toHaveLength(1);
    await expect(api.command('/sales',{shiftId:'2',lines:[]})).rejects.toMatchObject({code:'PENDING_COMMAND'});expect(http).toHaveBeenCalledTimes(1);
    vi.resetModules();const restarted=await import('../../apps/miniprogram/src/lib/api');expect(restarted.pendingCommands()).toHaveLength(1);
    http.mockImplementationOnce(o=>o.success({statusCode:200,data:{id:'42'}}));
    expect(await restarted.retryPending(restarted.pendingCommands()[0].storageKey)).toEqual({id:'42'});
    expect(http.mock.calls[1][0].header['idempotency-key']).toBe(first.header['idempotency-key']);expect(api.pendingCommands()).toHaveLength(0);
  });
  it('does not race key creation on double tap',async()=>{
    const api=await setup();let complete:(v:unknown)=>void=()=>{};http.mockImplementationOnce(o=>{complete=()=>o.success({statusCode:200,data:{id:'1'}});});
    const first=api.command('/sales',{});await Promise.resolve();
    await expect(api.command('/sales',{})).rejects.toMatchObject({code:'COMMAND_BUSY'});complete({});await first;expect(http).toHaveBeenCalledTimes(1);
  });
  it('removes definitive validation failures but keeps server uncertainty',async()=>{
    const api=await setup();http.mockImplementationOnce(o=>o.success({statusCode:409,data:{code:'CONFLICT',message:'库存不足'}}));
    await expect(api.command('/sales',{})).rejects.toMatchObject({status:409});expect(api.pendingCommands()).toHaveLength(0);
    http.mockImplementationOnce(o=>o.success({statusCode:500,data:{code:'INTERNAL_ERROR'}}));await expect(api.command('/sales',{})).rejects.toMatchObject({uncertain:true});expect(api.pendingCommands()).toHaveLength(1);
  });
  it('isolates pending operations by employee and clears auth on 401',async()=>{
    const api=await setup();http.mockImplementationOnce(o=>o.fail());await expect(api.command('/sales',{})).rejects.toThrow();
    const session=await import('../../apps/miniprogram/src/lib/session');session.saveSession({user:{...user,id:'other'},csrf:'other',accessToken:'o'.repeat(43)});expect(api.pendingCommands()).toHaveLength(0);
    http.mockImplementationOnce(o=>o.success({statusCode:401,data:{code:'SESSION_EXPIRED'}}));await expect(api.request('/sales')).rejects.toThrow();expect(session.session()).toBeNull();
  });
  it('keeps an uncertain command when the session expires before reconciliation',async()=>{
    const api=await setup();http.mockImplementationOnce(o=>o.fail());await expect(api.command('/sales',{})).rejects.toThrow();const pending=api.pendingCommands()[0];
    http.mockImplementationOnce(o=>o.success({statusCode:401,data:{code:'SESSION_EXPIRED'}}));await expect(api.retryPending(pending.storageKey)).rejects.toThrow();
    const session=await import('../../apps/miniprogram/src/lib/session');session.saveSession({user,csrf:'renewed',accessToken:'r'.repeat(43)});expect(api.pendingCommands()).toHaveLength(1);
  });
});
