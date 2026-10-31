import {api,HttpError} from './api.js';

export interface CommandAuth {user:{id:string};csrf:string}
export interface PendingCommand {owner:string;path:string;method:'POST'|'PATCH';key:string;payload:string;createdAt:string;sensitive?:boolean;requestHash?:string}
const prefix='foxcore.web.command.v1.';
const keyFor=(owner:string,method:string,path:string)=>prefix+owner+'.'+method+'.'+path;
const changed=()=>window.dispatchEvent(new Event('foxcore:commands'));

function read(key:string):PendingCommand|null {
  const raw=localStorage.getItem(key);if(raw===null)return null;
  const value=JSON.parse(raw) as PendingCommand;
  if(!value.owner||!value.path?.startsWith('/')||!value.key||typeof value.payload!=='string'||!['POST','PATCH'].includes(value.method))throw new Error('待核对记录损坏，请保留现场并联系管理员');
  return value;
}
export function pendingWebCommands(owner:string):PendingCommand[] {
  const result:PendingCommand[]=[];
  for(let n=0;n<localStorage.length;n++){const k=localStorage.key(n);if(k?.startsWith(prefix+owner+'.')){const p=read(k);if(p?.owner===owner)result.push(p);}}
  return result.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
/** Web Locks serialize origin-wide storage claim + send, including other tabs.
 * No silent unsafe fallback on older browsers. Persist before any network call.
 */
export async function webCommand<T>(auth:CommandAuth,path:string,method:'POST'|'PATCH',data:object={}):Promise<T>{
  if(!path.startsWith('/')||path.startsWith('//')||/[\\\r\n]/.test(path))throw new Error('请求路径无效');
  if(!navigator.locks)throw new Error('此浏览器不支持安全提交，请升级浏览器后重试');
  const storageKey=keyFor(auth.user.id,method,path),payload=JSON.stringify(data);
  return navigator.locks.request(storageKey,{mode:'exclusive',ifAvailable:true},async lock=>{
    if(!lock)throw new Error('另一页面正在提交此操作，请稍后核对');
    const sensitive=Object.keys(data).some(k=>/password/i.test(k));
    const requestHash=sensitive?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload))),x=>x.toString(16).padStart(2,'0')).join(''):undefined;
    let pending:PendingCommand|null;
    try{pending=read(storageKey);}catch{throw new Error('无法读取待核对记录，请检查本机存储，勿重复登记');}
    if(pending&&(pending.owner!==auth.user.id||(sensitive?pending.requestHash!==requestHash:pending.sensitive||pending.payload!==payload)))throw new Error('此操作尚有待核对请求，请先核对原操作，不能修改内容后再次登记');
    if(!pending){
      pending={owner:auth.user.id,path,method,key:crypto.randomUUID(),payload:sensitive?'{}':payload,createdAt:new Date().toISOString(),...(sensitive?{sensitive,requestHash}:{})};
      try{localStorage.setItem(storageKey,JSON.stringify(pending));if(localStorage.getItem(storageKey)!==JSON.stringify(pending))throw new Error();}catch{throw new Error('待核对记录保存失败，操作尚未发送。请检查浏览器存储后重试');}
      changed();
    }
    try{
      const result=await api<T>(path,{method,body:payload,headers:{'X-CSRF-Token':auth.csrf,'Idempotency-Key':pending.key}});
      localStorage.removeItem(storageKey);changed();return result;
    }catch(error){
      if(error instanceof HttpError&&error.status<500&&![401,403].includes(error.status)){localStorage.removeItem(storageKey);changed();}
      throw error;
    }
  });
}
export function retryWebCommand<T>(auth:CommandAuth,pending:PendingCommand):Promise<T>{
  if(pending.owner!==auth.user.id)throw new Error('请使用原账户核对');
  if(pending.sensitive)throw new Error('口令不会保存到本机。请回到账号表单重新输入原临时口令，使用原操作编号核对。');
  return webCommand<T>(auth,pending.path,pending.method,JSON.parse(pending.payload) as object);
}
export async function resolvePasswordCommand(auth:CommandAuth,pending:PendingCommand):Promise<{previousState:string;id?:string}>{
 if(pending.owner!==auth.user.id||!pending.sensitive)throw new Error('只能核对本人待处理口令操作');
 const kind=pending.path==='/users'?'create':/^\/operations\/users\/[1-9]\d*\/reset$/.test(pending.path)?'reset':null;
 if(!kind)throw new Error('请回到原表单核对此操作');
 const result=await webCommand<{previousState:string;id?:string}>(auth,'/operations/password-commands/'+pending.key+'/resolve','POST',{kind});
 const storageKey=keyFor(auth.user.id,pending.method,pending.path);
 // Remove only the very command that the server has resolved.
 const current=read(storageKey);if(current?.key===pending.key){localStorage.removeItem(storageKey);changed();}
 return result;
}
