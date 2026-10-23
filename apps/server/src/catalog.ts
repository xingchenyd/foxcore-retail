import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { DateTime } from 'luxon';
import { pool, exec, first, rows, tx } from './db.js';
import { actor, owner, writable, type Actor } from './auth.js';
import { audit, bad, body, bps, command, conflict, id, missing, money, nonempty, opt, positiveInt, requireKey } from './core.js';

import { listPage } from './pagination.js';
import { lockShiftEvent } from './catalog-updates.js';
import { parseCalendarDate } from './fix-rules.js';

interface Basic extends RowDataPacket { id: string; event_id?: string; status?: string; version?: number; start_date?: string; end_date?: string; planned_start?: string; planned_end?: string; salesperson_id?: string; active?: number; policy_confirmed?: number; tax_bps?: number | null }
const params = (req: FastifyRequest) => req.params as Record<string, unknown>;
async function ownerWrite(req: FastifyRequest): Promise<Actor> { const a = await actor(req); owner(a); writable(req, a); return a; }
async function list(sql: string, values: unknown[], req: FastifyRequest): Promise<unknown> {
  return listPage(sql, values, req.query as Record<string, unknown>);
}
const utc = (value: unknown): string => {
  if (typeof value !== 'string') throw bad('时间必须是带 UTC 偏移的 ISO 格式');
  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid || !/[Zz]|[+-]\d\d:\d\d$/.test(value)) throw bad('时间必须带 UTC 偏移');
  return parsed.toUTC().toFormat('yyyy-LL-dd HH:mm:ss.SSS');
};
const toLocalDate = (utcSql: string) => DateTime.fromSQL(utcSql, { zone: 'utc' }).setZone('America/Toronto').toISODate();
const nowSql = () => DateTime.utc().toFormat('yyyy-LL-dd HH:mm:ss.SSS');

