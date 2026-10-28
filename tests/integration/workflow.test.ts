import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';

const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||process.env.TEST_CONFIRM!=='yes') throw new Error('Integration tests require localhost TEST_BASE_URL and TEST_CONFIRM=yes');
const username=process.env.TEST_OWNER_USERNAME??'owner',password=process.env.TEST_OWNER_PASSWORD;
if(!password) throw new Error('Set TEST_OWNER_PASSWORD privately');
type Json=Record<string,any>;
let cookie='',csrf='';
async function request(method:string,path:string,payload?:unknown,key?:string):Promise<{status:number;data:Json}>{
  const response=await fetch(base+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf&&method!=='GET'?{'X-CSRF-Token':csrf,'Idempotency-Key':key??randomUUID()}: {})},body:method==='GET'?undefined:JSON.stringify(payload??{})});
  const data=await response.json() as Json;
  if(path==='/auth/login'&&response.ok) cookie=response.headers.get('set-cookie')?.split(';')[0]??'';
  return {status:response.status,data};
}
async function ok(method:string,path:string,payload?:unknown,key?:string):Promise<Json>{const r=await request(method,path,payload,key);expect(r.status,`${method} ${path}: ${JSON.stringify(r.data)}`).toBeGreaterThanOrEqual(200);expect(r.status).toBeLessThan(300);return r.data;}
async function all(path:string):Promise<Json[]>{const items:Json[]=[];for(;;){const page=await ok('GET',path+'?limit=100&offset='+items.length);items.push(...page.items);if(!page.hasMore)return items;}}

