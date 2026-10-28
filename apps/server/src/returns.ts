import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, exec, first, rows, tx, type Db } from './db.js';
import { actor, owner, writable, type Actor } from './auth.js';
import { audit, bad, body, command, conflict, halfUp, id, missing, nonempty, positiveInt, requireKey } from './core.js';

import { listPage } from './pagination.js';
import { lockReturnEvents, validateReturnTarget } from './return-target.js';
import {assertReturnWindow,cashOpen} from './business.js';

interface Sale extends RowDataPacket { id:string; state:string; event_id:string; salesperson_id:string }
interface SaleLine extends RowDataPacket { line_no:number; product_id:string; quantity:number; final_unit_price_cents:string; line_tax_cents:string; line_commission_cents:string }
interface ReturnRow extends RowDataPacket { id:string; sale_id:string; state:string; destination_location_id:string|null; net_cents:string; tax_cents:string; total_cents:string }
interface ReturnLine extends RowDataPacket { line_no:number; sale_line_no:number; quantity:number; disposition:string; net_cents:string; tax_cents:string; commission_cents:string }
const params=(req:FastifyRequest)=>req.params as Record<string,unknown>;
async function ownerWrite(req:FastifyRequest){const a=await actor(req);writable(req,a);return a;}
export function inputLines(value:unknown){
  if(!Array.isArray(value)||value.length<1||value.length>100) throw bad('退货须包含 1–100 行');
  const seen=new Set<number>(); return value.map(raw=>{const d=body(raw,['saleLineNo','quantity','disposition']); const lineNo=positiveInt(d.saleLineNo,100),quantity=positiveInt(d.quantity); if(seen.has(lineNo)) throw bad('重复原销售行');seen.add(lineNo);if(d.disposition!=='RESTOCK'&&d.disposition!=='DAMAGED') throw bad('退货去向无效');return {lineNo,quantity,disposition:d.disposition};});
}