export function registerCatalog(app: FastifyInstance): void {
  app.get('/api/v1/categories', async req => { await actor(req); return list('SELECT id,code,type FROM event_categories ORDER BY id', [], req); });
  app.get('/api/v1/venues', async req => { await actor(req); return list('SELECT * FROM venues ORDER BY id DESC', [], req); });
  app.post('/api/v1/venues', async req => {
    const a = await ownerWrite(req); const d = body(req.body, ['name','street','city','province','postalCode','description']); const k = requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'venue.create',k,d,async () => {
      const r = await exec(db,'INSERT INTO venues(name,street,city,province,postal_code,description) VALUES(?,?,?,?,?,?)',
        [nonempty(d.name,120),nonempty(d.street,120),nonempty(d.city,80),nonempty(d.province,80),nonempty(d.postalCode,16),opt(d.description)]);
      const result = { id: String(r.insertId) }; await audit(db,a.id,'VENUE_CREATED','VENUE',result.id); return result;
    }));
  });
  app.get('/api/v1/events', async req => { await actor(req); return list('SELECT e.*,v.name AS venue_name,c.type AS category_type FROM events e JOIN venues v ON v.id=e.venue_id JOIN event_categories c ON c.id=e.category_id ORDER BY e.id DESC', [], req); });
  app.post('/api/v1/events', async req => {
    const a = await ownerWrite(req); const d = body(req.body,['venueId','categoryId','name','startDate','endDate','description','taxBps','policyConfirmed']); const k=requireKey(req.headers['idempotency-key']);
    const startDate = parseCalendarDate(d.startDate), endDate = parseCalendarDate(d.endDate);
    if (endDate < startDate) throw bad('活动结束日期不得早于开始日期');
    if (d.policyConfirmed !== true && d.policyConfirmed !== false) throw bad('须明确确认税务口径');
    return tx(db => command(db,a.id,'event.create',k,d,async () => {
      const r=await exec(db,'INSERT INTO events(venue_id,category_id,name,start_date,end_date,description,tax_bps,policy_confirmed) VALUES(?,?,?,?,?,?,?,?)',
        [id(d.venueId),id(d.categoryId),nonempty(d.name,120),startDate,endDate,opt(d.description),d.taxBps === null || d.taxBps === undefined ? null : bps(d.taxBps),d.policyConfirmed]);
      const result={id:String(r.insertId)}; await audit(db,a.id,'EVENT_CREATED','EVENT',result.id); return result;
    }));
  });
  app.post('/api/v1/events/:id/open', async req => {
    const a=await ownerWrite(req); const eventId=id(params(req).id); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'event.open',k,{eventId},async () => {
      const event=await first<Basic>(db,'SELECT * FROM events WHERE id=? FOR UPDATE',[eventId]); if(!event) throw missing();
      if(event.status!=='DRAFT' || !event.policy_confirmed || event.tax_bps===null) throw conflict('活动未处于草稿或税务口径未确认');
      const booth=await first<Basic>(db,'SELECT id FROM booths WHERE event_id=? AND active=TRUE LIMIT 1',[eventId]); if(!booth) throw conflict('活动至少需要一个有效展位');
      await exec(db,"UPDATE events SET status='OPEN',version=version+1 WHERE id=?",[eventId]); await audit(db,a.id,'EVENT_OPENED','EVENT',eventId); return {id:eventId,status:'OPEN'};
    }));
  });
  app.post('/api/v1/events/:id/close', async req => {
    const a=await ownerWrite(req); const eventId=id(params(req).id); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'event.close',k,{eventId},async () => {
      const event=await first<Basic>(db,'SELECT * FROM events WHERE id=? FOR UPDATE',[eventId]); if(!event) throw missing(); if(event.status!=='OPEN') throw conflict('活动未开放');
      const pending=await first<RowDataPacket>(db,"SELECT COUNT(*) AS n FROM shifts WHERE event_id=? AND status IN ('PLANNED','ACTIVE')",[eventId]);
      const sales=await first<RowDataPacket>(db,"SELECT COUNT(*) AS n FROM sales WHERE event_id=? AND state IN ('DRAFT','CHECKOUT')",[eventId]);
      const stock=await first<RowDataPacket>(db,"SELECT COUNT(*) AS n FROM stock_balances b JOIN stock_locations l ON l.id=b.location_id JOIN booths bo ON bo.id=l.booth_id WHERE bo.event_id=? AND b.on_hand>0",[eventId]);
      const returns=await first<RowDataPacket>(db,"SELECT COUNT(*) AS n FROM returns r JOIN stock_locations l ON l.id=r.destination_location_id JOIN booths b ON b.id=l.booth_id WHERE r.state='AUTHORIZED' AND b.event_id=? AND EXISTS (SELECT 1 FROM return_lines rl WHERE rl.return_id=r.id AND rl.disposition='RESTOCK')",[eventId]);
      if(Number(pending?.n)||Number(sales?.n)||Number(stock?.n)||Number(returns?.n)) throw conflict('仍有班次、未结账销售、展位库存或待处理入展位退货');
      await exec(db,"UPDATE events SET status='CLOSED',version=version+1 WHERE id=?",[eventId]); await audit(db,a.id,'EVENT_CLOSED','EVENT',eventId); return {id:eventId,status:'CLOSED'};
    }));
  });
  app.get('/api/v1/booths', async req => { await actor(req); const q=req.query as Record<string,unknown>; const filter=q.eventId ? ' WHERE b.event_id=?' : ''; return list('SELECT b.*,e.name AS event_name FROM booths b JOIN events e ON e.id=b.event_id'+filter+' ORDER BY b.id DESC',q.eventId?[id(q.eventId)]:[],req); });
  app.post('/api/v1/booths', async req => {
    const a=await ownerWrite(req); const d=body(req.body,['eventId','location']); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'booth.create',k,d,async () => {
      const eventId=id(d.eventId); const event=await first<Basic>(db,'SELECT * FROM events WHERE id=? FOR UPDATE',[eventId]); if(!event) throw missing(); if(event.status==='CLOSED'||event.status==='CANCELLED') throw conflict('活动已结束');
      const r=await exec(db,'INSERT INTO booths(event_id,location) VALUES(?,?)',[eventId,nonempty(d.location,80)]);
      const boothId=String(r.insertId); await exec(db,'INSERT INTO stock_locations(code,name,kind,booth_id) VALUES(?,?,?,?)',[`BOOTH-${boothId}`,`展位 ${d.location}`,'BOOTH',boothId]);
      await audit(db,a.id,'BOOTH_CREATED','BOOTH',boothId); return {id:boothId};
    }));
  });
  app.get('/api/v1/products', async req => {
    const a=await actor(req); const fields=a.role==='OWNER'?'*':'id,sku,name,min_price_cents,suggested_price_cents,active,version';
    return list(`SELECT ${fields} FROM products ORDER BY id DESC`,[],req);
  });
  app.post('/api/v1/products', async req => {
    const a=await ownerWrite(req); const d=body(req.body,['sku','name','wholesaleCost','minPrice','suggestedPrice']); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'product.create',k,d,async () => {
      const cost=money(d.wholesaleCost); const min=money(d.minPrice); const suggested=d.suggestedPrice===undefined||d.suggestedPrice===null?null:money(d.suggestedPrice);
      if(suggested!==null&&suggested<min) throw bad('建议售价低于最低售价');
      const r=await exec(db,'INSERT INTO products(sku,name,wholesale_cost_cents,min_price_cents,suggested_price_cents) VALUES(?,?,?,?,?)',
        [nonempty(d.sku,64),nonempty(d.name,160),String(cost),String(min),suggested===null?null:String(suggested)]);
      const result={id:String(r.insertId)}; await audit(db,a.id,'PRODUCT_CREATED','PRODUCT',result.id); return result;
    }));
  });
  app.patch('/api/v1/products/:id', async req => {
    const a=await ownerWrite(req); const productId=id(params(req).id); const d=body(req.body,['name','wholesaleCost','minPrice','suggestedPrice','active','version']); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'product.update',k,{productId,...d},async () => {
      const old=await first<Basic>(db,'SELECT * FROM products WHERE id=? FOR UPDATE',[productId]); if(!old) throw missing();
      if(d.version!==old.version) throw conflict('商品已被其他人修改');
      const name=d.name===undefined?old.name:nonempty(d.name,160);
      const cost=d.wholesaleCost===undefined?BigInt(old.wholesale_cost_cents):money(d.wholesaleCost);
      const min=d.minPrice===undefined?BigInt(old.min_price_cents):money(d.minPrice);
      const suggested=d.suggestedPrice===undefined?(old.suggested_price_cents===null?null:BigInt(old.suggested_price_cents)):d.suggestedPrice===null?null:money(d.suggestedPrice);
      if(suggested!==null&&suggested<min) throw bad('建议售价低于最低售价');
      const active=d.active===undefined?Boolean(old.active):d.active; if(typeof active!=='boolean') throw bad('active 必须为布尔值');
      await exec(db,'UPDATE products SET name=?,wholesale_cost_cents=?,min_price_cents=?,suggested_price_cents=?,active=?,version=version+1 WHERE id=?',
        [name,String(cost),String(min),suggested===null?null:String(suggested),active,productId]);
      await audit(db,a.id,'PRODUCT_UPDATED','PRODUCT',productId); return {id:productId,version:Number(old.version)+1};
    }));
  });
  app.get('/api/v1/salespeople', async req => { const a=await actor(req); owner(a); return list('SELECT * FROM salespeople ORDER BY id DESC',[],req); });
  app.post('/api/v1/salespeople', async req => {
    const a=await ownerWrite(req); const d=body(req.body,['firstName','lastName','street','city','province','postalCode','phone','description','commissionBps']); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'salesperson.create',k,d,async () => {
      const r=await exec(db,'INSERT INTO salespeople(first_name,last_name,street,city,province,postal_code,phone,description,commission_bps) VALUES(?,?,?,?,?,?,?,?,?)',
        [nonempty(d.firstName,80),nonempty(d.lastName,80),opt(d.street,120),opt(d.city,80),opt(d.province,80),opt(d.postalCode,16),opt(d.phone,32),opt(d.description),d.commissionBps===undefined||d.commissionBps===null?null:bps(d.commissionBps)]);
      const result={id:String(r.insertId)}; await audit(db,a.id,'SALESPERSON_CREATED','SALESPERSON',result.id); return result;
    }));
  });
  app.get('/api/v1/shifts', async req => {
    const a=await actor(req); const q=req.query as Record<string,unknown>; const conditions:string[]=[],values:unknown[]=[];
    if(a.role==='SALESPERSON'){conditions.push('s.salesperson_id=?');values.push(a.salespersonId);}
    else if(q.salespersonId!==undefined){conditions.push('s.salesperson_id=?');values.push(id(q.salespersonId));}
    if(q.eventId!==undefined){conditions.push('s.event_id=?');values.push(id(q.eventId));}
    if(q.status!==undefined){
      if(typeof q.status!=='string'||!['PLANNED','ACTIVE','CLOSED','CANCELLED'].includes(q.status)) throw bad('班次状态筛选无效');
      conditions.push('s.status=?');values.push(q.status);
    }
    const filter=conditions.length?' WHERE '+conditions.join(' AND '):'';
    return list('SELECT s.*,b.location AS booth_location,e.name AS event_name,sp.first_name,sp.last_name FROM shifts s JOIN booths b ON b.id=s.booth_id JOIN events e ON e.id=s.event_id JOIN salespeople sp ON sp.id=s.salesperson_id'+filter+' ORDER BY s.id DESC',values,req);
  });
  app.post('/api/v1/shifts', async req => {
    const a=await ownerWrite(req); const d=body(req.body,['salespersonId','boothId','plannedStart','plannedEnd']); const k=requireKey(req.headers['idempotency-key']);
    const start=utc(d.plannedStart); const end=utc(d.plannedEnd); if(end<=start) throw bad('班次结束必须晚于开始');
    return tx(db => command(db,a.id,'shift.create',k,d,async () => {
      const salespersonId=id(d.salespersonId),boothId=id(d.boothId);
      const pre=await first<Basic>(db,'SELECT event_id FROM booths WHERE id=?',[boothId]);if(!pre) throw missing();
      await first<Basic>(db,'SELECT id FROM events WHERE id=? FOR UPDATE',[pre.event_id]);
      const booth=await first<Basic>(db,'SELECT b.*,e.start_date,e.end_date,e.status FROM booths b JOIN events e ON e.id=b.event_id WHERE b.id=? FOR UPDATE',[boothId]); if(!booth||!booth.active) throw missing();
      if(booth.status==='CLOSED'||booth.status==='CANCELLED') throw conflict('活动已结束');
      const sp=await first<Basic>(db,'SELECT * FROM salespeople WHERE id=? FOR UPDATE',[salespersonId]); if(!sp||!sp.active) throw missing();
      const date=toLocalDate(start); if(!date||date<booth.start_date!||date>booth.end_date!||toLocalDate(end)!==date) throw bad('班次须位于活动当地日期内');
      const overlap=await first<RowDataPacket>(db,"SELECT id FROM shifts WHERE salesperson_id=? AND status IN ('PLANNED','ACTIVE') AND planned_start<? AND planned_end>? LIMIT 1",[salespersonId,end,start]);
      if(overlap) throw conflict('员工已有重叠班次');
      const r=await exec(db,'INSERT INTO shifts(salesperson_id,booth_id,event_id,business_date,planned_start,planned_end) VALUES(?,?,?,?,?,?)',[salespersonId,boothId,booth.event_id,date,start,end]);
      const result={id:String(r.insertId)}; await audit(db,a.id,'SHIFT_CREATED','SHIFT',result.id); return result;
    }));
  });
  app.post('/api/v1/shifts/:id/start', async req => {
    const a=await actor(req); writable(req,a); const shiftId=id(params(req).id); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'shift.start',k,{shiftId},async () => {
      await lockShiftEvent(db,shiftId);
      const shift=await first<Basic>(db,'SELECT s.*,e.status AS event_status FROM shifts s JOIN events e ON e.id=s.event_id WHERE s.id=? FOR UPDATE',[shiftId]); if(!shift) throw missing();
      if(a.role!=='OWNER'&&shift.salesperson_id!==a.salespersonId) throw missing();
      if(shift.status!=='PLANNED'||shift.event_status!=='OPEN') throw conflict('活动未开放或班次不在计划状态');
      const now=nowSql(); if(now<shift.planned_start!||now>=shift.planned_end!) throw conflict('当前不在计划班次时间内');
      await first<RowDataPacket>(db,'SELECT id FROM salespeople WHERE id=? FOR UPDATE',[shift.salesperson_id]);
      const other=await first<RowDataPacket>(db,"SELECT id FROM shifts WHERE salesperson_id=? AND status='ACTIVE' LIMIT 1",[shift.salesperson_id]); if(other) throw conflict('员工已有进行中班次');
      await exec(db,"UPDATE shifts SET status='ACTIVE',actual_start=UTC_TIMESTAMP(3),version=version+1 WHERE id=?",[shiftId]); await audit(db,a.id,'SHIFT_STARTED','SHIFT',shiftId); return {id:shiftId,status:'ACTIVE'};
    }));
  });
  app.post('/api/v1/shifts/:id/close', async req => {
    const a=await actor(req); writable(req,a); const shiftId=id(params(req).id); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'shift.close',k,{shiftId},async () => {
      await lockShiftEvent(db,shiftId);
      const shift=await first<Basic>(db,'SELECT * FROM shifts WHERE id=? FOR UPDATE',[shiftId]); if(!shift) throw missing(); if(a.role!=='OWNER'&&shift.salesperson_id!==a.salespersonId) throw missing(); if(shift.status!=='ACTIVE') throw conflict('班次未开始');
      const open=await first<RowDataPacket>(db,"SELECT id FROM sales WHERE shift_id=? AND state IN ('DRAFT','CHECKOUT') LIMIT 1",[shiftId]); if(open) throw conflict('班次仍有待处理销售');
      await exec(db,"UPDATE shifts SET status='CLOSED',actual_end=UTC_TIMESTAMP(3),version=version+1 WHERE id=?",[shiftId]); await audit(db,a.id,'SHIFT_CLOSED','SHIFT',shiftId); return {id:shiftId,status:'CLOSED'};
    }));
  });
}
