import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {webCommand,type CommandAuth} from '../lib/commands.js';
export interface WorkspacePayload {shiftId:string;saleId:string;version:number;lines:Record<string,string>[]}
export function DraftWorkspace({auth,workspaceKey,payload,onLoad,onRevision}:{auth:CommandAuth;workspaceKey:string;payload:WorkspacePayload;onLoad:(value:WorkspacePayload)=>void;onRevision:(value:number|undefined)=>void}){
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setRevision(0);setMessage('');onRevision(undefined);let alive=true;api<{revision:number}>('/operations/workspaces/'+workspaceKey).then(r=>{if(alive)setRevision(r.revision);}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[workspaceKey]);
 async function load(){setBusy(true);try{const r=await api<{revision:number;payload:WorkspacePayload|null}>('/operations/workspaces/'+workspaceKey);if(r.payload&&!window.confirm('载入云端副本将替换当前编辑内容，请先保存需要保留的内容。继续？'))return;setRevision(r.revision);if(r.payload){onLoad(r.payload);onRevision(r.revision);setMessage('已载入云端副本，保存单据前仍会检查版本。');}else{onRevision(undefined);setMessage('云端没有待录入草稿，可能已在另一设备保存为单据。');}}catch(e){setMessage(e instanceof Error?e.message:'同步失败');}finally{setBusy(false);}}
 async function save(){setBusy(true);try{const r=await webCommand<{revision:number}>(auth,'/operations/workspaces/'+workspaceKey,'POST',{revision,payload});setRevision(r.revision);onRevision(r.revision);setMessage('已保存云端副本，可在同一账号的另一设备继续录入。');}catch(e){setMessage(e instanceof Error?e.message:'同步失败');}finally{setBusy(false);}}
 return <div className="draft-sync"><div><strong>跨设备草稿</strong><p className="small muted">仅本人账号可见。另一设备修改后会提示冲突，请核对后再保存。</p></div><div className="actions"><button type="button" disabled={busy} onClick={()=>void load()}>载入云端副本</button><button type="button" disabled={busy||!payload.lines.length||payload.lines.some(x=>!x.productId)} onClick={()=>void save()}>保存到云端</button></div>{message&&<p role="status">{message}</p>}</div>;
}
