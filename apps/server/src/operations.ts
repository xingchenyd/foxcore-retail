import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {RowDataPacket} from 'mysql2/promise';
import {DateTime} from 'luxon';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {actor,owner,writable,passwordOptions,type Actor} from './auth.js';
import {pool,rows,first,exec,tx,type Db} from './db.js';
import {audit,bad,body,command,conflict,hash,id,missing,money,nonempty,positiveInt,requireKey} from './core.js';
import {listPage} from './pagination.js';
import {settings} from './business.js';

type Data=Record<string,unknown>;
const param=(req:FastifyRequest)=>(req.params as Record<string,string>);
const amount=(value:unknown)=>{const n=money(value);if(n>9_000_000_000_000n)throw bad('金额超过上限');return n;};
const count=(value:unknown)=>{if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>1000000)throw bad('数量须为 0–1000000 的整数');return Number(value);};
async function write<T>(req:FastifyRequest,operation:string,fields:string[],fn:(db:Db,a:Actor,d:Data)=>Promise<T>,admin=false){
 const a=await actor(req);if(admin)owner(a);writable(req,a);const d=body(req.body??{},fields),key=requireKey(req.headers['idempotency-key']);
 const payload={params:req.params,data:d.password?{...d,password:hash(String(d.password))}:d};
 return tx(db=>command(db,a.id,operation,key,payload,()=>fn(db,a,d)));
}
async function stockContext(db:Db,locationIds:string[],productId:string){
 const locations=await rows<RowDataPacket>(db,'SELECT l.*,b.event_id,e.status AS event_status FROM stock_locations l LEFT JOIN booths b ON b.id=l.booth_id LEFT JOIN events e ON e.id=b.event_id WHERE l.id IN ('+locationIds.map(()=>'?').join(',')+')',locationIds);
 if(locations.length!==new Set(locationIds).size||locations.some(l=>!l.active||['CLOSED','CANCELLED'].includes(l.event_status)))throw conflict('来源或目标库位不可用，活动可能已结束');
 for(const eventId of [...new Set(locations.map(l=>l.event_id).filter(Boolean))].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)){const e=await first<RowDataPacket>(db,'SELECT status FROM events WHERE id=? FOR UPDATE',[eventId]);if(!e||['CLOSED','CANCELLED'].includes(e.status))throw conflict('来源或目标活动已结束');}
 if(!await first<RowDataPacket>(db,'SELECT id FROM products WHERE id=? FOR UPDATE',[productId]))throw missing();
 return locations;
}
async function document(db:Db,a:Actor,kind:string,product:string,quantity:number,from:string|null,to:string|null,reason:string){
 const result=await exec(db,'INSERT INTO stock_documents(kind,from_location_id,to_location_id,reason,created_by) VALUES(?,?,?,?,?)',[kind,from,to,reason,a.id]);const doc=String(result.insertId);
 await exec(db,'INSERT INTO stock_document_lines(document_id,line_no,product_id,quantity) VALUES(?,1,?,?)',[doc,product,quantity]);return doc;
}
async function move(db:Db,location:string,product:string,delta:number,doc:string){
 if(!delta)return;
 let b=await first<RowDataPacket>(db,'SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE',[location,product]);
 if(!b){await exec(db,'INSERT INTO stock_balances(location_id,product_id) VALUES(?,?)',[location,product]);b={on_hand:'0',reserved:'0'} as RowDataPacket;}
 const next=BigInt(b.on_hand)+BigInt(delta);if(next<BigInt(b.reserved))throw conflict('可售库存不足或已占用');
 await exec(db,'UPDATE stock_balances SET on_hand=?,version=version+1 WHERE location_id=? AND product_id=?',[String(next),location,product]);
 await exec(db,"INSERT INTO stock_ledger(location_id,product_id,delta,source_kind,source_id,source_line_no) VALUES(?,?,?,'DOCUMENT',?,1)",[location,product,delta,doc]);
}
async function locationCode(db:Db,code:string){const l=await first<RowDataPacket>(db,'SELECT id FROM stock_locations WHERE code=?',[code]);if(!l)throw missing();return String(l.id);}
async function shiftLocked(db:Db,value:unknown,a:Actor,own=false){
 const shiftId=id(value),pre=await first<RowDataPacket>(db,'SELECT event_id FROM shifts WHERE id=?',[shiftId]);if(!pre)throw missing();
 await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[pre.event_id]);
 const sh=await first<RowDataPacket>(db,'SELECT s.*,e.currency,e.business_timezone,e.end_date,e.status AS event_status,e.return_days FROM shifts s JOIN events e ON e.id=s.event_id WHERE s.id=? FOR UPDATE',[shiftId]);if(!sh)throw missing();
 if(own&&a.role!=='OWNER'&&sh.salesperson_id!==a.salespersonId)throw missing();return sh;
}
export async function expectedCash(db:Db,shiftId:string){
 const sh=await first<RowDataPacket>(db,'SELECT opening_cash_cents FROM shifts WHERE id=?',[shiftId]);if(!sh)throw missing();
 const sales=await first<RowDataPacket>(db,"SELECT COALESCE(SUM(total_cents),0) n FROM sales WHERE shift_id=? AND state='POSTED' AND payment_method='CASH'",[shiftId]);
 const refunds=await first<RowDataPacket>(db,"SELECT COALESCE(SUM(total_cents),0) n FROM returns WHERE cash_shift_id=? AND state='POSTED'",[shiftId]);
 const exchanges=await first<RowDataPacket>(db,"SELECT COALESCE(SUM(x.difference_cents),0) n FROM exchanges x JOIN sales s ON s.id=x.new_sale_id WHERE s.shift_id=? AND x.state='POSTED' AND x.payment_method='CASH'",[shiftId]);
 return BigInt(sh.opening_cash_cents)+BigInt(sales!.n)-BigInt(refunds!.n)+BigInt(exchanges!.n);
}