export function registerReturns(app:FastifyInstance):void {
  app.get('/api/v1/returns',async req=>{await actor(req);return listPage('SELECT r.*,s.currency FROM returns r JOIN sales s ON s.id=r.sale_id ORDER BY r.id DESC',[],req.query as Record<string,unknown>,100);});
  app.get('/api/v1/returns/:id',async req=>{const a=await actor(req),returnId=id(params(req).id),db=await pool.getConnection();try{const r=await first<ReturnRow>(db,'SELECT r.*,s.currency,s.payment_method AS original_payment_method,sh.salesperson_id FROM returns r JOIN sales s ON s.id=r.sale_id JOIN shifts sh ON sh.id=s.shift_id WHERE r.id=?',[returnId]);if(!r)throw missing();const lines=await rows<ReturnLine>(db,'SELECT * FROM return_lines WHERE return_id=? ORDER BY line_no',[returnId]);if(a.role!=='OWNER'&&r.salesperson_id!==a.salespersonId)for(const line of lines)delete (line as RowDataPacket).commission_cents;return {return:r,lines};}finally{db.release();}});
  app.post('/api/v1/returns',async req=>{
    const a=await ownerWrite(req),d=body(req.body,['saleId','reason','destinationLocationId','lines']),saleId=id(d.saleId),reason=nonempty(d.reason,500),dest=id(d.destinationLocationId),lines=inputLines(d.lines),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'return.create',k,d,async()=>{
      const source=await first<RowDataPacket>(db,'SELECT event_id FROM sales WHERE id=?',[saleId]);if(!source) throw missing();
      const lockedEvents=await lockReturnEvents(db,String(source.event_id),dest);
      const sale=await first<Sale>(db,'SELECT sa.*,sh.salesperson_id FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.id=? FOR UPDATE',[saleId]);if(!sale||sale.state!=='POSTED') throw conflict('只能退已成交销售');
      assertReturnWindow(sale);if(sale.return_days!==null&&lines.some(x=>x.disposition==='DAMAGED'))throw conflict('损坏商品不能办理退款或换货，请使用损坏品管理');
      await validateReturnTarget(db,sale.event_id,dest,lockedEvents);
      const r=await exec(db,'INSERT INTO returns(sale_id,reason,destination_location_id,created_by) VALUES(?,?,?,?)',[saleId,reason,dest,a.id]);const returnId=String(r.insertId);
      for(const [i,line] of lines.entries()){
        const original=await first<SaleLine>(db,'SELECT * FROM sale_lines WHERE sale_id=? AND line_no=?',[saleId,line.lineNo]);if(!original) throw missing();
        await exec(db,'INSERT INTO return_lines(return_id,line_no,sale_line_no,quantity,disposition) VALUES(?,?,?,?,?)',[returnId,i+1,line.lineNo,line.quantity,line.disposition]);
      }
      await audit(db,a.id,'RETURN_DRAFT_CREATED','RETURN',returnId);return {id:returnId,state:'DRAFT'};
    }));
  });
  app.post('/api/v1/returns/:id/authorize',async req=>{
    const a=await ownerWrite(req),returnId=id(params(req).id),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'return.authorize',k,{returnId},()=>authorizeReturnInTx(db,a,returnId)));
  });
  app.post('/api/v1/returns/:id/post',async req=>{
    const a=await ownerWrite(req),returnId=id(params(req).id),d=body(req.body,['refundReference','cashShiftId','refundMethod']),reference=nonempty(d.refundReference,120),cashShiftId=d.cashShiftId===undefined?undefined:id(d.cashShiftId),refundMethod=d.refundMethod===undefined?undefined:nonempty(d.refundMethod,20),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'return.post',k,{returnId,reference,...(cashShiftId?{cashShiftId}:{}),...(refundMethod?{refundMethod}:{})},()=>postReturnInTx(db,a,returnId,reference,cashShiftId,undefined,refundMethod)));
  });
  app.post('/api/v1/returns/:id/cancel',async req=>{
    const a=await ownerWrite(req),returnId=id(params(req).id),d=body(req.body,['reason','refundReconciled']),reason=nonempty(d.reason,500),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'return.cancel',k,{returnId,...d},async()=>{
      const pre=await first<ReturnRow>(db,'SELECT * FROM returns WHERE id=?',[returnId]);if(!pre) throw missing();
      const source=await first<RowDataPacket>(db,'SELECT event_id FROM sales WHERE id=?',[pre.sale_id]);if(!source) throw missing();
      // Do not apply the target policy here: legacy invalid targets must remain cancellable.
      await lockReturnEvents(db,String(source.event_id),pre.destination_location_id);
      const r=await first<ReturnRow>(db,'SELECT * FROM returns WHERE id=? FOR UPDATE',[returnId]);if(!r||!['DRAFT','AUTHORIZED'].includes(r.state)) throw conflict('退货不可取消');if(r.exchange_id)throw conflict('请通过关联换货单取消');
      if(r.state==='AUTHORIZED'&&d.refundReconciled!==true) throw bad('须先确认线下退款未执行或已撤销');
      await exec(db,"UPDATE returns SET state='CANCELLED' WHERE id=?",[returnId]);await audit(db,a.id,'RETURN_CANCELLED','RETURN',returnId,{reason});return {id:returnId,state:'CANCELLED'};
    }));
  });
}