describe('real MariaDB HTTP workflow',()=>{
  it('protects stock, history, refund and commission under concurrent commands',async()=>{
    const login=await ok('POST','/auth/login',{username,password});expect(login.user.role).toBe('OWNER');expect(login.user.mustChangePassword).toBe(false);csrf=login.csrf;
    const tag=randomUUID().slice(0,8),day=DateTime.now().setZone('America/Toronto');
    const venue=await ok('POST','/venues',{name:'Integration '+tag,street:'1 Test St',city:'Toronto',province:'Ontario',postalCode:'M5V 2T6'});
    const category=(await ok('GET','/categories')).items[0].id;
    for(const invalidDate of ['2026-02-30','1900-02-29','2026-13-01']){
      const rejected=await request('POST','/events',{venueId:venue.id,categoryId:category,name:'Invalid date '+tag,startDate:invalidDate,endDate:invalidDate,taxBps:1300,policyConfirmed:true,currency:'CAD',priceBasis:'EXCLUSIVE',businessTimezone:'America/Toronto'});
      expect(rejected.status).toBe(400);expect(rejected.data.code).toBe('BAD_REQUEST');
    }
    const event=await ok('POST','/events',{venueId:venue.id,categoryId:category,name:'Integration Event '+tag,startDate:day.toISODate(),endDate:day.toISODate(),taxBps:1300,policyConfirmed:true,currency:'CAD',priceBasis:'EXCLUSIVE',businessTimezone:'America/Toronto'});
    const booth=await ok('POST','/booths',{eventId:event.id,location:'S11'});
    await ok('POST',`/events/${event.id}/open`);
    const product=await ok('POST','/products',{sku:'INT-'+tag,name:'Integration Product',wholesaleCost:'4.00',minPrice:'8.00',suggestedPrice:'10.00',currency:'CAD'});
    const person=await ok('POST','/salespeople',{firstName:'Integration',lastName:'Seller',commissionBps:500});
    const staffUsername='staff_'+tag,staffPassword='F0xcore-'+randomUUID();
    await ok('POST','/users',{username:staffUsername,password:staffPassword,salespersonId:person.id});
    const shift=await ok('POST','/shifts',{salespersonId:person.id,boothId:booth.id,plannedStart:day.startOf('day').toISO(),plannedEnd:day.endOf('day').toISO()});
    await ok('POST',`/shifts/${shift.id}/start`);
    const locations=await all('/stock/locations');
    const warehouse=locations.find((x:Json)=>x.code==='MAIN').id;
    const boothLocation=locations.find((x:Json)=>x.booth_id===booth.id).id;
    await ok('POST','/stock/receive',{productId:product.id,quantity:1,reason:'Integration receipt'});
    await ok('POST','/stock/transfer',{productId:product.id,quantity:1,fromLocationId:warehouse,toLocationId:boothLocation,reason:'Integration handover',handoverConfirmed:true});
    const low=await ok('POST','/sales',{shiftId:shift.id,lines:[{productId:product.id,quantity:1,finalUnitPrice:'7.99'}]});
    expect((await request('POST',`/sales/${low.id}/prepare`,{version:1})).status).toBe(409);
    const badQty=await request('POST','/sales',{shiftId:shift.id,lines:[{productId:product.id,quantity:0,finalUnitPrice:'10.00'}]});expect(badQty.status).toBe(400);
    const drafts=await Promise.all(Array.from({length:20},()=>ok('POST','/sales',{shiftId:shift.id,lines:[{productId:product.id,quantity:1,finalUnitPrice:'10.00'}]})));
    const prepared=await Promise.all(drafts.map(d=>request('POST',`/sales/${d.id}/prepare`,{version:1})));
    expect(prepared.filter(x=>x.status===200)).toHaveLength(1);
    expect(prepared.filter(x=>x.status===409)).toHaveLength(19);
    const winner=drafts[prepared.findIndex(x=>x.status===200)];
    const key=randomUUID(),postBody={paymentMethod:'CASH',cashReceived:'12.00'};
    const posted=await Promise.all(Array.from({length:20},()=>request('POST',`/sales/${winner.id}/post`,postBody,key)));
    expect(posted.every(x=>x.status===200)).toBe(true);
    expect(new Set(posted.map(x=>JSON.stringify(x.data))).size).toBe(1);
    expect((await request('POST',`/sales/${winner.id}/post`,{paymentMethod:'CASH',cashReceived:'13.00'},key)).status).toBe(409);
    const detailed=await ok('GET',`/sales/${winner.id}`);expect(detailed.sale.total_cents).toBe('1130');
    const staffLogin=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:staffUsername,password:staffPassword})});
    expect(staffLogin.status).toBe(200);
    const staffCookie=staffLogin.headers.get('set-cookie')?.split(';')[0]??'';
    const staffSession=await staffLogin.json() as Json;
    const staffGet=async(path:string)=>fetch(base+'/api/v1'+path,{headers:{Cookie:staffCookie}});
    expect((await staffGet('/salespeople')).status).toBe(403);
    expect((await staffGet('/audit')).status).toBe(403);
    expect((await staffGet('/stock/locations')).status).toBe(200);
    const staffProducts=await (await staffGet('/products')).json() as Json;
    expect(staffProducts.items.find((x:Json)=>x.id===product.id)?.wholesale_cost_cents).toBeUndefined();
    expect((await staffGet(`/sales/${winner.id}`)).status).toBe(200);
    const staffReport=await (await staffGet('/reports/sales?group=product')).json() as Json;
    expect(staffReport.items.find((x:Json)=>x.id===product.id)?.estimated_margin_cents).toBeUndefined();
    const staffSales=await (await staffGet('/sales?limit=1')).json() as Json;
    expect(staffSales.total).toBeGreaterThanOrEqual(21);expect(staffSales.hasMore).toBe(true);expect(staffSales.items).toHaveLength(1);
    const staffLastPage=await (await staffGet('/sales?limit=1&offset='+staffSales.total)).json() as Json;
    expect(staffLastPage.total).toBe(staffSales.total);expect(staffLastPage.hasMore).toBe(false);expect(staffLastPage.items).toHaveLength(0);
    for(const query of ['limit=1e2','offset=','offset=10000001']) expect((await staffGet('/sales?'+query)).status).toBe(400);
    // Initial-password accounts must be able to revoke their session while business writes remain blocked.
    expect(staffSession.user.mustChangePassword).toBe(true);
    const staffLogout=await fetch(base+'/api/v1/auth/logout',{method:'POST',headers:{'Content-Type':'application/json',Cookie:staffCookie,'X-CSRF-Token':staffSession.csrf},body:'{}'});
    expect(staffLogout.status).toBe(200);expect((await staffGet('/sales')).status).toBe(401);
    const ret=await ok('POST','/returns',{saleId:winner.id,reason:'Integration return',destinationLocationId:warehouse,lines:[{saleLineNo:1,quantity:1,disposition:'RESTOCK'}]});
    const authorized=await ok('POST',`/returns/${ret.id}/authorize`);expect(authorized.totalCents).toBe('1130');
    await ok('POST',`/returns/${ret.id}/post`,{refundReference:'INTEGRATION-'+tag});
    const reports=(await ok('GET','/reports/sales?group=event&eventId='+event.id)).items;const row=reports.find((x:Json)=>x.id===event.id);expect(row.net_cents).toBe('0');
    expect((await request('GET','/no-such-route')).status).toBe(404);
  },120_000);
});
