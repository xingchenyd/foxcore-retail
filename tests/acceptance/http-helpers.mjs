import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
export const base=process.env.TEST_BASE_URL;
export const project=process.env.FOXCORE_VERIFY_PROJECT;
export const run=process.env.FOXCORE_VERIFY_RUN;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base??'')||!/^foxverify_[0-9a-f]{12}$/.test(project??'')||project!==`foxverify_${run}`)throw new Error('Refusing tests against an unowned application: run verify:full');
export const key=()=>randomUUID();
export const tag=()=>randomUUID().slice(0,8);
export function session(){
  let cookie='',csrf='';
  async function call(method,path,payload,commandKey=key()){
    const res=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{'X-CSRF-Token':csrf,'Idempotency-Key':commandKey})},body:method==='GET'?undefined:JSON.stringify(payload??{})});
    const text=await res.text();let data;try{data=JSON.parse(text);}catch{data=text;}
    if(path==='/auth/login'&&res.ok){cookie=res.headers.get('set-cookie')?.split(';')[0]??'';csrf=data.csrf;}
    return {status:res.status,data,headers:res.headers};
  }
  async function ok(method,path,payload,k){const r=await call(method,path,payload,k);assert.ok(r.status>=200&&r.status<300,`${method} ${path} -> ${r.status}`);return r.data;}
  return {call,ok};
}
export async function owner(){const s=session();await s.ok('POST','/auth/login',{username:'owner',password:readFileSync(process.env.TEST_OWNER_PASSWORD_FILE,'utf8')});return s;}
export function db(sql,values=[]){
  // Only the app container created by the orchestrator, verified by its exact run label.
  const id=execFileSync('docker',['compose','-f','compose.verify.yaml','-p',project,'ps','-q','app'],{encoding:'utf8'}).trim();
  assert.match(id,/^[a-f0-9]{12,64}$/);
  const label=execFileSync('docker',['inspect','--format','{{ index .Config.Labels "foxcore.verify.run" }}',id],{encoding:'utf8'}).trim();assert.equal(label,run);
  const script=`import mysql from 'mysql2/promise';import{readFileSync}from'node:fs';const c=await mysql.createConnection({host:'db',user:'foxcore',database:'foxcore',password:readFileSync('/run/foxcore-app/db_password','utf8').trim(),supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});try{const [r]=await c.query(${JSON.stringify(sql)},${JSON.stringify(values)});console.log(JSON.stringify(r));}finally{await c.end();}`;
  return JSON.parse(execFileSync('docker',['exec','-i',id,'node','--input-type=module'],{input:script,encoding:'utf8',maxBuffer:16*1024*1024}));
}
export async function fixture(s,{commissionBps=500,taxBps=1300,policyConfirmed=true}={}){
  const {DateTime}=await import('luxon');const day=DateTime.now().setZone('America/Toronto');const suffix=tag();
  const venue=await s.ok('POST','/venues',{name:'FX '+suffix,street:'1 Synthetic St',city:'Toronto',province:'Ontario',postalCode:'M5V 2T6'});
  const cat=(await s.ok('GET','/categories')).items[0].id;
  const event=await s.ok('POST','/events',{venueId:venue.id,categoryId:cat,name:'FX '+suffix,startDate:day.minus({days:1}).toISODate(),endDate:day.toISODate(),taxBps,policyConfirmed,currency:'CAD',priceBasis:'EXCLUSIVE',businessTimezone:'America/Toronto'});
  const booth=await s.ok('POST','/booths',{eventId:event.id,location:'B-'+suffix});
  const person=await s.ok('POST','/salespeople',{firstName:'FX',lastName:suffix,commissionBps});
  const product=await s.ok('POST','/products',{sku:'FX-'+suffix,name:'Product '+suffix,wholesaleCost:'4.00',minPrice:'8.00',suggestedPrice:'10.00',currency:'CAD'});
  const [location]=db('SELECT id FROM stock_locations WHERE booth_id=?',[booth.id]);const [main]=db("SELECT id FROM stock_locations WHERE code='MAIN'");
  return {event,booth,person,product,location,main,day,suffix};
}
export async function activate(s,f,qty=10){
  await s.ok('POST',`/events/${f.event.id}/open`);
  const shift=await s.ok('POST','/shifts',{salespersonId:f.person.id,boothId:f.booth.id,plannedStart:f.day.startOf('day').toISO(),plannedEnd:f.day.endOf('day').toISO()});
  await s.ok('POST',`/shifts/${shift.id}/start`);f.shift=shift;
  await s.ok('POST','/stock/receive',{productId:f.product.id,quantity:qty,reason:'Synthetic acceptance receipt'});
  await s.ok('POST','/stock/transfer',{productId:f.product.id,quantity:qty,fromLocationId:f.main.id,toLocationId:f.location.id,reason:'Synthetic handover',handoverConfirmed:true});return f;
}
export async function draft(s,f,quantity=3,product=f.product){return s.ok('POST','/sales',{shiftId:f.shift.id,lines:[{productId:product.id,quantity,finalUnitPrice:'10.00'}]});}
export async function sell(s,f,quantity=3,product=f.product){const sale=await draft(s,f,quantity,product);await s.ok('POST',`/sales/${sale.id}/prepare`,{version:1});await s.ok('POST',`/sales/${sale.id}/post`,{paymentMethod:'CASH',cashReceived:String(quantity*12)+'.00'});return sale;}
export async function returnDraft(s,f,sale,quantity=1,destination=f.main.id,disposition='RESTOCK'){return s.ok('POST','/returns',{saleId:sale.id,reason:'Synthetic return',destinationLocationId:destination,lines:[{saleLineNo:1,quantity,disposition}]});}
