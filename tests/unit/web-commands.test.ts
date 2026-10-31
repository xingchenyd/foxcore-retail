import {beforeEach,describe,expect,it,vi} from 'vitest';
const transport=vi.hoisted(()=>vi.fn());
vi.mock('../../apps/web/src/lib/api.js',async original=>({...await original<typeof import('../../apps/web/src/lib/api')>(),api:transport}));
const data=new Map<string,string>(),locks=new Set<string>();
const auth={user:{id:'owner-1'},csrf:'csrf'};
beforeEach(()=>{
 vi.resetModules();transport.mockReset();data.clear();locks.clear();vi.stubGlobal('window',new EventTarget());
 vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k),key:(i:number)=>[...data.keys()][i]??null,get length(){return data.size;}});
 vi.stubGlobal('navigator',{locks:{request:async(name:string,_options:object,fn:(lock:object|null)=>Promise<unknown>)=>{if(locks.has(name))return fn(null);locks.add(name);try{return await fn({name});}finally{locks.delete(name);}}}});
});
describe('durable web business commands',()=>{
 it('retains UUID/body through module restart and blocks altered intent',async()=>{
  let api=await import('../../apps/web/src/lib/commands');transport.mockRejectedValueOnce(new TypeError('network response lost'));
  await expect(api.webCommand(auth,'/stock/receive','POST',{quantity:1})).rejects.toThrow();const old=api.pendingWebCommands(auth.user.id)[0];
  await expect(api.webCommand(auth,'/stock/receive','POST',{quantity:2})).rejects.toThrow('待核对');
  vi.resetModules();api=await import('../../apps/web/src/lib/commands');transport.mockResolvedValueOnce({id:'1'});await api.retryWebCommand(auth,api.pendingWebCommands(auth.user.id)[0]);
  expect((transport.mock.calls[1][1].headers as Record<string,string>)['Idempotency-Key']).toBe(old.key);expect(api.pendingWebCommands(auth.user.id)).toHaveLength(0);
 });
 it('does not send when durable storage is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('quota');}});
  const api=await import('../../apps/web/src/lib/commands');await expect(api.webCommand(auth,'/stock/receive','POST',{})).rejects.toThrow('尚未发送');expect(transport).not.toHaveBeenCalled();
 });
 it('uses an origin-wide lock and keeps records isolated by user',async()=>{
  const api=await import('../../apps/web/src/lib/commands');let done:(v:object)=>void=()=>{};transport.mockImplementationOnce(()=>new Promise(r=>{done=r;}));
  const first=api.webCommand(auth,'/stock/receive','POST',{});await expect(api.webCommand(auth,'/stock/receive','POST',{})).rejects.toThrow('另一页面');expect(api.pendingWebCommands('other')).toHaveLength(0);done({id:'1'});await first;expect(transport).toHaveBeenCalledTimes(1);
 });
 it('does not persist temporary passwords or replay them without re-entry',async()=>{
  const api=await import('../../apps/web/src/lib/commands'),password='Temporary-'+crypto.randomUUID();transport.mockRejectedValueOnce(new TypeError('lost'));
  await expect(api.webCommand(auth,'/operations/users/2/reset','POST',{password,reason:'reset'})).rejects.toThrow();expect([...data.values()].join('')).not.toContain(password);const pending=api.pendingWebCommands(auth.user.id)[0];expect(()=>api.retryWebCommand(auth,pending)).toThrow('口令不会保存');
  transport.mockResolvedValueOnce({id:'2'});await api.webCommand(auth,'/operations/users/2/reset','POST',{password,reason:'reset'});expect(transport.mock.calls[1][1].headers['Idempotency-Key']).toBe(pending.key);
 });
 it('preserves uncertainty when reauthentication or CSRF refresh is required',async()=>{
  const {HttpError}=await import('../../apps/web/src/lib/api'),api=await import('../../apps/web/src/lib/commands');transport.mockRejectedValueOnce(new HttpError(403,'CSRF','refresh'));
  await expect(api.webCommand(auth,'/sales','POST',{})).rejects.toThrow();expect(api.pendingWebCommands(auth.user.id)).toHaveLength(1);
 });
 it('resolves an unknown password outcome without needing or retaining the original secret',async()=>{
  const api=await import('../../apps/web/src/lib/commands');transport.mockRejectedValueOnce(new TypeError('lost'));await expect(api.webCommand(auth,'/operations/users/2/reset','POST',{password:'Forgotten-temporary-secret',reason:'reset'})).rejects.toThrow();const pending=api.pendingWebCommands(auth.user.id)[0];transport.mockResolvedValueOnce({previousState:'COMMITTED',id:'2'});expect(await api.resolvePasswordCommand(auth,pending)).toMatchObject({previousState:'COMMITTED'});expect(api.pendingWebCommands(auth.user.id)).toHaveLength(0);expect(transport.mock.calls[1][0]).toContain(pending.key+'/resolve');expect(transport.mock.calls[1][1].body).toBe('{"kind":"reset"}');
 });
 it('does not abandon an uncertain receipt through password recovery',async()=>{
  const api=await import('../../apps/web/src/lib/commands');transport.mockRejectedValueOnce(new TypeError('lost'));await expect(api.webCommand(auth,'/stock/receive','POST',{quantity:1})).rejects.toThrow();await expect(api.resolvePasswordCommand(auth,api.pendingWebCommands(auth.user.id)[0])).rejects.toThrow('口令操作');expect(transport).toHaveBeenCalledTimes(1);expect(api.pendingWebCommands(auth.user.id)).toHaveLength(1);
 });
});
