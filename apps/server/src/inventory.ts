import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, exec, first, rows, tx, type Db } from './db.js';
import { actor, owner, writable } from './auth.js';
import { audit, bad, body, command, conflict, id, missing, nonempty, positiveInt, requireKey } from './core.js';

import { listPage } from './pagination.js';

interface Balance extends RowDataPacket { on_hand: string; reserved: string; version: number }
interface Location extends RowDataPacket { id: string; kind: string; active: number; booth_id: string | null }
async function location(db: Db, value: string): Promise<Location> {
  const loc=await first<Location>(db,'SELECT * FROM stock_locations WHERE id=?',[value]); if(!loc||!loc.active) throw missing();if(!['WAREHOUSE','BOOTH'].includes(loc.kind))throw bad('在途和损坏库位只能通过对应业务单处理'); return loc;
}
async function lockLocationEvents(db: Db, locationIds: string[]): Promise<void> {
  const eventIds = new Set<string>();
  for (const locationId of locationIds) {
    const row = await first<RowDataPacket>(db,'SELECT b.event_id FROM stock_locations l LEFT JOIN booths b ON b.id=l.booth_id WHERE l.id=?',[locationId]);
    if (!row) throw missing();
    if (row.event_id) eventIds.add(row.event_id);
  }
  for (const eventId of [...eventIds].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)) {
    const event = await first<RowDataPacket>(db,'SELECT status FROM events WHERE id=? FOR UPDATE',[eventId]);
    if (!event || event.status==='CLOSED' || event.status==='CANCELLED') throw conflict('目标或来源活动已结束');
  }
}
async function balance(db: Db, locationId: string, productId: string): Promise<Balance> {
  let row=await first<Balance>(db,'SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE',[locationId,productId]);
  if(!row){await exec(db,'INSERT INTO stock_balances(location_id,product_id) VALUES(?,?)',[locationId,productId]);row=await first<Balance>(db,'SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE',[locationId,productId]);}
  if(!row) throw new Error('Balance row missing'); return row;
}
async function updateBalance(db: Db, locationId: string, productId: string, delta: bigint): Promise<void> {
  const current=await balance(db,locationId,productId);
  const next=BigInt(current.on_hand)+delta;
  if(next<BigInt(current.reserved)) throw conflict('库存不足或已被待结账交易占用');
  await exec(db,'UPDATE stock_balances SET on_hand=?,version=version+1 WHERE location_id=? AND product_id=?',[String(next),locationId,productId]);
}
async function document(db: Db, kind: string, from: string | null, to: string | null, reason: string, actorId: string, productId: string, quantity: number): Promise<string> {
  const result=await exec(db,'INSERT INTO stock_documents(kind,from_location_id,to_location_id,reason,created_by) VALUES(?,?,?,?,?)',[kind,from,to,reason,actorId]);
  const docId=String(result.insertId);
  await exec(db,'INSERT INTO stock_document_lines(document_id,line_no,product_id,quantity) VALUES(?,?,?,?)',[docId,1,productId,quantity]);
  return docId;
}
async function ledger(db: Db, loc: string, product: string, delta: bigint, sourceId: string, lineNo: number): Promise<void> {
  await exec(db,'INSERT INTO stock_ledger(location_id,product_id,delta,source_kind,source_id,source_line_no) VALUES(?,?,?,?,?,?)',[loc,product,String(delta),'DOCUMENT',sourceId,lineNo]);
}
const params = (req: FastifyRequest) => req.params as Record<string, unknown>;

