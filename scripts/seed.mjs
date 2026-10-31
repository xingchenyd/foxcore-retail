import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

if(process.env.APP_ENV==='production'||process.env.SEED_CONFIRM!=='yes') throw new Error('Synthetic seed requires a nonproduction environment and SEED_CONFIRM=yes');
const base=process.env.SEED_BASE_URL??'http://127.0.0.1:3000';
const username=process.env.SEED_OWNER_USERNAME,password=process.env.SEED_OWNER_PASSWORD;
if(!username||!password) throw new Error('Set SEED_OWNER_USERNAME and SEED_OWNER_PASSWORD privately');
let cookie='',csrf='';
async function call(method,path,payload){
  const response=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(method!=='GET'&&csrf?{'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()}: {})},body:method==='GET'?undefined:JSON.stringify(payload??{})});
  const result=await response.json();
  if(!response.ok) throw new Error(`${method} ${path}: ${response.status} ${result.message??result.code}`);
  if(path==='/auth/login') cookie=response.headers.get('set-cookie')?.split(';')[0]??'';
  return result;
}
const login=await call('POST','/auth/login',{username,password});
if(login.user.mustChangePassword) throw new Error('Change the one-time owner password before creating synthetic data');
csrf=login.csrf;
const existing=await call('GET','/venues?limit=100');
if(existing.items.some(x=>x.name==='Synthetic Foxcore Dataset v1')){console.log('Synthetic dataset already exists; skipped.');process.exit(0);}
const date=DateTime.now().setZone('America/Toronto');
const day=date.toISODate(),start=date.startOf('day').toISO(),end=date.endOf('day').toISO();
const venue=await call('POST','/venues',{name:'Synthetic Foxcore Dataset v1',street:'1 Learning Way',city:'Toronto',province:'Ontario',postalCode:'M5V 2T6',description:'Synthetic teaching data, not real Foxcore operations'});
const category=(await call('GET','/categories')).items;
const events=[],booths=[],locations=[];
for(let i=0;i<7;i++){
  const event=await call('POST','/events',{name:`Synthetic ${category[i].type} ${i+1}`,venueId:venue.id,categoryId:category[i].id,startDate:day,endDate:day,description:'Synthetic teaching fixture',taxBps:1300,policyConfirmed:true,currency:'CAD',priceBasis:'EXCLUSIVE',businessTimezone:'America/Toronto'});events.push(event.id);
  for(let j=0;j<2;j++) booths.push((await call('POST','/booths',{eventId:event.id,location:`${String.fromCharCode(65+i)}${j+1}`})).id);
  await call('POST',`/events/${event.id}/open`,{});
}
const products=[];
for(let i=0;i<30;i++) products.push((await call('POST','/products',{sku:`SYN-${String(i+1).padStart(3,'0')}`,name:`Synthetic product ${i+1}`,wholesaleCost:`${(i%5)+2}.00`,minPrice:`${(i%5)+5}.00`,suggestedPrice:`${(i%5)+9}.00`,currency:'CAD'})).id);
const people=[],shifts=[];
for(let i=0;i<17;i++){
  const person=await call('POST','/salespeople',{firstName:'Synthetic',lastName:`Seller ${i+1}`,description:'Teaching fixture',commissionBps:500});people.push(person.id);
  const shift=await call('POST','/shifts',{salespersonId:person.id,boothId:booths[i%booths.length],plannedStart:start,plannedEnd:end});shifts.push(shift.id);
  await call('POST',`/shifts/${shift.id}/start`,{});
}
const allLocations=(await call('GET','/stock/locations')).items;
const warehouse=allLocations.find(x=>x.code==='MAIN').id;
for(const booth of booths) locations.push(allLocations.find(x=>x.booth_id===booth).id);
for(let p=0;p<products.length;p++){
  await call('POST','/stock/receive',{productId:products[p],quantity:8000,reason:'Synthetic opening stock'});
  for(const loc of locations) await call('POST','/stock/transfer',{productId:products[p],quantity:500,fromLocationId:warehouse,toLocationId:loc,reason:'Synthetic handover',handoverConfirmed:true});
}
let firstSale=null;
for(let i=0;i<300;i++){
  const shiftIndex=i%shifts.length,productIndex=(i*7+Math.floor(i/17))%products.length;
  const draft=await call('POST','/sales',{shiftId:shifts[shiftIndex],lines:[{productId:products[productIndex],quantity:i%3+1,finalUnitPrice:`${(productIndex%5)+8}.00`}]});
  const prepared=await call('POST',`/sales/${draft.id}/prepare`,{version:1});
  await call('POST',`/sales/${draft.id}/post`,{paymentMethod:'TERMINAL',paymentReference:`SYNTHETIC-${String(i+1).padStart(4,'0')}`});
  if(!firstSale) firstSale=draft.id;
  if((i+1)%50===0) console.log(`${i+1}/300 synthetic sales posted`);
}
const cancelled=await call('POST','/sales',{shiftId:shifts[0],lines:[{productId:products[0],quantity:1,finalUnitPrice:'9.00'}]});
await call('POST',`/sales/${cancelled.id}/cancel`,{reason:'Synthetic cancelled draft'});
const pending=await call('POST','/sales',{shiftId:shifts[1],lines:[{productId:products[1],quantity:1,finalUnitPrice:'9.00'}]});
await call('POST',`/sales/${pending.id}/prepare`,{version:1});
const restock=await call('POST','/returns',{saleId:firstSale,reason:'Synthetic restock return',destinationLocationId:warehouse,lines:[{saleLineNo:1,quantity:1,disposition:'RESTOCK'}]});
await call('POST',`/returns/${restock.id}/authorize`,{});await call('POST',`/returns/${restock.id}/post`,{refundReference:'SYNTHETIC-REFUND-1'});
const settlement=await call('POST','/commissions/prepare',{salespersonId:people[0]});
await call('POST',`/commissions/${settlement.id}/pay`,{paymentReference:'SYNTHETIC-COMMISSION-1'});
console.log('Synthetic dataset created: 7 event categories, 17 salespeople, 30 products, 300 posted sales, cancellation, checkout, return, paid commission.');
