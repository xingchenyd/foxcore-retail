import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {RowDataPacket} from 'mysql2/promise';
import {pool,rows,first,exec,tx,type Db} from './db.js';
import {actor,writable,type Actor} from './auth.js';
import {audit,bad,body,command,conflict,id,missing,money,nonempty,requireKey} from './core.js';
import {inputLines as saleLines,prepareSaleInTx,postSaleInTx} from './sales.js';
import {inputLines as refundLines,authorizeReturnInTx,postReturnInTx} from './returns.js';
import {assertReturnWindow,cashOpen} from './business.js';
import {listPage} from './pagination.js';
const param=(req:FastifyRequest)=>(req.params as Record<string,string>);
async function write<T>(req:FastifyRequest,op:string,fields:string[],fn:(db:Db,a:Actor,d:Record<string,unknown>)=>Promise<T>){const a=await actor(req);writable(req,a);const d=body(req.body,fields),key=requireKey(req.headers['idempotency-key']);return tx(db=>command(db,a.id,op,key,{...d,...req.params as object},()=>fn(db,a,d)));}
async function lockEvents(db:Db,ids:string[]){for(const key of [...new Set(ids)].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1))if(!await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[key]))throw missing();}
async function lockedExchange(db:Db,key:string){
 const pre=await first<RowDataPacket>(db,'SELECT x.*,s.event_id AS old_event,n.event_id AS new_event FROM exchanges x JOIN sales s ON s.id=x.original_sale_id JOIN sales n ON n.id=x.new_sale_id WHERE x.id=?',[key]);if(!pre)throw missing();
 const destination=await first<RowDataPacket>(db,'SELECT b.event_id FROM returns r JOIN stock_locations l ON l.id=r.destination_location_id LEFT JOIN booths b ON b.id=l.booth_id WHERE r.id=?',[pre.return_id]);
 await lockEvents(db,[pre.old_event,pre.new_event,...(destination?.event_id?[destination.event_id]:[])]);
 const x=await first<RowDataPacket>(db,'SELECT * FROM exchanges WHERE id=? FOR UPDATE',[key]);if(!x||x.state!=='PREPARED')throw conflict('换货单已处理');return x;
}
export function registerExchanges(app:FastifyInstance){
 app.get('/api/v1/exchanges',async req=>{await actor(req);return listPage('SELECT x.*,sh.salesperson_id AS handler_person_id FROM exchanges x JOIN sales s ON s.id=x.new_sale_id JOIN shifts sh ON sh.id=s.shift_id ORDER BY x.id DESC',[],req.query as Record<string,unknown>,100);});
 app.get('/api/v1/exchanges/:id',async req=>{await actor(req);const key=id(param(req).id),db=await pool.getConnection();try{const x=await first<RowDataPacket>(db,'SELECT * FROM exchanges WHERE id=?',[key]);if(!x)throw missing();return {exchange:x,returned:await rows<RowDataPacket>(db,'SELECT rl.line_no,rl.sale_line_no,rl.quantity,rl.disposition,rl.net_cents,rl.tax_cents,p.name FROM return_lines rl JOIN sale_lines sl ON sl.sale_id=? AND sl.line_no=rl.sale_line_no JOIN products p ON p.id=sl.product_id WHERE rl.return_id=? ORDER BY rl.line_no',[x.original_sale_id,x.return_id]),outgoing:await rows<RowDataPacket>(db,'SELECT line_no,quantity,final_unit_price_cents,line_net_cents,line_tax_cents,name_snapshot FROM sale_lines WHERE sale_id=? ORDER BY line_no',[x.new_sale_id])};}finally{db.release();}});
 app.post('/api/v1/exchanges',req=>write(req,'exchange.prepare',['originalSaleId','shiftId','destinationLocationId','returnLines','newLines','reason'],async(db,a,d)=>{
  const oldId=id(d.originalSaleId),shiftId=id(d.shiftId),dest=id(d.destinationLocationId),reason=nonempty(d.reason,500),incoming=refundLines(d.returnLines),outgoing=saleLines(d.newLines);
  if(incoming.some(x=>x.disposition!=='RESTOCK'))throw bad('损坏商品不能换货');
  const oldPre=await first<RowDataPacket>(db,'SELECT * FROM sales WHERE id=?',[oldId]),shPre=await first<RowDataPacket>(db,'SELECT s.*,e.currency,e.price_basis,e.return_days FROM shifts s JOIN events e ON e.id=s.event_id WHERE s.id=?',[shiftId]),loc=await first<RowDataPacket>(db,'SELECT b.event_id FROM stock_locations l LEFT JOIN booths b ON b.id=l.booth_id WHERE l.id=?',[dest]);if(!oldPre||!shPre||!loc)throw missing();
  await lockEvents(db,[oldPre.event_id,shPre.event_id,...(loc.event_id?[loc.event_id]:[])]);
  const old=await first<RowDataPacket>(db,'SELECT * FROM sales WHERE id=? FOR UPDATE',[oldId]);if(!old||old.state!=='POSTED')throw conflict('必须关联已成交原单');assertReturnWindow(old);
  if(old.currency!==shPre.currency)throw conflict('换货不能混合不同货币');if(a.role!=='OWNER'&&shPre.salesperson_id!==a.salespersonId)throw missing();
  const created=await exec(db,'INSERT INTO exchanges(original_sale_id,currency,created_by) VALUES(?,?,?)',[oldId,old.currency,a.id]),key=String(created.insertId);
  const ret=await exec(db,'INSERT INTO returns(sale_id,reason,destination_location_id,created_by,exchange_id) VALUES(?,?,?,?,?)',[oldId,reason,dest,a.id,key]),returnId=String(ret.insertId);
  for(const [i,line]of incoming.entries())await exec(db,"INSERT INTO return_lines(return_id,line_no,sale_line_no,quantity,disposition) VALUES(?,?,?,?,'RESTOCK')",[returnId,i+1,line.lineNo,line.quantity]);
  const ns=await exec(db,'INSERT INTO sales(shift_id,event_id,created_by,currency,price_basis,return_days,exchange_id) VALUES(?,?,?,?,?,?,?)',[shiftId,shPre.event_id,a.id,shPre.currency,shPre.price_basis,shPre.return_days,key]),newSale=String(ns.insertId);
  for(const [i,line]of outgoing.entries())await exec(db,'INSERT INTO sale_lines(sale_id,line_no,product_id,quantity,final_unit_price_cents) VALUES(?,?,?,?,?)',[newSale,i+1,line.productId,line.quantity,String(line.unitCents)]);
  // One transaction reuses the same money, cumulative-return and reservation use cases.
  const refund=await authorizeReturnInTx(db,a,returnId,key),sale=await prepareSaleInTx(db,a,newSale,{version:1},key),difference=BigInt(sale.totalCents)-BigInt(refund.totalCents);
  await exec(db,'UPDATE exchanges SET return_id=?,new_sale_id=?,difference_cents=? WHERE id=?',[returnId,newSale,String(difference),key]);await audit(db,a.id,'EXCHANGE_PREPARED','EXCHANGE',key,{originalSaleId:oldId,returnId,newSaleId:newSale,differenceCents:String(difference)});return {id:key,state:'PREPARED',returnId,newSaleId:newSale,differenceCents:String(difference),currency:old.currency};
 }));
 app.post('/api/v1/exchanges/:id/post',req=>write(req,'exchange.post',['paymentMethod','paymentReference','cashReceived','paymentConfirmed','goodsConfirmed'],async(db,a,d)=>{
  const key=id(param(req).id),x=await lockedExchange(db,key);if(d.paymentConfirmed!==true||d.goodsConfirmed!==true)throw bad('须确认退入、换出商品与线下差价均已核对');const diff=BigInt(x.difference_cents),method=d.paymentMethod;if(method!=='CASH'&&method!=='TERMINAL')throw bad('差价结算方式无效');const reference=nonempty(d.paymentReference,120);
  const ns=await first<RowDataPacket>(db,'SELECT shift_id FROM sales WHERE id=?',[x.new_sale_id]);if(!ns)throw missing();if(method==='CASH')await cashOpen(db,String(ns.shift_id));let received:null|bigint=null;if(method==='CASH'&&diff>0n){received=money(d.cashReceived);if(received<diff||received>9_000_000_000_000n)throw bad('实收差价不足或超过上限');}
  await postReturnInTx(db,a,String(x.return_id),'EX-'+key+':'+reference,undefined,key);
  await postSaleInTx(db,a,String(x.new_sale_id),{paymentMethod:'EXCHANGE',paymentReference:'EX-'+key+':'+reference},key);
  await exec(db,"UPDATE exchanges SET state='POSTED',payment_method=?,payment_reference=?,cash_received_cents=?,posted_at=UTC_TIMESTAMP(3) WHERE id=?",[method,reference,received===null?null:String(received),key]);await audit(db,a.id,'EXCHANGE_POSTED','EXCHANGE',key,{differenceCents:String(diff),method,reference});return {id:key,state:'POSTED',differenceCents:String(diff),changeCents:received===null?null:String(received-diff)};
 }));
 app.post('/api/v1/exchanges/:id/cancel',req=>write(req,'exchange.cancel',['reason','paymentReconciled','goodsRecovered'],async(db,a,d)=>{
  const key=id(param(req).id),x=await lockedExchange(db,key),reason=nonempty(d.reason,500);if(d.paymentReconciled!==true||d.goodsRecovered!==true)throw bad('须确认差价未执行或已处理，商品均已收回');
  const sale=await first<RowDataPacket>(db,"SELECT state FROM sales WHERE id=? FOR UPDATE",[x.new_sale_id]),ret=await first<RowDataPacket>(db,'SELECT state FROM returns WHERE id=? FOR UPDATE',[x.return_id]);if(sale?.state!=='CHECKOUT'||ret?.state!=='AUTHORIZED')throw conflict('关联单据状态异常，请核对');
  const holds=await rows<RowDataPacket>(db,"SELECT * FROM stock_holds WHERE sale_id=? AND status='ACTIVE' ORDER BY product_id FOR UPDATE",[x.new_sale_id]);for(const h of holds){await exec(db,'UPDATE stock_balances SET reserved=reserved-?,version=version+1 WHERE location_id=? AND product_id=?',[h.quantity,h.location_id,h.product_id]);await exec(db,"UPDATE stock_holds SET status='RELEASED' WHERE sale_id=? AND line_no=?",[x.new_sale_id,h.line_no]);}
  await exec(db,"UPDATE sales SET state='CANCELLED',version=version+1 WHERE id=?",[x.new_sale_id]);await exec(db,"UPDATE returns SET state='CANCELLED' WHERE id=?",[x.return_id]);await exec(db,"UPDATE exchanges SET state='CANCELLED' WHERE id=?",[key]);await audit(db,a.id,'EXCHANGE_CANCELLED','EXCHANGE',key,{reason,returnId:x.return_id,newSaleId:x.new_sale_id});return {id:key,state:'CANCELLED'};
 }));
}
