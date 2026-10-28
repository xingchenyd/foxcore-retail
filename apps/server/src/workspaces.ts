import type {Db} from './db.js';
import {exec,first} from './db.js';
import type {RowDataPacket} from 'mysql2/promise';
import {bad,conflict} from './core.js';

/** Consume a cross-device draft in the same transaction as the saved sale.
 * A second device with the old revision must not open another sale from it.
 * Keep the complete revision history; consumption is another revision.
 */
export async function consumeWorkspace(db:Db,ownerId:string,key:string,revision:unknown):Promise<void>{
 if(revision===undefined)return;
 if(!Number.isSafeInteger(revision)||Number(revision)<1)throw bad('云端草稿版本无效');
 await first<RowDataPacket>(db,'SELECT id FROM users WHERE id=? FOR UPDATE',[ownerId]);
 const row=await first<RowDataPacket>(db,'SELECT revision,payload_json FROM sale_workspaces WHERE owner_id=? AND workspace_key=? FOR UPDATE',[ownerId,key]);
 if(!row||row.revision!==revision||JSON.parse(row.payload_json)===null)throw conflict('云端草稿已被另一设备更新或保存为单据，请刷新核对');
 const next=Number(revision)+1;
 await exec(db,"UPDATE sale_workspaces SET revision=?,payload_json='null',updated_at=UTC_TIMESTAMP(3) WHERE owner_id=? AND workspace_key=?",[next,ownerId,key]);
 await exec(db,"INSERT INTO sale_workspace_revisions(owner_id,workspace_key,revision,payload_json) VALUES(?,?,?,'null')",[ownerId,key,next]);
}
