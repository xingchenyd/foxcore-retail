import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { DateTime } from 'luxon';
import { pool, exec, first, rows, tx, type Db } from './db.js';
import { actor, owner, writable, type Actor } from './auth.js';
import { audit, bad, body, command, conflict, halfUp, id, missing, money, nonempty, positiveInt, requireKey } from './core.js';
import { listPage } from './pagination.js';

interface Sale extends RowDataPacket { id:string; shift_id:string; event_id:string; state:string; version:number; total_cents:string; net_cents:string; tax_cents:string; posted_at:string|null; sale_no:string|null; salesperson_id:string; booth_id:string; shift_status:string; event_status:string; planned_start:string; planned_end:string; actual_end:string|null; tax_bps:number|null; policy_confirmed:number; commission_bps:number|null }
interface Line extends RowDataPacket { sale_id:string; line_no:number; product_id:string; quantity:number; final_unit_price_cents:string; line_net_cents:string; line_tax_cents:string; line_commission_cents:string }
interface Product extends RowDataPacket { id:string; sku:string; name:string; wholesale_cost_cents:string; min_price_cents:string; active:number }
interface Balance extends RowDataPacket { on_hand:string; reserved:string }
const params=(req:FastifyRequest)=>req.params as Record<string,unknown>;
const nowSql=()=>DateTime.utc().toFormat('yyyy-LL-dd HH:mm:ss.SSS');
const saleSql=`SELECT sa.*,sh.salesperson_id,sh.booth_id,sh.status AS shift_status,sh.planned_start,sh.planned_end,sh.actual_end,e.status AS event_status,e.tax_bps,e.policy_confirmed,sp.commission_bps FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id JOIN events e ON e.id=sa.event_id JOIN salespeople sp ON sp.id=sh.salesperson_id WHERE sa.id=?`;
async function getSale(db:Db,saleId:string,lock=false):Promise<Sale> {const s=await first<Sale>(db,saleSql+(lock?' FOR UPDATE':''),[saleId]); if(!s) throw missing(); return s;}
function access(a:Actor,s:Sale):void {if(a.role==='SALESPERSON'&&a.salespersonId!==s.salesperson_id) throw missing();}
function verifyNew(s:Sale):void {
  const now=nowSql();
  if(s.shift_status!=='ACTIVE'||s.event_status!=='OPEN'||now<s.planned_start||now>=s.planned_end) throw conflict('活动或班次当前不可新建销售');
}
function inputLines(value:unknown):{productId:string;quantity:number;unitCents:bigint}[] {
  if(!Array.isArray(value)||value.length<1||value.length>100) throw bad('销售须包含 1–100 行商品');
  const seen=new Set<string>(); return value.map(raw=>{
    const d=body(raw,['productId','quantity','finalUnitPrice']);
    const productId=id(d.productId); if(seen.has(productId)) throw bad('同一商品请合并数量'); seen.add(productId);
    const quantity=positiveInt(d.quantity); const unitCents=money(d.finalUnitPrice);
    return {productId,quantity,unitCents};
  });
}
async function readableSale(db:Db,saleId:string,a:Actor):Promise<unknown> {
  const sale=await getSale(db,saleId); access(a,sale);
  const fields=a.role==='OWNER'?'l.*':'l.sale_id,l.line_no,l.product_id,l.quantity,l.final_unit_price_cents,l.line_net_cents,l.line_tax_cents,l.line_commission_cents,l.name_snapshot,l.sku_snapshot';
  const lines=await rows<RowDataPacket>(db,`SELECT ${fields},p.name AS current_name FROM sale_lines l JOIN products p ON p.id=l.product_id WHERE l.sale_id=? ORDER BY l.line_no`,[saleId]);
  return {sale,lines};
}

