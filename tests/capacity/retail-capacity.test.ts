/** Synthetic local workload, not a claim about a purchased cloud server or device. */
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DateTime} from 'luxon';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.TEST_BASE_URL;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base??'')||process.env.TEST_CONFIRM!=='yes')throw Error('Dedicated loopback instance required');
type P=Record<string,any>;
class Client{
 token='';csrf='';latencies:number[]=[];
 async call(path:string,data?:P){const t=performance.now(),r=await fetch(base+'/api/v1'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+this.token,'x-csrf-token':this.csrf,'idempotency-key':randomUUID()},...(data?{body:JSON.stringify(data)}:{})});const value=await r.json() as P;this.latencies.push(performance.now()-t);expect(r.status,path+': '+JSON.stringify(value)).toBe(200);return value;}
 async login(username:string,password:string){const a=await this.call('/auth/mini/login',{username,password});this.token=a.accessToken;this.csrf=a.csrf;}
 async all(path:string){const rows:P[]=[];for(;;){const p=await this.call(path+(path.includes('?')?'&':'?')+'limit=100&offset='+rows.length);rows.push(...p.items);if(!p.hasMore)return rows;}}
}
async function parallel<T>(items:T[],n:number,fn:(item:T,i:number)=>Promise<void>){let i=0;await Promise.all(Array.from({length:n},async()=>{for(;;){const j=i++;if(j>=items.length)return;await fn(items[j],j);}}));}
it('supports a local synthetic 100 staff, 30 concurrent, 500 products, 10 events, 3000 posted-sale workload',async()=>{
 const start=performance.now(),owner=new Client();await owner.login(process.env.TEST_OWNER_USERNAME??'owner',process.env.TEST_OWNER_PASSWORD!);const tag=randomUUID().slice(0,8),day=DateTime.now().setZone('Asia/Shanghai'),category=(await owner.call('/categories')).items[0].id;
 const venue=await owner.call('/venues',{name:'容量测试 '+tag,street:'测试1号',city:'测试市',province:'测试省',postalCode:'100000'}),events:P[]=[];
 for(let i=0;i<10;i++){const e=await owner.call('/events',{venueId:venue.id,categoryId:category,name:'容量活动 '+i+' '+tag,startDate:day.toISODate(),endDate:day.toISODate(),taxBps:1300,policyConfirmed:true});const b=await owner.call('/booths',{eventId:e.id,location:'容量展位 '+tag+' '+i});await owner.call('/events/'+e.id+'/open',{});events.push({id:e.id,boothId:b.id});}
 const products:P[]=new Array(500),people:P[]=new Array(100);
 await parallel(Array.from({length:500}),10,async(_,i)=>{products[i]=await owner.call('/products',{sku:'CAP-'+tag+'-'+i,name:'容量商品 '+i,wholesaleCost:'4.00',minPrice:'8.00',suggestedPrice:'11.30'});});
 await parallel(Array.from({length:100}),10,async(_,i)=>{people[i]=await owner.call('/salespeople',{firstName:'容量员工'+i,lastName:tag,commissionBps:500});});
 const locations=await owner.all('/stock/locations?operational=true'),main=locations.find(x=>x.code==='MAIN')!.id,clients:Client[]=[],shifts:string[]=[];
 // Thirty independent employee sessions, not thirty calls sharing an owner's identity.
 await parallel(Array.from({length:30}),5,async(_,i)=>{const c=new Client(),username='capacity_'+tag+'_'+i,initial='Initial-'+randomUUID(),password='Changed-'+randomUUID();await owner.call('/users',{username,password:initial,salespersonId:people[i].id});await c.login(username,initial);await c.call('/auth/password',{currentPassword:initial,newPassword:password});await c.login(username,password);clients[i]=c;const e=events[i%10],s=await owner.call('/shifts',{salespersonId:people[i].id,boothId:e.boothId,plannedStart:day.startOf('day').toISO(),plannedEnd:day.endOf('day').toISO()});await c.call('/shifts/'+s.id+'/start',{openingCash:'0.00'});shifts[i]=s.id;});
 for(let i=0;i<10;i++){const p=products[i],to=locations.find(x=>x.booth_id===events[i].boothId)!.id;await owner.call('/stock/receive',{productId:p.id,quantity:300,reason:'容量测试接收'});const t=await owner.call('/operations/transfers',{productId:p.id,fromLocationId:main,toLocationId:to,quantity:300,reason:'容量测试发出'});await owner.call('/operations/transfers/'+t.id+'/receive',{receivedQuantity:300,damagedQuantity:0,missingQuantity:0,reason:'容量测试签收',version:1});}
 for(const c of clients)c.latencies=[];
 const workloadStart=performance.now(),workflows:number[]=[];
 await Promise.all(clients.map(async(c,i)=>{for(let j=0;j<100;j++){const t=performance.now();const sale=await c.call('/sales',{shiftId:shifts[i],lines:[{productId:products[i%10].id,quantity:1,finalUnitPrice:'11.30'}]});await c.call('/sales/'+sale.id+'/prepare',{version:1});await c.call('/sales/'+sale.id+'/post',{paymentMethod:'TERMINAL',paymentReference:'CAP-'+tag+'-'+i+'-'+j});workflows.push(performance.now()-t);if(j%10===0){await c.call('/sales?limit=20');await c.call('/stock/balances?limit=20');await c.call('/commissions/entries?limit=20');}}}));
 const elapsed=(performance.now()-workloadStart)/1000;
 for(const e of events){const report=await owner.call('/reports/sales?group=event&eventId='+e.id);expect(report.items[0].quantity).toBe('300');expect(report.items[0].net_cents).toBe('300000');expect(report.items[0].tax_cents).toBe('39000');}
 const sorted=clients.flatMap(c=>c.latencies).sort((a,b)=>a-b),ws=workflows.sort((a,b)=>a-b);const p=(arr:number[],q:number)=>Number(arr[Math.ceil(arr.length*q)-1].toFixed(2));
 const result={environment:'Windows local Node24 + native MariaDB, loopback',staff:100,concurrentEmployeeSessions:30,products:500,events:10,postedSales:3000,failedRequests:0,elapsedSeconds:Number(elapsed.toFixed(2)),salesPerSecond:Number((3000/elapsed).toFixed(2)),requests:sorted.length,requestLatencyMs:{p50:p(sorted,.5),p95:p(sorted,.95),p99:p(sorted,.99)},saleWorkflowLatencyMs:{p50:p(ws,.5),p95:p(ws,.95),p99:p(ws,.99)},totalSetupAndRunSeconds:Number(((performance.now()-start)/1000).toFixed(2)),cloudCapacity:'NOT_RUN',wechatDevice:'NOT_RUN'};
 mkdirSync('docs/retail-operations/evidence',{recursive:true});writeFileSync('docs/retail-operations/evidence/capacity.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
},600000);