const lists:Record<string,string>={
 transfers:'SELECT t.*,p.name AS product_name,f.name AS from_name,l.name AS to_name FROM stock_transfers t JOIN products p ON p.id=t.product_id JOIN stock_locations f ON f.id=t.from_location_id JOIN stock_locations l ON l.id=t.to_location_id ORDER BY t.id DESC',
 damage:'SELECT d.*,p.name AS product_name FROM damage_records d JOIN products p ON p.id=d.product_id ORDER BY d.id DESC',
 handovers:'SELECT h.*,s.salesperson_id,s.event_id,e.currency FROM cash_handovers h JOIN shifts s ON s.id=h.shift_id JOIN events e ON e.id=s.event_id ORDER BY h.id DESC',
 extensions:'SELECT x.*,s.salesperson_id,s.planned_end FROM shift_extensions x JOIN shifts s ON s.id=x.shift_id ORDER BY x.id DESC',
 shifts:'SELECT s.*,e.name AS event_name,e.currency,b.location AS booth_location,sp.first_name,sp.last_name FROM shifts s JOIN events e ON e.id=s.event_id JOIN booths b ON b.id=s.booth_id JOIN salespeople sp ON sp.id=s.salesperson_id ORDER BY s.id DESC',
 people:'SELECT id,first_name,last_name,active,version FROM salespeople ORDER BY id DESC'
};
export function registerOperations(app:FastifyInstance){
 app.get('/api/v1/operations/settings',async req=>{await actor(req);const db=await pool.getConnection();try{return await settings(db);}finally{db.release();}});
 app.get('/api/v1/operations/:kind',async req=>{await actor(req);const sql=lists[param(req).kind];if(!sql)throw missing();return listPage(sql,[],req.query as Data,100);});
 app.get('/api/v1/operations/cash/:shiftId',async req=>{const a=await actor(req);return tx(async db=>{const sh=await shiftLocked(db,param(req).shiftId,a);return {shift:sh,expectedCents:String(await expectedCash(db,String(sh.id)))};});});
 app.post('/api/v1/operations/transfers',req=>write(req,'transfer.dispatch',['productId','fromLocationId','toLocationId','quantity','reason'],async(db,a,d)=>{
  const p=id(d.productId),from=id(d.fromLocationId),to=id(d.toLocationId),qty=positiveInt(d.quantity,1000000),reason=nonempty(d.reason,500);if(from===to)throw bad('起点与终点须不同');
  const locations=await stockContext(db,[from,to],p);if(locations.some(l=>!['WAREHOUSE','BOOTH'].includes(l.kind)))throw bad('正常调拨只允许主仓或展位');
  const transit=await exec(db,"INSERT INTO stock_locations(code,name,kind) VALUES(?,?,'TRANSIT')",['TRANSIT-'+randomUUID(),'在途调拨']);const transitId=String(transit.insertId);
  const result=await exec(db,'INSERT INTO stock_transfers(product_id,from_location_id,to_location_id,transit_location_id,quantity,reason,created_by) VALUES(?,?,?,?,?,?,?)',[p,from,to,transitId,qty,reason,a.id]);const transfer=String(result.insertId);
  const doc=await document(db,a,'DISPATCH',p,qty,from,transitId,reason);await move(db,from,p,-qty,doc);await move(db,transitId,p,qty,doc);await audit(db,a.id,'TRANSFER_DISPATCHED','TRANSFER',transfer,{documentId:doc});return {id:transfer,state:'DISPATCHED'};
 }));
 app.post('/api/v1/operations/transfers/:id/receive',req=>write(req,'transfer.receive',['receivedQuantity','damagedQuantity','missingQuantity','reason','version'],async(db,a,d)=>{
  const key=id(param(req).id),pre=await first<RowDataPacket>(db,'SELECT * FROM stock_transfers WHERE id=?',[key]);if(!pre)throw missing();
  await stockContext(db,[pre.from_location_id,pre.to_location_id],pre.product_id);
  const t=await first<RowDataPacket>(db,'SELECT * FROM stock_transfers WHERE id=? FOR UPDATE',[key]);if(!t||t.state!=='DISPATCHED'||t.version!==d.version)throw conflict('调拨已变化或已经接收');
  const good=count(d.receivedQuantity),damaged=count(d.damagedQuantity),missingQty=count(d.missingQuantity),reason=nonempty(d.reason,500);if(good+damaged+missingQty!==t.quantity)throw bad('良品、损坏和短缺合计须等于发出数量');
  const doc=await document(db,a,'ACCEPT',t.product_id,t.quantity,t.transit_location_id,t.to_location_id,reason);await move(db,t.transit_location_id,t.product_id,-t.quantity,doc);await move(db,t.to_location_id,t.product_id,good,doc);
  if(damaged){await move(db,await locationCode(db,'DAMAGED'),t.product_id,damaged,doc);await exec(db,'INSERT INTO damage_records(product_id,quantity,reason,created_by) VALUES(?,?,?,?)',[t.product_id,damaged,'调拨 #'+key+' 接收损坏：'+reason,a.id]);}
  await exec(db,"UPDATE stock_transfers SET state='RECEIVED',received_quantity=?,damaged_quantity=?,missing_quantity=?,receiving_note=?,received_by=?,received_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=?",[good,damaged,missingQty,reason,a.id,key]);await audit(db,a.id,'TRANSFER_RECEIVED','TRANSFER',key,{good,damaged,missingQuantity:missingQty,documentId:doc});return {id:key,state:'RECEIVED'};
 }));
 app.post('/api/v1/operations/transfers/:id/cancel',req=>write(req,'transfer.recall',['reason','goodsRecovered','version'],async(db,a,d)=>{
  const key=id(param(req).id),pre=await first<RowDataPacket>(db,'SELECT * FROM stock_transfers WHERE id=?',[key]);if(!pre)throw missing();await stockContext(db,[pre.from_location_id,pre.to_location_id],pre.product_id);
  const t=await first<RowDataPacket>(db,'SELECT * FROM stock_transfers WHERE id=? FOR UPDATE',[key]);if(!t||t.state!=='DISPATCHED'||t.version!==d.version)throw conflict('调拨已变化或无法撤回');if(d.goodsRecovered!==true)throw bad('须确认实物已收回来源库位');
  const reason=nonempty(d.reason,500),doc=await document(db,a,'RECALL',t.product_id,t.quantity,t.transit_location_id,t.from_location_id,reason);await move(db,t.transit_location_id,t.product_id,-t.quantity,doc);await move(db,t.from_location_id,t.product_id,t.quantity,doc);await exec(db,"UPDATE stock_transfers SET state='CANCELLED',version=version+1 WHERE id=?",[key]);await audit(db,a.id,'TRANSFER_RECALLED','TRANSFER',key,{reason});return {id:key,state:'CANCELLED'};
 }));
 app.post('/api/v1/operations/damage',req=>write(req,'damage.record',['productId','locationId','quantity','reason'],async(db,a,d)=>{
  const p=id(d.productId),from=id(d.locationId),qty=positiveInt(d.quantity,1000000),reason=nonempty(d.reason,500),locs=await stockContext(db,[from],p);if(!['WAREHOUSE','BOOTH'].includes(locs[0].kind))throw bad('请选择正常可售库存来源');
  const target=await locationCode(db,'DAMAGED'),doc=await document(db,a,'DAMAGE',p,qty,from,target,reason);await move(db,from,p,-qty,doc);await move(db,target,p,qty,doc);const r=await exec(db,'INSERT INTO damage_records(product_id,quantity,reason,created_by) VALUES(?,?,?,?)',[p,qty,reason,a.id]);await audit(db,a.id,'DAMAGE_RECORDED','DAMAGE',String(r.insertId),{documentId:doc});return {id:String(r.insertId)};
 }));
 app.post('/api/v1/operations/damage/:id/process',req=>write(req,'damage.process',['action','quantity','reason','version'],async(db,a,d)=>{
  const key=id(param(req).id),pre=await first<RowDataPacket>(db,'SELECT product_id FROM damage_records WHERE id=?',[key]);if(!pre)throw missing();await first<RowDataPacket>(db,'SELECT id FROM products WHERE id=? FOR UPDATE',[pre.product_id]);
  const record=await first<RowDataPacket>(db,'SELECT * FROM damage_records WHERE id=? FOR UPDATE',[key]);if(!record||record.version!==d.version)throw conflict('损坏记录已变化');const qty=positiveInt(d.quantity,1000000),reason=nonempty(d.reason,500);if(qty>record.quantity-record.repaired_quantity-record.disposed_quantity)throw conflict('处理数量超过剩余损坏数量');if(!['REPAIR','DISPOSE'].includes(String(d.action)))throw bad('处理方式无效');
  const from=await locationCode(db,'DAMAGED'),to=d.action==='REPAIR'?await locationCode(db,'MAIN'):null,doc=await document(db,a,String(d.action),record.product_id,qty,from,to,reason);await move(db,from,record.product_id,-qty,doc);if(to)await move(db,to,record.product_id,qty,doc);
  const field=d.action==='REPAIR'?'repaired_quantity':'disposed_quantity';await exec(db,`UPDATE damage_records SET ${field}=${field}+?,version=version+1 WHERE id=?`,[qty,key]);await audit(db,a.id,'DAMAGE_'+d.action,'DAMAGE',key,{quantity:qty,reason,documentId:doc});return {id:key};
 }));
 app.post('/api/v1/operations/handovers',req=>write(req,'cash.submit',['shiftId','actualCash','reason','version'],async(db,a,d)=>{
  const sh=await shiftLocked(db,d.shiftId,a,true);if(!['ACTIVE','CLOSED'].includes(sh.status))throw conflict('班次尚未开始');
  const pending=await first<RowDataPacket>(db,"SELECT id FROM sales WHERE shift_id=? AND state IN ('DRAFT','CHECKOUT') LIMIT 1",[sh.id]);if(pending)throw conflict('先处理班次内草稿及待收款销售');
  const old=await first<RowDataPacket>(db,'SELECT * FROM cash_handovers WHERE shift_id=? FOR UPDATE',[sh.id]);if(old&&(old.state!=='RETURNED'||old.version!==d.version))throw conflict('交班已提交或版本已变化');
  const expected=await expectedCash(db,String(sh.id)),actual=amount(d.actualCash),reason=nonempty(d.reason,500),difference=actual-expected;let resultId:string;
  if(old){await exec(db,"UPDATE cash_handovers SET expected_cents=?,actual_cents=?,difference_cents=?,reason=?,state='SUBMITTED',submitted_by=?,reviewed_by=NULL,reviewed_at=NULL,version=version+1 WHERE id=?",[String(expected),String(actual),String(difference),reason,a.id,old.id]);resultId=String(old.id);}else{const r=await exec(db,'INSERT INTO cash_handovers(shift_id,expected_cents,actual_cents,difference_cents,reason,submitted_by) VALUES(?,?,?,?,?,?)',[sh.id,String(expected),String(actual),String(difference),reason,a.id]);resultId=String(r.insertId);}
  await audit(db,a.id,'CASH_HANDOVER_SUBMITTED','HANDOVER',resultId,{expectedCents:String(expected),actualCents:String(actual),differenceCents:String(difference),reason});return {id:resultId,state:'SUBMITTED',expectedCents:String(expected),differenceCents:String(difference)};
 }));
 app.post('/api/v1/operations/handovers/:id/review',req=>write(req,'cash.review',['decision','reason','version'],async(db,a,d)=>{
  const key=id(param(req).id),h=await first<RowDataPacket>(db,'SELECT * FROM cash_handovers WHERE id=? FOR UPDATE',[key]);if(!h||h.state!=='SUBMITTED'||h.version!==d.version)throw conflict('交班已变化');if(!['VERIFIED','RETURNED'].includes(String(d.decision)))throw bad('核对结果无效');const reason=nonempty(d.reason,500);await exec(db,'UPDATE cash_handovers SET state=?,reviewed_by=?,review_note=?,reviewed_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=?',[d.decision,a.id,reason,key]);await audit(db,a.id,'CASH_HANDOVER_'+d.decision,'HANDOVER',key,{reason});return {id:key,state:d.decision};
 },true));
 app.post('/api/v1/operations/extensions',req=>write(req,'shift.extension.request',['shiftId','proposedEnd','reason'],async(db,a,d)=>{
  const sh=await shiftLocked(db,d.shiftId,a,true),end=DateTime.fromISO(nonempty(d.proposedEnd,80),{setZone:true});if(!end.isValid||!/(Z|[+-]\d\d:\d\d)$/.test(String(d.proposedEnd)))throw bad('结束时间须带时区偏移');if(sh.status!=='ACTIVE'||sh.event_status!=='OPEN')throw conflict('只能申请延长进行中班次');if(end.toMillis()<=Date.parse(sh.planned_end.replace(' ','T')+'Z'))throw bad('新结束时间须晚于原结束时间');
  if(await first<RowDataPacket>(db,"SELECT id FROM shift_extensions WHERE shift_id=? AND state='PENDING'",[sh.id]))throw conflict('已有待审批延期申请');const reason=nonempty(d.reason,500),r=await exec(db,'INSERT INTO shift_extensions(shift_id,proposed_end,reason,requested_by,base_version) VALUES(?,?,?,?,?)',[sh.id,end.toUTC().toFormat('yyyy-LL-dd HH:mm:ss.SSS'),reason,a.id,sh.version]);await audit(db,a.id,'SHIFT_EXTENSION_REQUESTED','SHIFT_EXTENSION',String(r.insertId),{shiftId:sh.id});return {id:String(r.insertId),state:'PENDING'};
 }));
 app.post('/api/v1/operations/extensions/:id/review',req=>write(req,'shift.extension.review',['decision','reason'],async(db,a,d)=>{
  const key=id(param(req).id),pre=await first<RowDataPacket>(db,'SELECT shift_id FROM shift_extensions WHERE id=?',[key]);if(!pre)throw missing();const sh=await shiftLocked(db,pre.shift_id,a);await first<RowDataPacket>(db,'SELECT id FROM salespeople WHERE id=? FOR UPDATE',[sh.salesperson_id]);const x=await first<RowDataPacket>(db,'SELECT * FROM shift_extensions WHERE id=? FOR UPDATE',[key]);if(!x||x.state!=='PENDING')throw conflict('延期申请已处理');if(!['APPROVED','REJECTED'].includes(String(d.decision)))throw bad('审批结果无效');
  if(d.decision==='APPROVED'){if(sh.status!=='ACTIVE'||sh.event_status!=='OPEN'||sh.version!==x.base_version)throw conflict('班次已变化，请重新申请');const day=DateTime.fromSQL(x.proposed_end,{zone:'utc'}).setZone(sh.business_timezone).toISODate();if(!day||day!==sh.business_date||day>sh.end_date)throw conflict('延期须位于原活动同一业务日期');if(await first<RowDataPacket>(db,"SELECT id FROM shifts WHERE salesperson_id=? AND id<>? AND status IN ('PLANNED','ACTIVE') AND planned_start<? AND planned_end>? LIMIT 1",[sh.salesperson_id,sh.id,x.proposed_end,sh.planned_start]))throw conflict('延期与其他班次重叠');await exec(db,'UPDATE shifts SET planned_end=?,version=version+1 WHERE id=?',[x.proposed_end,sh.id]);}
  const reason=nonempty(d.reason,500);await exec(db,'UPDATE shift_extensions SET state=?,reviewed_by=?,review_note=?,reviewed_at=UTC_TIMESTAMP(3) WHERE id=?',[d.decision,a.id,reason,key]);await audit(db,a.id,'SHIFT_EXTENSION_'+d.decision,'SHIFT_EXTENSION',key,{shiftId:sh.id,reason});return {id:key,state:d.decision};
 },true));
 app.post('/api/v1/operations/password-commands/:key/resolve',req=>write(req,'password.command.resolve',['kind'],async(db,a,d)=>{
  const key=requireKey(param(req).key),operation=d.kind==='create'?'user.create':d.kind==='reset'?'user.password.reset':null;if(!operation)throw bad('口令操作类型无效');
  // Reserve an absent old key, or wait for its transaction to finish. A delayed
  // abandoned request must never reset a password after the replacement succeeded.
  await exec(db,'INSERT IGNORE INTO idempotency_keys(actor_id,operation,command_key,request_hash,response_json) VALUES(?,?,?,?,?)',[a.id,operation,key,hash('abandoned-password-command'),JSON.stringify({abandoned:true})]);
  const previous=await first<RowDataPacket>(db,'SELECT response_json FROM idempotency_keys WHERE actor_id=? AND operation=? AND command_key=? FOR UPDATE',[a.id,operation,key]);
  const result=JSON.parse(previous!.response_json);await audit(db,a.id,'PASSWORD_COMMAND_RESOLVED','USER',result.id??null,{key,operation,previousState:result.abandoned?'ABANDONED':'COMMITTED'});return {previousState:result.abandoned?'ABANDONED':'COMMITTED',...(result.id?{id:result.id}:{})};
 },true));
 app.post('/api/v1/operations/users/:id/reset',req=>write(req,'user.password.reset',['password','reason'],async(db,a,d)=>{
  const key=id(param(req).id),password=nonempty(d.password,200),reason=nonempty(d.reason,500);if(password.length<16)throw bad('临时口令至少16字符');const user=await first<RowDataPacket>(db,'SELECT role FROM users WHERE id=? FOR UPDATE',[key]);if(!user||user.role!=='SALESPERSON')throw bad('此入口只用于员工临时口令，管理员恢复须走受控运维');await exec(db,'UPDATE users SET password_hash=?,must_change_password=TRUE,failed_logins=0,locked_until=NULL WHERE id=?',[await argon2.hash(password,passwordOptions),key]);await exec(db,'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=?',[key]);await audit(db,a.id,'USER_PASSWORD_RESET','USER',key,{reason});return {id:key,mustChangePassword:true};
 },true));
 app.get('/api/v1/operations/workspaces/:key',async req=>{const a=await actor(req),key=nonempty(param(req).key,80);if(!/^(new|sale-[1-9]\d*)$/.test(key))throw bad('草稿键无效');const db=await pool.getConnection();try{const w=await first<RowDataPacket>(db,'SELECT * FROM sale_workspaces WHERE owner_id=? AND workspace_key=?',[a.id,key]);return w?{revision:w.revision,payload:JSON.parse(w.payload_json),updatedAt:w.updated_at}:{revision:0,payload:null};}finally{db.release();}});
 app.post('/api/v1/operations/workspaces/:key',req=>write(req,'workspace.save',['revision','payload'],async(db,a,d)=>{
  const key=nonempty(param(req).key,80);if(!/^(new|sale-[1-9]\d*)$/.test(key)||!Number.isSafeInteger(d.revision)||Number(d.revision)<0)throw bad('草稿键或版本无效');const p=body(d.payload,['shiftId','saleId','version','lines']);if(!Array.isArray(p.lines)||p.lines.length>100)throw bad('草稿最多100行');
  if(typeof p.shiftId!=='string'||(p.shiftId!==''&&!/^[1-9]\d{0,18}$/.test(p.shiftId))||p.saleId!==(key==='new'?'':key.slice(5))||!Number.isSafeInteger(p.version)||Number(p.version)<1)throw bad('草稿班次、原单或版本无效');
  for(const line of p.lines){const x=body(line,['productId','name','sku','quantity','finalUnitPrice','minPrice','subtotal']);id(x.productId);for(const value of Object.values(x))if(typeof value!=='string'||value.length>200)throw bad('草稿字段须为有限文本');}
  if(key!=='new'){const sale=await first<RowDataPacket>(db,'SELECT sh.salesperson_id,sa.state FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.id=?',[key.slice(5)]);if(!sale||sale.state!=='DRAFT'||(a.role!=='OWNER'&&sale.salesperson_id!==a.salespersonId))throw missing();}
  await first<RowDataPacket>(db,'SELECT id FROM users WHERE id=? FOR UPDATE',[a.id]);const old=await first<RowDataPacket>(db,'SELECT revision FROM sale_workspaces WHERE owner_id=? AND workspace_key=? FOR UPDATE',[a.id,key]);if((old?.revision??0)!==d.revision)throw conflict('另一设备已更新云端草稿，请先刷新核对');const revision=Number(d.revision)+1;
  if(old)await exec(db,'UPDATE sale_workspaces SET payload_json=?,revision=?,updated_at=UTC_TIMESTAMP(3) WHERE owner_id=? AND workspace_key=?',[JSON.stringify(p),revision,a.id,key]);else await exec(db,'INSERT INTO sale_workspaces(owner_id,workspace_key,payload_json) VALUES(?,?,?)',[a.id,key,JSON.stringify(p)]);await exec(db,'INSERT INTO sale_workspace_revisions(owner_id,workspace_key,revision,payload_json) VALUES(?,?,?,?)',[a.id,key,revision,JSON.stringify(p)]);await audit(db,a.id,'WORKSPACE_SAVED','USER',a.id,{workspaceKey:key,revision});return {revision};
 }));
 const master:Record<string,{table:string;fields:string[]}>= {venues:{table:'venues',fields:['name','street','city','province','postal_code','description']},events:{table:'events',fields:['name','description']},people:{table:'salespeople',fields:['first_name','last_name','street','city','province','postal_code','phone','description']}};
 app.post('/api/v1/operations/master/:kind/:id',req=>write(req,'master.correct',['version','changes','reason'],async(db,a,d)=>{
  const target=master[param(req).kind];if(!target)throw missing();const key=id(param(req).id),changes=body(d.changes,target.fields),entries=Object.entries(changes);if(!entries.length)throw bad('没有修改字段');for(const [field,value]of entries){const mandatory=['name','first_name','last_name'].includes(field)||(param(req).kind==='venues'&&['street','city','province','postal_code'].includes(field));if(!mandatory&&(value===null||value==='')){changes[field]=null;continue;}nonempty(value,field==='description'?500:field==='phone'?32:field==='postal_code'?16:field==='name'||field==='street'?120:80);}
  const old=await first<RowDataPacket>(db,`SELECT * FROM ${target.table} WHERE id=? FOR UPDATE`,[key]);if(!old||old.version!==d.version)throw conflict('资料已变化，请刷新核对');const reason=nonempty(d.reason,500);await exec(db,`UPDATE ${target.table} SET ${entries.map(([field])=>field+'=?').join(',')},version=version+1 WHERE id=?`,[...entries.map(([field])=>changes[field]===null?null:String(changes[field]).trim()),key]);await audit(db,a.id,'MASTER_CORRECTED',target.table.toUpperCase(),key,{before:old,changes,reason});return {id:key,version:old.version+1};
 },true));
}