export function registerSales(app:FastifyInstance):void {
  app.get('/api/v1/sales',async req=>{
    const a=await actor(req),q=req.query as Record<string,unknown>;
    const filter=a.role==='OWNER'?'':' WHERE sh.salesperson_id=?';
    return listPage(`SELECT sa.id,sa.sale_no,sa.shift_id,sa.event_id,sa.state,sa.created_at,sa.posted_at,sa.net_cents,sa.tax_cents,sa.total_cents,sh.salesperson_id,b.location AS booth_location FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id JOIN booths b ON b.id=sh.booth_id${filter} ORDER BY sa.id DESC`,a.role==='OWNER'?[]:[a.salespersonId],q,100);
  });
  app.get('/api/v1/sales/:id',async req=>{const a=await actor(req),db=await pool.getConnection();try{return await readableSale(db,id(params(req).id),a);}finally{db.release();}});
  app.post('/api/v1/sales',async req=>{
    const a=await actor(req); writable(req,a); const d=body(req.body,['shiftId','lines']); const shiftId=id(d.shiftId),lines=inputLines(d.lines),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'sale.create',k,d,async()=>{
      const shift=await first<RowDataPacket>(db,'SELECT event_id FROM shifts WHERE id=?',[shiftId]); if(!shift) throw missing();
      await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[shift.event_id]);
      const s=await first<Sale>(db,`SELECT sh.id,sh.salesperson_id,sh.booth_id,sh.status AS shift_status,sh.planned_start,sh.planned_end,e.status AS event_status FROM shifts sh JOIN events e ON e.id=sh.event_id WHERE sh.id=? FOR UPDATE`,[shiftId]); if(!s) throw missing();
      if(a.role==='SALESPERSON'&&s.salesperson_id!==a.salespersonId) throw missing(); verifyNew(s);
      const r=await exec(db,'INSERT INTO sales(shift_id,event_id,created_by) VALUES(?,?,?)',[shiftId,shift.event_id,a.id]); const saleId=String(r.insertId);
      for(const [i,line] of lines.entries()) {
        const product=await first<Product>(db,'SELECT * FROM products WHERE id=? AND active=TRUE',[line.productId]); if(!product) throw missing();
        await exec(db,'INSERT INTO sale_lines(sale_id,line_no,product_id,quantity,final_unit_price_cents) VALUES(?,?,?,?,?)',[saleId,i+1,line.productId,line.quantity,String(line.unitCents)]);
      }
      await audit(db,a.id,'SALE_DRAFT_CREATED','SALE',saleId); return {id:saleId,state:'DRAFT',version:1};
    }));
  });
  app.patch('/api/v1/sales/:id',async req=>{
    const a=await actor(req); writable(req,a); const saleId=id(params(req).id),d=body(req.body,['version','lines']),lines=inputLines(d.lines),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'sale.edit',k,{saleId,...d},async()=>{
      const pre=await getSale(db,saleId); await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[pre.event_id]); const s=await getSale(db,saleId,true); access(a,s);
      if(s.state!=='DRAFT'||s.version!==d.version) throw conflict('销售已变化或不能编辑'); verifyNew(s);
      await exec(db,'DELETE FROM sale_lines WHERE sale_id=?',[saleId]);
      for(const [i,line] of lines.entries()) {
        const product=await first<Product>(db,'SELECT * FROM products WHERE id=? AND active=TRUE',[line.productId]); if(!product) throw missing();
        await exec(db,'INSERT INTO sale_lines(sale_id,line_no,product_id,quantity,final_unit_price_cents) VALUES(?,?,?,?,?)',[saleId,i+1,line.productId,line.quantity,String(line.unitCents)]);
      }
      await exec(db,'UPDATE sales SET version=version+1 WHERE id=?',[saleId]); await audit(db,a.id,'SALE_DRAFT_EDITED','SALE',saleId); return {id:saleId,state:'DRAFT',version:s.version+1};
    }));
  });
  app.post('/api/v1/sales/:id/prepare',async req=>{
    const a=await actor(req); writable(req,a); const saleId=id(params(req).id),d=body(req.body,['version']),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'sale.prepare',k,{saleId,...d},async()=>{
      const pre=await getSale(db,saleId); await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[pre.event_id]);
      const s=await getSale(db,saleId,true); access(a,s); if(s.state!=='DRAFT'||s.version!==d.version) throw conflict('销售状态或版本已变化'); verifyNew(s);
      if(!s.policy_confirmed||s.tax_bps===null||s.commission_bps===null) throw conflict('税率或员工佣金率尚未配置');
      const location=await first<RowDataPacket>(db,'SELECT id FROM stock_locations WHERE booth_id=? AND active=TRUE',[s.booth_id]); if(!location) throw conflict('展位库存位置不可用');
      const lines=await rows<Line>(db,'SELECT * FROM sale_lines WHERE sale_id=? ORDER BY product_id FOR UPDATE',[saleId]); if(!lines.length) throw bad('销售没有商品');
      let net=0n,tax=0n; const details:unknown[]=[];
      for(const line of lines){
        const p=await first<Product>(db,'SELECT * FROM products WHERE id=? FOR UPDATE',[line.product_id]); if(!p||!p.active) throw conflict('商品已停用');
        const unit=BigInt(line.final_unit_price_cents); if(unit<BigInt(p.min_price_cents)) throw conflict(`${p.name} 成交价低于当前最低价`);
        const bal=await first<Balance>(db,'SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE',[location.id,p.id]);
        if(!bal||BigInt(bal.on_hand)-BigInt(bal.reserved)<BigInt(line.quantity)) throw conflict(`${p.name} 展位可售库存不足`);
        const lineNet=BigInt(line.quantity)*unit, lineTax=halfUp(lineNet*BigInt(s.tax_bps)), lineCommission=halfUp(lineNet*BigInt(s.commission_bps));
        net+=lineNet; tax+=lineTax; if(net+tax>9_000_000_000_000n) throw bad('单据金额超过上限');
        await exec(db,'UPDATE stock_balances SET reserved=reserved+?,version=version+1 WHERE location_id=? AND product_id=?',[line.quantity,location.id,p.id]);
        await exec(db,'INSERT INTO stock_holds(sale_id,line_no,location_id,product_id,quantity) VALUES(?,?,?,?,?)',[saleId,line.line_no,location.id,p.id,line.quantity]);
        await exec(db,'UPDATE sale_lines SET line_net_cents=?,line_tax_cents=?,line_commission_cents=?,cost_snapshot_cents=?,min_snapshot_cents=?,tax_bps_snapshot=?,commission_bps_snapshot=?,name_snapshot=?,sku_snapshot=? WHERE sale_id=? AND line_no=?',
          [String(lineNet),String(lineTax),String(lineCommission),p.wholesale_cost_cents,p.min_price_cents,s.tax_bps,s.commission_bps,p.name,p.sku,saleId,line.line_no]);
        details.push({lineNo:line.line_no,productId:p.id,quantity:line.quantity,netCents:String(lineNet),taxCents:String(lineTax)});
      }
      await exec(db,"UPDATE sales SET state='CHECKOUT',prepared_at=UTC_TIMESTAMP(3),net_cents=?,tax_cents=?,total_cents=?,version=version+1 WHERE id=?",[String(net),String(tax),String(net+tax),saleId]);
      await audit(db,a.id,'SALE_PREPARED','SALE',saleId,{totalCents:String(net+tax)});
      return {id:saleId,state:'CHECKOUT',version:s.version+1,netCents:String(net),taxCents:String(tax),totalCents:String(net+tax),lines:details};
    }));
  });
  app.post('/api/v1/sales/:id/post',async req=>{
    const a=await actor(req); writable(req,a); const saleId=id(params(req).id),d=body(req.body,['paymentMethod','paymentReference','cashReceived']),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'sale.post',k,{saleId,...d},async()=>{
      const pre=await getSale(db,saleId); await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[pre.event_id]);
      const s=await getSale(db,saleId,true); access(a,s); if(s.state!=='CHECKOUT') throw conflict('销售尚未准备收款或已经处理');
      if(s.shift_status!=='ACTIVE'||s.actual_end) throw conflict('班次已关闭，请管理员核对');
      const method=d.paymentMethod; if(method!=='CASH'&&method!=='TERMINAL') throw bad('付款方式无效');
      const reference=d.paymentReference===undefined?null:nonempty(d.paymentReference,120);
      let received:null|bigint=null;
      if(method==='CASH'){received=money(d.cashReceived); if(received<BigInt(s.total_cents)) throw bad('现金实收不足');}
      if(method==='TERMINAL'&&!reference) throw bad('终端交易须填写参考号');
      const lines=await rows<Line>(db,'SELECT * FROM sale_lines WHERE sale_id=? ORDER BY product_id FOR UPDATE',[saleId]);
      for(const line of lines){
        const hold=await first<RowDataPacket>(db,'SELECT * FROM stock_holds WHERE sale_id=? AND line_no=? FOR UPDATE',[saleId,line.line_no]); if(!hold||hold.status!=='ACTIVE') throw conflict('库存占用不存在或已释放');
        const balance=await first<Balance>(db,'SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE',[hold.location_id,line.product_id]);
        if(!balance||BigInt(balance.on_hand)<BigInt(line.quantity)||BigInt(balance.reserved)<BigInt(line.quantity)) throw conflict('库存占用与实物不一致');
        await exec(db,'UPDATE stock_balances SET on_hand=on_hand-?,reserved=reserved-?,version=version+1 WHERE location_id=? AND product_id=?',[line.quantity,line.quantity,hold.location_id,line.product_id]);
        await exec(db,"UPDATE stock_holds SET status='CONSUMED' WHERE sale_id=? AND line_no=?",[saleId,line.line_no]);
        await exec(db,"INSERT INTO stock_ledger(location_id,product_id,delta,source_kind,source_id,source_line_no) VALUES(?,?,?,?,?,?)",[hold.location_id,line.product_id,-line.quantity,'SALE',saleId,line.line_no]);
        if(BigInt(line.line_commission_cents)>0n) await exec(db,"INSERT INTO commission_entries(salesperson_id,amount_cents,source_kind,source_id,source_line_no) VALUES(?,?,?,?,?)",[s.salesperson_id,line.line_commission_cents,'SALE',saleId,line.line_no]);
      }
      const saleNo=`FX-${saleId.padStart(8,'0')}`;
      await exec(db,"UPDATE sales SET state='POSTED',sale_no=?,posted_at=UTC_TIMESTAMP(3),posted_by=?,payment_method=?,payment_reference=?,cash_received_cents=?,version=version+1 WHERE id=?",[saleNo,a.id,method,reference,received===null?null:String(received),saleId]);
      await audit(db,a.id,'SALE_POSTED','SALE',saleId,{paymentMethod:method,reference});
      return {id:saleId,saleNo,state:'POSTED',totalCents:s.total_cents,changeCents:received===null?null:String(received-BigInt(s.total_cents))};
    }));
  });
  app.post('/api/v1/sales/:id/cancel',async req=>{
    const a=await actor(req); writable(req,a); const saleId=id(params(req).id),d=body(req.body,['reason','paymentReconciled','goodsRecovered']),k=requireKey(req.headers['idempotency-key']);
    return tx(db=>command(db,a.id,'sale.cancel',k,{saleId,...d},async()=>{
      const pre=await getSale(db,saleId); await first<RowDataPacket>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[pre.event_id]); const s=await getSale(db,saleId,true); access(a,s);
      if(s.state!=='DRAFT'&&s.state!=='CHECKOUT') throw conflict('只能取消未成交销售');
      const reason=nonempty(d.reason,500);
      if(s.state==='CHECKOUT') {
        owner(a); if(d.paymentReconciled!==true||d.goodsRecovered!==true) throw bad('须确认收款已核对且商品未交付或已收回');
        const holds=await rows<RowDataPacket>(db,"SELECT * FROM stock_holds WHERE sale_id=? AND status='ACTIVE' ORDER BY product_id FOR UPDATE",[saleId]);
        for(const h of holds){await exec(db,'UPDATE stock_balances SET reserved=reserved-?,version=version+1 WHERE location_id=? AND product_id=?',[h.quantity,h.location_id,h.product_id]); await exec(db,"UPDATE stock_holds SET status='RELEASED' WHERE sale_id=? AND line_no=?",[saleId,h.line_no]);}
      }
      await exec(db,"UPDATE sales SET state='CANCELLED',version=version+1 WHERE id=?",[saleId]); await audit(db,a.id,'SALE_CANCELLED','SALE',saleId,{reason}); return {id:saleId,state:'CANCELLED'};
    }));
  });
}
