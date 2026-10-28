import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, exec, first, rows, tx } from './db.js';
import { actor, owner, writable } from './auth.js';
import { audit, bad, body, command, conflict, id, missing, nonempty, requireKey } from './core.js';

import { listPage } from './pagination.js';
import {currency,settings} from './business.js';

interface Settlement extends RowDataPacket { id:string; salesperson_id:string; state:string; total_cents:string }
const params=(req:FastifyRequest)=>req.params as Record<string,unknown>;
async function ownerWrite(req:FastifyRequest){const a=await actor(req);owner(a);writable(req,a);return a;}
export function registerCommissions(app:FastifyInstance):void {
  app.get('/api/v1/commissions/entries',async req=>{
    const a=await actor(req);return listPage('SELECT * FROM commission_entries'+(a.role==='OWNER'?'':' WHERE salesperson_id=?')+' ORDER BY id DESC',a.role==='OWNER'?[]:[a.salespersonId],req.query as Record<string,unknown>,100);
  });
  app.get('/api/v1/commissions/settlements',async req=>{
    const a=await actor(req);return listPage('SELECT * FROM commission_settlements'+(a.role==='OWNER'?'':' WHERE salesperson_id=?')+' ORDER BY id DESC',a.role==='OWNER'?[]:[a.salespersonId],req.query as Record<string,unknown>,100);
  });
  app.get('/api/v1/commissions/settlements/:id',async req=>{
    const a=await actor(req),settlementId=id(params(req).id),db=await pool.getConnection();
    try {
      const settlement=await first<Settlement>(db,'SELECT * FROM commission_settlements WHERE id=?',[settlementId]);
      if(!settlement||(a.role!=='OWNER'&&settlement.salesperson_id!==a.salespersonId))throw missing();
      const lines=await rows<RowDataPacket>(db,'SELECT sl.entry_id,sl.amount_cents,ce.source_kind,ce.source_id,ce.source_line_no FROM commission_settlement_lines sl JOIN commission_entries ce ON ce.id=sl.entry_id WHERE sl.settlement_id=? ORDER BY sl.entry_id',[settlementId]);
      return {settlement,lines};
    }finally{db.release();}
  });
  app.post('/api/v1/commissions/prepare',async req=>{
    const a=await ownerWrite(req),d=body(req.body,['salespersonId','currency']),salespersonId=id(d.salespersonId),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'commission.prepare',k,d,async()=>{
      const sp=await first<RowDataPacket>(db,'SELECT id FROM salespeople WHERE id=? FOR UPDATE',[salespersonId]);if(!sp) throw missing();
      const open=await first<RowDataPacket>(db,"SELECT id FROM commission_settlements WHERE salesperson_id=? AND state='PREPARED' LIMIT 1",[salespersonId]);if(open) throw conflict('员工已有待核对结算');
      const currencies=await rows<RowDataPacket>(db,'SELECT DISTINCT ce.currency FROM commission_entries ce LEFT JOIN commission_claims cc ON cc.entry_id=ce.id WHERE ce.salesperson_id=? AND cc.entry_id IS NULL',[salespersonId]);
      const cur=currency(d.currency??(currencies.length===1?currencies[0].currency:(await settings(db)).currency));
      const entries=await rows<RowDataPacket>(db,`SELECT ce.id,ce.amount_cents FROM commission_entries ce LEFT JOIN commission_claims cc ON cc.entry_id=ce.id WHERE ce.salesperson_id=? AND cc.entry_id IS NULL AND ce.currency=? AND EXISTS(SELECT 1 FROM sales sa JOIN events e ON e.id=sa.event_id WHERE ((ce.source_kind='SALE' AND sa.id=ce.source_id) OR (ce.source_kind='RETURN' AND sa.id=(SELECT sale_id FROM returns WHERE id=ce.source_id))) AND (sa.return_days IS NULL OR e.status='CLOSED')) ORDER BY ce.id FOR UPDATE`,[salespersonId,cur]);
      const total=entries.reduce((sum,e)=>sum+BigInt(e.amount_cents),0n);if(total<=0n) throw conflict('当前未结佣金余额不大于零');
      const r=await exec(db,"INSERT INTO commission_settlements(salesperson_id,cutoff_at,total_cents,created_by,currency) VALUES(?,UTC_TIMESTAMP(3),?,?,?)",[salespersonId,String(total),a.id,cur]);const settlementId=String(r.insertId);
      for(const e of entries){await exec(db,'INSERT INTO commission_settlement_lines(settlement_id,entry_id,amount_cents) VALUES(?,?,?)',[settlementId,e.id,e.amount_cents]);await exec(db,'INSERT INTO commission_claims(entry_id,settlement_id) VALUES(?,?)',[e.id,settlementId]);}
      await audit(db,a.id,'COMMISSION_PREPARED','SETTLEMENT',settlementId,{totalCents:String(total)});return {id:settlementId,state:'PREPARED',totalCents:String(total),entryCount:entries.length};
    }));
  });
  app.post('/api/v1/commissions/:id/pay',async req=>{
    const a=await ownerWrite(req),settlementId=id(params(req).id),d=body(req.body,['paymentReference']),reference=nonempty(d.paymentReference,120),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'commission.pay',k,{settlementId,reference},async()=>{
      const s=await first<Settlement>(db,'SELECT * FROM commission_settlements WHERE id=? FOR UPDATE',[settlementId]);if(!s||s.state!=='PREPARED') throw conflict('佣金结算不可付款登记');
      await exec(db,"UPDATE commission_settlements SET state='PAID',paid_at=UTC_TIMESTAMP(3),payment_reference=? WHERE id=?",[reference,settlementId]);await audit(db,a.id,'COMMISSION_PAID','SETTLEMENT',settlementId,{reference});return {id:settlementId,state:'PAID',totalCents:s.total_cents};
    }));
  });
  app.post('/api/v1/commissions/:id/cancel',async req=>{
    const a=await ownerWrite(req),settlementId=id(params(req).id),d=body(req.body,['reason','paymentReconciled']),reason=nonempty(d.reason,500),k=requireKey(req.headers['idempotency-key']);
    if(d.paymentReconciled!==true) throw bad('须确认线下付款未执行或已撤销');
    return tx(db=>command(db,a.id,'commission.cancel',k,{settlementId,...d},async()=>{
      const s=await first<Settlement>(db,'SELECT * FROM commission_settlements WHERE id=? FOR UPDATE',[settlementId]);if(!s||s.state!=='PREPARED') throw conflict('仅可取消未付款结算');
      await exec(db,'DELETE FROM commission_claims WHERE settlement_id=?',[settlementId]);await exec(db,"UPDATE commission_settlements SET state='CANCELLED' WHERE id=?",[settlementId]);await audit(db,a.id,'COMMISSION_CANCELLED','SETTLEMENT',settlementId,{reason});return {id:settlementId,state:'CANCELLED'};
    }));
  });
}
