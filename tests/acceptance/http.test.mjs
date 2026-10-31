import { test } from 'node:test';
import assert from 'node:assert/strict';
import { owner,session,key,tag,db,fixture,activate,draft,sell,returnDraft } from './http-helpers.mjs';

async function staff(s,f){const username='s_'+tag(),password='Synthetic-'+key(),next='Changed-'+key();await s.ok('POST','/users',{username,password,salespersonId:f.person.id});const a=session();await a.ok('POST','/auth/login',{username,password});await a.ok('POST','/auth/password',{currentPassword:password,newPassword:next});await a.ok('POST','/auth/login',{username,password:next});return a;}
const state=(table,id)=>db(`SELECT * FROM ${table} WHERE id=?`,[id])[0]; // table names are test-owned constants only.

test('F02 expired PLANNED cancellation, version, idempotency, audit and event close',async()=>{
  const s=await owner(),f=await fixture(s);await s.ok('POST',`/events/${f.event.id}/open`);
  const shift=await s.ok('POST','/shifts',{salespersonId:f.person.id,boothId:f.booth.id,plannedStart:f.day.minus({days:1}).startOf('day').toISO(),plannedEnd:f.day.minus({days:1}).endOf('day').toISO()});
  assert.equal((await s.call('POST',`/shifts/${shift.id}/start`)).status,409);
  assert.equal((await s.call('POST',`/events/${f.event.id}/close`)).status,409);
  assert.equal((await s.call('POST',`/shifts/${shift.id}/cancel`,{version:2,reason:'stale'})).status,409);
  const k=key(),body={version:1,reason:'Synthetic absence'};const a=await s.ok('POST',`/shifts/${shift.id}/cancel`,body,k);
  assert.deepEqual(await s.ok('POST',`/shifts/${shift.id}/cancel`,body,k),a);
  assert.equal((await s.call('POST',`/shifts/${shift.id}/cancel`,{...body,reason:'different'},k)).status,409);
  assert.equal(state('shifts',shift.id).status,'CANCELLED');
  assert.equal(Number(db("SELECT COUNT(*) n FROM audit_events WHERE action='SHIFT_CANCELLED' AND subject_id=?",[shift.id])[0].n),1);
  await s.ok('POST',`/events/${f.event.id}/close`);
});
test('F02 cancel/start race cannot create a cancelled started shift',async()=>{
  const s=await owner(),f=await fixture(s);await s.ok('POST',`/events/${f.event.id}/open`);
  const sh=await s.ok('POST','/shifts',{salespersonId:f.person.id,boothId:f.booth.id,plannedStart:f.day.startOf('day').toISO(),plannedEnd:f.day.endOf('day').toISO()});
  const results=await Promise.all([s.call('POST',`/shifts/${sh.id}/start`),s.call('POST',`/shifts/${sh.id}/cancel`,{version:1,reason:'race'})]);
  assert.equal(results.filter(x=>x.status===200).length,1);assert.equal(results.filter(x=>x.status===409).length,1);
  const row=state('shifts',sh.id);assert.ok(['ACTIVE','CANCELLED'].includes(row.status));if(row.status==='CANCELLED')assert.equal(row.actual_start,null);
});
test('F02/F03 staff cannot cancel/configure; active shift cancellation fails',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s)),a=await staff(s,f);
  for(const [method,path,body] of [['POST',`/shifts/${f.shift.id}/cancel`,{version:2,reason:'no'}],['PATCH',`/events/${f.event.id}`,{version:2,taxBps:0}],['PATCH',`/salespeople/${f.person.id}/commission`,{version:1,commissionBps:0}]])assert.equal((await a.call(method,path,body)).status,403);
  assert.equal((await s.call('POST',`/shifts/${f.shift.id}/cancel`,{version:2,reason:'not allowed'})).status,409);
});
test('F03 null/false draft configuration recovers; zero tax is valid; open policy immutable',async()=>{
  const s=await owner(),f=await fixture(s,{taxBps:null,policyConfirmed:false});
  assert.equal((await s.call('POST',`/events/${f.event.id}/open`)).status,409);
  const patch=await s.ok('PATCH',`/events/${f.event.id}`,{version:1,taxBps:0,policyConfirmed:true});assert.equal(patch.taxBps,0);
  assert.equal((await s.call('PATCH',`/events/${f.event.id}`,{version:1,taxBps:1300})).status,409);
  await s.ok('POST',`/events/${f.event.id}/open`);
  assert.equal((await s.call('PATCH',`/events/${f.event.id}`,{version:3,taxBps:1300})).status,409);
});
test('F03 snapshots remain frozen through configuration update, posting and refund',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s,{commissionBps:null}));
  const sale=await draft(s,f,3);assert.equal((await s.call('POST',`/sales/${sale.id}/prepare`,{version:1})).status,409);
  await s.ok('PATCH',`/salespeople/${f.person.id}/commission`,{version:1,commissionBps:500});
  await s.ok('POST',`/sales/${sale.id}/prepare`,{version:1});
  const before=db('SELECT line_commission_cents,commission_bps_snapshot FROM sale_lines WHERE sale_id=?',[sale.id]);
  await s.ok('PATCH',`/salespeople/${f.person.id}/commission`,{version:2,commissionBps:1000});
  await s.ok('POST',`/sales/${sale.id}/post`,{paymentMethod:'CASH',cashReceived:'34.00'});
  assert.deepEqual(db('SELECT line_commission_cents,commission_bps_snapshot FROM sale_lines WHERE sale_id=?',[sale.id]),before);
  assert.equal(String(before[0].line_commission_cents),'150');
  const r=await returnDraft(s,f,sale);await s.ok('POST',`/returns/${r.id}/authorize`);await s.ok('POST',`/returns/${r.id}/post`,{refundReference:'synthetic'});
  assert.equal(String(db('SELECT commission_cents FROM return_lines WHERE return_id=?',[r.id])[0].commission_cents),'50');
  const future=await sell(s,f,1);assert.equal(String(db('SELECT line_commission_cents FROM sale_lines WHERE sale_id=?',[future.id])[0].line_commission_cents),'100');
});
test('F03 commission zero creates no zero ledger and invalid writes roll back',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s,{commissionBps:0}));
  for(const rate of [null,-1,10001,0.5,'500'])assert.equal((await s.call('PATCH',`/salespeople/${f.person.id}/commission`,{version:1,commissionBps:rate})).status,400);
  const sale=await sell(s,f,1);assert.equal(Number(db("SELECT COUNT(*) n FROM commission_entries WHERE source_kind='SALE' AND source_id=?",[sale.id])[0].n),0);
});
test('F04 same product 3/7 across events and refund attributed to original event',async()=>{
  const s=await owner(),a=await activate(s,await fixture(s)),b=await activate(s,await fixture(s));
  // Transfer the same product into B, rather than accidentally testing two different products.
  await s.ok('POST','/stock/receive',{productId:a.product.id,quantity:7,reason:'synthetic B'});
  await s.ok('POST','/stock/transfer',{productId:a.product.id,quantity:7,fromLocationId:b.main.id,toLocationId:b.location.id,reason:'B handover',handoverConfirmed:true});
  const saleA=await sell(s,a,3);await sell(s,b,7,a.product);
  const row=async f=>(await s.ok('GET',`/reports/sales?group=product&eventId=${f.event.id}`)).items.find(x=>x.id===a.product.id);
  assert.equal(String((await row(a)).quantity),'3');assert.equal(String((await row(b)).quantity),'7');
  const r=await returnDraft(s,a,saleA);await s.ok('POST',`/returns/${r.id}/authorize`);assert.equal(String((await row(a)).quantity),'3');
  await s.ok('POST',`/returns/${r.id}/post`,{refundReference:'synthetic'});
  const result=await row(a);assert.equal(String(result.quantity),'2');assert.equal(String(result.net_cents),'2000');assert.equal(String(result.tax_cents),'260');assert.equal(String(result.commission_cents),'100');assert.equal(String((await row(b)).quantity),'7');
});
test('F04 invalid filters, staff intersection and cost redaction',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s)),other=await activate(s,await fixture(s));await sell(s,f,1);const otherSale=await sell(s,other,1);const a=await staff(s,f);
  const own=await a.ok('GET',`/reports/sales?group=product&eventId=${f.event.id}`);assert.equal(own.total,1);assert.equal(own.items[0].estimated_margin_cents,undefined);
  const none=await a.ok('GET',`/reports/sales?group=product&eventId=${other.event.id}`);assert.equal(none.total,0);assert.equal(none.hasMore,false);
  const shared=await a.call('GET',`/sales/${otherSale.id}`);assert.equal(shared.status,200);assert.equal(shared.data.lines[0].line_commission_cents,undefined);assert.equal(shared.data.lines[0].cost_snapshot_cents,undefined);assert.equal((await a.call('GET','/reports/sales.csv')).status,403);
  for(const q of ['group=typo','eventId=','eventId=1%20OR%201=1','limit=0','offset=-1'])assert.equal((await s.call('GET','/reports/sales?'+q)).status,400);
});
test('F05 cross-event targets rejected at create, authorize and post; legacy cancel still possible',async()=>{
  const s=await owner(),a=await activate(s,await fixture(s)),b=await fixture(s);await s.ok('POST',`/events/${b.event.id}/open`);const sale=await sell(s,a,3);
  const input={saleId:sale.id,reason:'synthetic',destinationLocationId:b.location.id,lines:[{saleLineNo:1,quantity:1,disposition:'RESTOCK'}]};
  assert.equal((await s.call('POST','/returns',input)).status,409);await s.ok('POST',`/events/${b.event.id}/close`);assert.equal((await s.call('POST','/returns',input)).status,409);
  const r=await returnDraft(s,a,sale);db('UPDATE returns SET destination_location_id=? WHERE id=?',[b.location.id,r.id]);
  assert.equal((await s.call('POST',`/returns/${r.id}/authorize`)).status,409);
  db('UPDATE returns SET destination_location_id=? WHERE id=?',[a.main.id,r.id]);await s.ok('POST',`/returns/${r.id}/authorize`);
  db('UPDATE returns SET destination_location_id=? WHERE id=?',[b.location.id,r.id]);assert.equal((await s.call('POST',`/returns/${r.id}/post`,{refundReference:'synthetic'})).status,409);
  assert.equal(Number(db("SELECT COUNT(*) n FROM stock_ledger WHERE source_kind='RETURN' AND source_id=?",[r.id])[0].n),0);
  await s.ok('POST',`/returns/${r.id}/cancel`,{reason:'fixture reconciled; no money moved',refundReconciled:true});
  const nullable=await returnDraft(s,a,sale);db('UPDATE returns SET destination_location_id=NULL WHERE id=?',[nullable.id]);await s.ok('POST',`/returns/${nullable.id}/cancel`,{reason:'invalid legacy draft'});
});
test('F05 authorized restock blocks close and repeated post is idempotent',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s),1),sale=await sell(s,f,1);await s.ok('POST',`/shifts/${f.shift.id}/close`);
  const r=await returnDraft(s,f,sale,1,f.location.id);await s.ok('POST',`/returns/${r.id}/authorize`);
  assert.equal((await s.call('POST',`/events/${f.event.id}/close`)).status,409);
  const k=key(),out=await Promise.all(Array.from({length:5},()=>s.call('POST',`/returns/${r.id}/post`,{refundReference:'synthetic'},k)));
  assert.ok(out.every(x=>x.status===200));assert.equal(new Set(out.map(x=>JSON.stringify(x.data))).size,1);
  assert.equal(String(db('SELECT on_hand FROM stock_balances WHERE location_id=? AND product_id=?',[f.location.id,f.product.id])[0].on_hand),'1');
  assert.equal(Number(db("SELECT COUNT(*) n FROM stock_ledger WHERE source_kind='RETURN' AND source_id=?",[r.id])[0].n),1);
});
test('F05 authorize/close race leaves a legal final state; MAIN after close works',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s),1),sale=await sell(s,f,1);await s.ok('POST',`/shifts/${f.shift.id}/close`);
  const r=await returnDraft(s,f,sale,1,f.location.id);
  const result=await Promise.all([s.call('POST',`/returns/${r.id}/authorize`),s.call('POST',`/events/${f.event.id}/close`)]);
  assert.equal(result.filter(x=>x.status===200).length,1);assert.equal(result.filter(x=>x.status===409).length,1);
  if(state('events',f.event.id).status==='CLOSED')assert.equal(state('returns',r.id).state,'DRAFT');
  else assert.equal(state('returns',r.id).state,'AUTHORIZED');
  await s.ok('POST',`/returns/${r.id}/cancel`,{reason:'synthetic no offline refund',refundReconciled:true});
  if(state('events',f.event.id).status==='OPEN')await s.ok('POST',`/events/${f.event.id}/close`);
  const main=await returnDraft(s,f,sale);await s.ok('POST',`/returns/${main.id}/authorize`);await s.ok('POST',`/returns/${main.id}/post`,{refundReference:'main-after-close'});
});
test('F05 post/close race cannot create CLOSED event with positive stock; damaged no restock',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s),2),sale=await sell(s,f,2);await s.ok('POST',`/shifts/${f.shift.id}/close`);
  const r=await returnDraft(s,f,sale,1,f.location.id);await s.ok('POST',`/returns/${r.id}/authorize`);
  const results=await Promise.all([s.call('POST',`/returns/${r.id}/post`,{refundReference:'synthetic'}),s.call('POST',`/events/${f.event.id}/close`)]);
  assert.equal(results[0].status,200);assert.equal(results[1].status,409);assert.equal(state('events',f.event.id).status,'OPEN');
  const damaged=await returnDraft(s,f,sale,1,f.main.id,'DAMAGED');await s.ok('POST',`/returns/${damaged.id}/authorize`);await s.ok('POST',`/returns/${damaged.id}/post`,{refundReference:'damaged'});
  assert.equal(Number(db("SELECT COUNT(*) n FROM stock_ledger WHERE source_kind='RETURN' AND source_id=?",[damaged.id])[0].n),0);
  assert.equal(Number(db('SELECT SUM(quantity) n FROM return_lines rl JOIN returns r ON r.id=rl.return_id WHERE r.sale_id=? AND r.state=\'POSTED\'',[sale.id])[0].n),2);
});
test('F07 actual MariaDB contains 120 booth/product balances, all reachable without duplicates',async()=>{
  const s=await owner(),f=await fixture(s);const locations=[f.location];for(let i=1;i<4;i++){const b=await s.ok('POST','/booths',{eventId:f.event.id,location:'extra-'+i});locations.push(db('SELECT id FROM stock_locations WHERE booth_id=?',[b.id])[0]);}
  const products=[];for(let i=0;i<30;i++){const p=await s.ok('POST','/products',{sku:`ST-${f.suffix}-${i}`,name:'Stock '+i,wholesaleCost:'4.00',minPrice:'8.00'});products.push(p);await s.ok('POST','/stock/receive',{productId:p.id,quantity:4,reason:'synthetic 120 balances'});for(const loc of locations)await s.ok('POST','/stock/transfer',{productId:p.id,quantity:1,fromLocationId:f.main.id,toLocationId:loc.id,reason:'synthetic',handoverConfirmed:true});}
  const seen=new Set();for(const loc of locations){let offset=0;for(;;){const p=await s.ok('GET',`/stock/balances?locationId=${loc.id}&limit=17&offset=${offset}`);assert.equal(p.total,30);for(const row of p.items){const id=`${row.location_id}:${row.product_id}`;assert.ok(!seen.has(id));seen.add(id);}if(!p.hasMore)break;offset+=p.items.length;}}
  assert.equal(seen.size,120);assert.equal((await s.call('GET','/stock/balances?limit=1e2')).status,400);
});
test('F07 101 real report groups and complete CSV; first-100 selectors no longer required',async()=>{
  const s=await owner(),f=await activate(s,await fixture(s),1);const expected=new Set();
  for(let i=0;i<101;i++){
    const p=await s.ok('POST','/products',{sku:`RP-${f.suffix}-${i}`,name:i===100?'=formula,"quoted"\nline':'Report '+i,wholesaleCost:'4.00',minPrice:'8.00'});expected.add(p.id);
    await s.ok('POST','/stock/receive',{productId:p.id,quantity:1,reason:'synthetic'});await s.ok('POST','/stock/transfer',{productId:p.id,quantity:1,fromLocationId:f.main.id,toLocationId:f.location.id,reason:'synthetic',handoverConfirmed:true});await sell(s,f,1,p);
  }
  const seen=new Set();for(let offset=0;;){const p=await s.ok('GET',`/reports/sales?group=product&eventId=${f.event.id}&limit=50&offset=${offset}`);assert.equal(p.total,101);for(const row of p.items){assert.ok(!seen.has(row.id));seen.add(row.id);}if(!p.hasMore)break;offset+=p.items.length;}assert.deepEqual(seen,expected);
  const csv=await s.ok('GET',`/reports/sales.csv?group=product&eventId=${f.event.id}&limit=1&offset=100`);
  const {parseCsv}=await import('./parse-csv.mjs');const parsed=parseCsv(csv);assert.equal(parsed.length,102);assert.deepEqual(new Set(parsed.slice(1).map(x=>x[0])),expected);assert.ok(parsed.some(row=>row[1]===`'=formula,"quoted"\nline`));
  const catalog=await s.ok('GET','/products?limit=100&offset=100');assert.ok(catalog.items.length>0);assert.ok(catalog.total>100);
});