export function registerInventory(app: FastifyInstance): void {
  app.get('/api/v1/stock/locations', async req => {
    const a=await actor(req);
    const q=req.query as Record<string,unknown>,filter=q.operational==='true'?" WHERE l.active=TRUE AND l.kind IN ('WAREHOUSE','BOOTH')":'';return listPage('SELECT l.*,b.active AS booth_active,b.event_id,e.status AS event_status FROM stock_locations l LEFT JOIN booths b ON b.id=l.booth_id LEFT JOIN events e ON e.id=b.event_id'+filter+' ORDER BY l.id',[],q,100);
  });
  app.get('/api/v1/stock/balances', async req => {
    const a=await actor(req),q=req.query as Record<string,unknown>,conditions:string[]=[],values:unknown[]=[];
    if(q.locationId!==undefined){conditions.push('b.location_id=?');values.push(id(q.locationId));}
    if(q.productId!==undefined){conditions.push('b.product_id=?');values.push(id(q.productId));}
    const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
    return listPage(`SELECT b.*,l.name AS location_name,l.kind,p.name AS product_name,p.sku FROM stock_balances b JOIN stock_locations l ON l.id=b.location_id JOIN products p ON p.id=b.product_id${where} ORDER BY b.location_id,b.product_id`,values,q,100);
  });
  app.get('/api/v1/stock/ledger', async req => {
    const a=await actor(req);
    return listPage('SELECT * FROM stock_ledger ORDER BY id DESC',[],req.query as Record<string,unknown>,100);
  });
  app.post('/api/v1/stock/receive', async req => {
    const a=await actor(req); writable(req,a); const d=body(req.body,['productId','quantity','reason']); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'stock.receive',k,d,async () => {
      const productId=id(d.productId),qty=positiveInt(d.quantity,1_000_000),reason=nonempty(d.reason,500);
      const product=await first<RowDataPacket>(db,'SELECT id FROM products WHERE id=? AND active=TRUE FOR UPDATE',[productId]); if(!product) throw missing();
      const warehouse=await first<Location>(db,"SELECT * FROM stock_locations WHERE code='MAIN' FOR UPDATE"); if(!warehouse) throw new Error('Warehouse missing');
      await updateBalance(db,warehouse.id,productId,BigInt(qty));
      const docId=await document(db,'RECEIVE',null,warehouse.id,reason,a.id,productId,qty);
      await ledger(db,warehouse.id,productId,BigInt(qty),docId,1); await audit(db,a.id,'STOCK_RECEIVED','STOCK_DOCUMENT',docId);
      return {id:docId};
    }));
  });
  app.post('/api/v1/stock/transfer', async req => {
    const a=await actor(req); writable(req,a); const d=body(req.body,['productId','quantity','fromLocationId','toLocationId','reason','handoverConfirmed']); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'stock.transfer',k,d,async () => {
      const productId=id(d.productId),qty=positiveInt(d.quantity,1_000_000),from=id(d.fromLocationId),to=id(d.toLocationId),reason=nonempty(d.reason,500);
      if(from===to) throw bad('调拨起点和终点不能相同'); if(d.handoverConfirmed!==true) throw bad('请确认实物已经交接');
      await lockLocationEvents(db,[from,to]);
      for(const locId of [from,to].sort((x,y)=>BigInt(x)<BigInt(y)?-1:1)) await location(db,locId);
      const legacyProduct=await first<RowDataPacket>(db,'SELECT currency FROM products WHERE id=? FOR UPDATE',[productId]);if(legacyProduct?.currency!=='CAD')throw conflict('请使用在途调拨：先发货，再签收');
      for(const locId of [from,to].sort((x,y)=>BigInt(x)<BigInt(y)?-1:1)) await balance(db,locId,productId);
      await updateBalance(db,from,productId,-BigInt(qty)); await updateBalance(db,to,productId,BigInt(qty));
      const docId=await document(db,'TRANSFER',from,to,reason,a.id,productId,qty);
      await ledger(db,from,productId,-BigInt(qty),docId,1); await ledger(db,to,productId,BigInt(qty),docId,1);
      await audit(db,a.id,'STOCK_TRANSFERRED','STOCK_DOCUMENT',docId); return {id:docId};
    }));
  });
  app.post('/api/v1/stock/adjust', async req => {
    const a=await actor(req); writable(req,a); const d=body(req.body,['productId','locationId','countedQuantity','expectedVersion','reason']); const k=requireKey(req.headers['idempotency-key']);
    return tx(db => command(db,a.id,'stock.adjust',k,d,async () => {
      const productId=id(d.productId),locId=id(d.locationId),count=d.countedQuantity,expected=d.expectedVersion,reason=nonempty(d.reason,500);
      if(!Number.isSafeInteger(count)||(count as number)<0||(count as number)>1_000_000||!Number.isInteger(expected)) throw bad('盘点数或版本无效');
      await lockLocationEvents(db,[locId]);
      await location(db,locId);
      // Serialize a missing-row count with receipt/transfer by locking the product.
      // Version 0 means the caller observed NO balance row, not an existing v1 row.
      const product=await first<RowDataPacket>(db,'SELECT id FROM products WHERE id=? FOR UPDATE',[productId]);if(!product)throw missing();
      const observed=await first<Balance>(db,'SELECT * FROM stock_balances WHERE location_id=? AND product_id=? FOR UPDATE',[locId,productId]);
      if(observed?observed.version!==expected:expected!==0)throw conflict('库存已变化，请重新盘点');
      const old=observed??await balance(db,locId,productId);
      const delta=BigInt(count as number)-BigInt(old.on_hand); if(delta===0n) throw bad('盘点数量与当前库存相同');
      await updateBalance(db,locId,productId,delta);
      const docId=await document(db,'ADJUST',delta<0n?locId:null,delta>0n?locId:null,reason,a.id,productId,Number(delta));
      await ledger(db,locId,productId,delta,docId,1); await audit(db,a.id,'STOCK_ADJUSTED','STOCK_DOCUMENT',docId,{delta:String(delta)}); return {id:docId};
    }));
  });
  app.get('/api/v1/stock/documents',async req=>{await actor(req);return listPage('SELECT d.*,dl.quantity,p.name AS product_name,f.name AS from_name,t.name AS to_name FROM stock_documents d JOIN stock_document_lines dl ON dl.document_id=d.id JOIN products p ON p.id=dl.product_id LEFT JOIN stock_locations f ON f.id=d.from_location_id LEFT JOIN stock_locations t ON t.id=d.to_location_id ORDER BY d.id DESC,dl.line_no',[],req.query as Record<string,unknown>,20);});
  app.get('/api/v1/stock/documents/:id', async req => {
    const a=await actor(req); const docId=id(params(req).id); const db=await pool.getConnection();
    try {const doc=await first<RowDataPacket>(db,'SELECT * FROM stock_documents WHERE id=?',[docId]); if(!doc) throw missing(); return {document:doc,lines:await rows<RowDataPacket>(db,'SELECT * FROM stock_document_lines WHERE document_id=? ORDER BY line_no',[docId])};} finally {db.release();}
  });
}