export async function authorizeReturnInTx(db:Db,a:Actor,returnId:string,exchangeId?:string) {

      const pre=await first<ReturnRow>(db,'SELECT * FROM returns WHERE id=?',[returnId]);if(!pre) throw missing();
      const source=await first<RowDataPacket>(db,'SELECT event_id FROM sales WHERE id=?',[pre.sale_id]);if(!source) throw missing();
      const lockedEvents=await lockReturnEvents(db,String(source.event_id),pre.destination_location_id);
      const sale=await first<Sale>(db,'SELECT sa.*,sh.salesperson_id FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.id=? FOR UPDATE',[pre.sale_id]);if(!sale||sale.state!=='POSTED') throw conflict('原销售状态无效');
      assertReturnWindow(sale);
      const r=await first<ReturnRow>(db,'SELECT * FROM returns WHERE id=? FOR UPDATE',[returnId]);if(!r||r.state!=='DRAFT') throw conflict('退货状态已变化');
      if(r.exchange_id&&String(r.exchange_id)!==exchangeId)throw conflict('关联换货单请通过换货流程办理');
      if(r.sale_id!==pre.sale_id||r.destination_location_id!==pre.destination_location_id) throw conflict('退货关联已变化，请核对后重试');
      await validateReturnTarget(db,sale.event_id,r.destination_location_id,lockedEvents);
      const other=await first<RowDataPacket>(db,"SELECT id FROM returns WHERE sale_id=? AND state='AUTHORIZED' AND id<>? LIMIT 1",[sale.id,returnId]);if(other) throw conflict('原销售已有待处理退款授权');
      const lines=await rows<ReturnLine>(db,'SELECT * FROM return_lines WHERE return_id=? ORDER BY sale_line_no FOR UPDATE',[returnId]);
      if(!lines.length) throw conflict('退货没有明细，请核对');
      let net=0n,tax=0n;
      for(const line of lines){
        const original=await first<SaleLine>(db,'SELECT * FROM sale_lines WHERE sale_id=? AND line_no=? FOR UPDATE',[sale.id,line.sale_line_no]);if(!original) throw missing();
        if(sale.return_days!==null&&line.disposition!=='RESTOCK')throw conflict('损坏商品不能办理退款或换货');
        const done=await first<RowDataPacket>(db,"SELECT COALESCE(SUM(rl.quantity),0) AS qty,COALESCE(SUM(rl.net_cents),0) AS net,COALESCE(SUM(rl.tax_cents),0) AS tax,COALESCE(SUM(rl.commission_cents),0) AS commission FROM return_lines rl JOIN returns r ON r.id=rl.return_id WHERE r.sale_id=? AND r.state='POSTED' AND rl.sale_line_no=?",[sale.id,line.sale_line_no]);
        const cumulative=BigInt(done?.qty??0)+BigInt(line.quantity);if(cumulative>BigInt(original.quantity)) throw conflict('退货数量超过原销售剩余数量');
        const lineNet=halfUp(BigInt(original.line_net_cents)*cumulative,BigInt(original.quantity))-BigInt(done?.net??0);
        const lineTax=halfUp(BigInt(original.line_tax_cents)*cumulative,BigInt(original.quantity))-BigInt(done?.tax??0);
        const lineCommission=halfUp(BigInt(original.line_commission_cents)*cumulative,BigInt(original.quantity))-BigInt(done?.commission??0);
        net+=lineNet;tax+=lineTax;
        await exec(db,'UPDATE return_lines SET net_cents=?,tax_cents=?,commission_cents=? WHERE return_id=? AND line_no=?',[String(lineNet),String(lineTax),String(lineCommission),returnId,line.line_no]);
      }
      await exec(db,"UPDATE returns SET state='AUTHORIZED',authorized_at=UTC_TIMESTAMP(3),net_cents=?,tax_cents=?,total_cents=? WHERE id=?",[String(net),String(tax),String(net+tax),returnId]);
      await audit(db,a.id,'RETURN_AUTHORIZED','RETURN',returnId,{totalCents:String(net+tax)});return {id:returnId,state:'AUTHORIZED',netCents:String(net),taxCents:String(tax),totalCents:String(net+tax)};
}

