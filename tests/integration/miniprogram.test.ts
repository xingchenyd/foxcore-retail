import {describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DateTime} from 'luxon';
const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3000';
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||process.env.TEST_CONFIRM!=='yes')throw new Error('Dedicated localhost integration database required');
const password=process.env.TEST_OWNER_PASSWORD;if(!password)throw new Error('Private test owner password required');
type Json=Record<string,any>;
class Client {
  token='';csrf='';cookie='';
  constructor(readonly mini:boolean){}
  async call(method:string,path:string,data?:object,key=randomUUID(),override:Record<string,string>={}){
    const response=await fetch(base+'/api/v1'+path,{method,headers:{'content-type':'application/json',...(this.token?{authorization:'Bearer '+this.token}:this.cookie?{cookie:this.cookie}:{}),...(method==='GET'?{}:{'x-csrf-token':this.csrf,'idempotency-key':key}),...override},body:method==='GET'?undefined:JSON.stringify(data??{})});
    return {status:response.status,data:await response.json() as Json,cookie:response.headers.get('set-cookie')};
  }
  async ok(method:string,path:string,data?:object,key?:string){const r=await this.call(method,path,data,key);expect(r.status,method+' '+path+': '+JSON.stringify(r.data)).toBe(200);return r.data;}
  async login(username:string,password:string){const r=await this.call('POST',this.mini?'/auth/mini/login':'/auth/login',{username,password});expect(r.status).toBe(200);this.csrf=r.data.csrf;if(this.mini){expect(r.cookie).toBeNull();expect(r.data.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);this.token=r.data.accessToken;}else{expect(r.data.accessToken).toBeUndefined();this.cookie=r.cookie?.split(';')[0]??'';}return r.data;}
  async all(path:string):Promise<Json[]>{const items:Json[]=[];for(;;){const page=await this.ok('GET',path+'?limit=100&offset='+items.length);items.push(...page.items);if(!page.hasMore)return items;}}
}
describe('staff Mini Program sharing existing web database',()=>{
  it('completes stock → sale → partial refund → commission, with web readback and strict roles',async()=>{
    const owner=new Client(true),web=new Client(false),staff=new Client(true),other=new Client(true);
    await owner.login(process.env.TEST_OWNER_USERNAME??'owner',password);await web.login(process.env.TEST_OWNER_USERNAME??'owner',password);
    const tag=randomUUID().slice(0,8),day=DateTime.now().setZone('America/Toronto');
    const venue=await owner.ok('POST','/venues',{name:'Mini '+tag,street:'1 Test St',city:'Toronto',province:'Ontario',postalCode:'M5V 2T6'});
    const category=(await owner.ok('GET','/categories')).items[0].id;
    const event=await owner.ok('POST','/events',{venueId:venue.id,categoryId:category,name:'Mini Event '+tag,startDate:day.toISODate(),endDate:day.toISODate(),taxBps:1300,policyConfirmed:true,currency:'CAD',priceBasis:'EXCLUSIVE',businessTimezone:'America/Toronto'});
    const booth=await owner.ok('POST','/booths',{eventId:event.id,location:'MINI-'+tag});await owner.ok('POST',`/events/${event.id}/open`);
    const p=await owner.ok('POST','/products',{sku:'MINI-'+tag,name:'Mini Product '+tag,wholesaleCost:'4.00',minPrice:'8.00',suggestedPrice:'10.00',currency:'CAD'});
    const person=await owner.ok('POST','/salespeople',{firstName:'Mini',lastName:tag,commissionBps:500});
    const username='mini_'+tag,initial='Initial-'+randomUUID(),changed='Changed-'+randomUUID();
    await owner.ok('POST','/users',{username,password:initial,salespersonId:person.id});
    expect((await staff.login(username,initial)).user.mustChangePassword).toBe(true);
    expect((await staff.call('POST','/sales',{})).data.code).toBe('PASSWORD_CHANGE_REQUIRED');
    await staff.ok('POST','/auth/logout');expect((await staff.call('GET','/sales')).status).toBe(401);
    await staff.login(username,initial);await staff.ok('POST','/auth/password',{currentPassword:initial,newPassword:changed});expect((await staff.call('GET','/sales')).status).toBe(401);await staff.login(username,changed);
    const shift=await owner.ok('POST','/shifts',{salespersonId:person.id,boothId:booth.id,plannedStart:day.startOf('day').toISO(),plannedEnd:day.endOf('day').toISO()});await staff.ok('POST',`/shifts/${shift.id}/start`);
    const loc=await owner.all('/stock/locations'),main=loc.find((x:Json)=>x.code==='MAIN').id,target=loc.find((x:Json)=>x.booth_id===booth.id).id;
    expect((await staff.call('GET','/stock/locations')).status).toBe(200);expect((await staff.call('GET','/returns')).status).toBe(200);expect((await staff.call('POST','/commissions/prepare',{salespersonId:person.id})).status).toBe(403);
    await owner.ok('POST','/stock/receive',{productId:p.id,quantity:12,reason:'Mini receipt'});await owner.ok('POST','/stock/transfer',{productId:p.id,quantity:8,fromLocationId:main,toLocationId:target,reason:'Mini handover',handoverConfirmed:true});
    const balances=(await staff.ok('GET','/stock/balances')).items;expect(balances.some((x:Json)=>x.location_id===main)).toBe(true);
    expect((await staff.ok('GET','/products')).items.find((x:Json)=>x.id===p.id).wholesale_cost_cents).toBeUndefined();
    const sale=await staff.ok('POST','/sales',{shiftId:shift.id,lines:[{productId:p.id,quantity:1,finalUnitPrice:'10.00'}]});
    await staff.ok('POST',`/sales/${sale.id}/edit`,{version:1,lines:[{productId:p.id,quantity:2,finalUnitPrice:'10.00'}]});
    expect((await web.ok('GET',`/sales/${sale.id}`)).sale.version).toBe(2);
    expect((await staff.call('POST',`/sales/${sale.id}/prepare`,{version:2},randomUUID(),{'x-csrf-token':'bad'})).status).toBe(403);
    await staff.ok('POST',`/sales/${sale.id}/prepare`,{version:2});
    const key=randomUUID(),body={paymentMethod:'CASH',cashReceived:'25.00'};
    const posted=await Promise.all([staff.ok('POST',`/sales/${sale.id}/post`,body,key),staff.ok('POST',`/sales/${sale.id}/post`,body,key)]);expect(posted[0]).toEqual(posted[1]);expect(posted[0].changeCents).toBe('240');
    expect((await web.ok('GET',`/sales/${sale.id}`)).sale.state).toBe('POSTED');
    const ret=await owner.ok('POST','/returns',{saleId:sale.id,reason:'Mini partial return',destinationLocationId:main,lines:[{saleLineNo:1,quantity:1,disposition:'RESTOCK'}]});expect((await owner.ok('POST',`/returns/${ret.id}/authorize`)).totalCents).toBe('1130');await owner.ok('POST',`/returns/${ret.id}/post`,{refundReference:'MINI-'+tag});
    expect((await web.ok('GET',`/returns/${ret.id}`)).return.state).toBe('POSTED');
    const settlement=await owner.ok('POST','/commissions/prepare',{salespersonId:person.id});expect(settlement.totalCents).toBe('50');
    const detail=await staff.ok('GET',`/commissions/settlements/${settlement.id}`);expect(detail.lines).toHaveLength(2);expect(detail.lines.some((x:Json)=>x.source_kind==='RETURN'&&x.amount_cents==='-50')).toBe(true);
    const outsider=await owner.ok('POST','/salespeople',{firstName:'Other',lastName:tag,commissionBps:500}),otherName='other_'+tag,otherPass='Other-'+randomUUID();await owner.ok('POST','/users',{username:otherName,password:otherPass,salespersonId:outsider.id});await other.login(otherName,otherPass);
    expect((await other.call('GET',`/commissions/settlements/${settlement.id}`)).status).toBe(404);expect((await other.call('GET',`/sales/${sale.id}`)).status).toBe(200);
    await owner.ok('POST',`/commissions/${settlement.id}/pay`,{paymentReference:'MINI-PAID-'+tag});expect((await web.ok('GET',`/commissions/settlements/${settlement.id}`)).settlement.state).toBe('PAID');
    const stock=(await owner.ok('GET','/stock/balances?locationId='+target)).items.find((x:Json)=>x.product_id===p.id&&x.location_id===target);expect(String(stock.on_hand)).toBe('6');expect(String(stock.reserved)).toBe('0');
    const adjust={productId:p.id,locationId:target,countedQuantity:7,expectedVersion:stock.version,reason:'Mini recount'};await owner.ok('POST','/stock/adjust',adjust);expect((await owner.call('POST','/stock/adjust',{...adjust,countedQuantity:8})).status).toBe(409);
    const mixed=await fetch(base+'/api/v1/sales',{headers:{authorization:'Bearer '+owner.token,cookie:web.cookie}});expect(mixed.status).toBe(401);
    await staff.ok('POST',`/shifts/${shift.id}/close`);await staff.ok('POST','/auth/logout');expect((await staff.call('GET','/commissions/entries')).status).toBe(401);
  },120_000);
});