export async function postReturnInTx(db:Db,a:Actor,returnId:string,reference:string,cashShiftId?:string,exchangeId?:string,refundMethod?:string) {

      const pre=await first<ReturnRow>(db,'SELECT * FROM returns WHERE id=?',[returnId]);if(!pre) throw missing();
      const source=await first<RowDataPacket>(db,'SELECT event_id FROM sales WHERE id=?',[pre.sale_id]);if(!source) throw missing();
      const cashShift=cashShiftId?await first<RowDataPacket>(db,'SELECT sh.*,e.currency FROM shifts sh JOIN events e ON e.id=sh.event_id WHERE sh.id=?',[cashShiftId]):undefined;
      const lockedEvents=await lockReturnEvents(db,String(source.event_id),pre.destination_location_id,cashShift?[String(cashShift.event_id)]:[]);
      const sale=await first<Sale>(db,'SELECT sa.*,sh.salesperson_id FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.id=? FOR UPDATE',[pre.sale_id]);if(!sale||sale.state!=='POSTED') throw conflict('原销售状态无效');
      const r=await first<ReturnRow>(db,'SELECT * FROM returns WHERE id=? FOR UPDATE',[returnId]);if(!r||r.state!=='AUTHORIZED') throw conflict('退款授权不存在或已处理');
      if(r.exchange_id&&String(r.exchange_id)!==exchangeId)throw conflict('关联换货单请通过换货流程办理');
      const method=exchangeId?'EXCHANGE':refundMethod??(sale.payment_method==='EXCHANGE'?null:sale.payment_method);
      if(!method||!['CASH','TERMINAL','EXCHANGE'].includes(method)||(!exchangeId&&method==='EXCHANGE'))throw bad('请明确选择现金或原支付终端退款方式');
      if(!exchangeId&&method==='CASH'&&sale.return_days!==null){
        if(!cashShift||cashShift.status!=='ACTIVE'||cashShift.currency!==sale.currency||(a.role!=='OWNER'&&cashShift.salesperson_id!==a.salespersonId))throw conflict('现金退款须选择本人进行中班次，供交班核对');
        await cashOpen(db,String(cashShift.id));await exec(db,'UPDATE returns SET cash_shift_id=? WHERE id=?',[cashShift.id,returnId]);
      }
      if(r.sale_id!==pre.sale_id||r.destination_location_id!==pre.destination_location_id) throw conflict('退货关联已变化，请核对后重试');
      const lines=await rows<ReturnLine>(db,'SELECT * FROM return_lines WHERE return_id=? ORDER BY line_no FOR UPDATE',[returnId]);
      if(!lines.length) throw conflict('退货没有明细，请核对');
      // Match receiving/transfer product-before-location order, including first balance-row creation.
      const products=await rows<RowDataPacket>(db,'SELECT DISTINCT sl.product_id FROM return_lines rl JOIN sale_lines sl ON sl.sale_id=? AND sl.line_no=rl.sale_line_no WHERE rl.return_id=? ORDER BY sl.product_id',[sale.id,returnId]);
      for(const product of products) await first<RowDataPacket>(db,'SELECT id FROM products WHERE id=? FOR UPDATE',[product.product_id]);
      await validateReturnTarget(db,sale.event_id,r.destination_location_id,lockedEvents);
      for(const line of lines){
        const original=await first<SaleLine>(db,'SELECT * FROM sale_lines WHERE sale_id=? AND line_no=?',[sale.id,line.sale_line_no]);if(!original) throw missing();
        if(line.disposition==='RESTOCK'){
          const oldBalance=await first<RowDataPacket>(db,'SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE',[r.destination_location_id,original.product_id]);
          if(!oldBalance) await exec(db,'INSERT INTO stock_balances(location_id,product_id) VALUES(?,?)',[r.destination_location_id,original.product_id]);
          await exec(db,'UPDATE stock_balances SET on_hand=on_hand+?,version=version+1 WHERE location_id=? AND product_id=?',[line.quantity,r.destination_location_id,original.product_id]);
          await exec(db,"INSERT INTO stock_ledger(location_id,product_id,delta,source_kind,source_id,source_line_no) VALUES(?,?,?,?,?,?)",[r.destination_location_id,original.product_id,line.quantity,'RETURN',returnId,line.line_no]);
        }
        if(BigInt(line.commission_cents)>0n) await exec(db,"INSERT INTO commission_entries(salesperson_id,amount_cents,source_kind,source_id,source_line_no,currency) VALUES(?,?,?,?,?,?)",[sale.salesperson_id,String(-BigInt(line.commission_cents)),'RETURN',returnId,line.line_no,sale.currency]);
      }
      await exec(db,"UPDATE returns SET state='POSTED',posted_at=UTC_TIMESTAMP(3),refund_reference=?,refund_method=? WHERE id=?",[reference,method,returnId]);
      await audit(db,a.id,'RETURN_POSTED','RETURN',returnId,{reference});return {id:returnId,state:'POSTED',totalCents:r.total_cents};
}
