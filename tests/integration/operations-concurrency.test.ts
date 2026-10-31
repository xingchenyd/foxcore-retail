import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_BASE_URL;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base??'')||process.env.TEST_CONFIRM!=='yes')throw Error('Dedicated loopback runtime required');
it('serializes twenty independent first counts of one missing balance row',async()=>{
 const login=await fetch(base+'/api/v1/auth/mini/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:process.env.TEST_OWNER_USERNAME??'owner',password:process.env.TEST_OWNER_PASSWORD})});const auth=await login.json() as any;expect(login.status).toBe(200);
 async function call(path:string,data?:object){const r=await fetch(base+'/api/v1'+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer '+auth.accessToken,'x-csrf-token':auth.csrf,'idempotency-key':randomUUID()},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json() as any};}
 const product=await call('/products',{sku:'RACE-'+randomUUID().slice(0,8),name:'首次盘点并发',wholesaleCost:'1.00',minPrice:'2.00'});expect(product.status).toBe(200);
 const loc=(await call('/stock/locations?operational=true')).data.items.find((x:any)=>x.code==='MAIN');
 const results=await Promise.all(Array.from({length:20},(_,i)=>call('/stock/adjust',{productId:product.data.id,locationId:loc.id,countedQuantity:i+1,expectedVersion:0,reason:'独立盘点并发竞争'})));
 expect(results.filter(x=>x.status===200)).toHaveLength(1);expect(results.filter(x=>x.status===409)).toHaveLength(19);
 const balance=(await call('/stock/balances?limit=100&locationId='+loc.id)).data.items.find((x:any)=>x.product_id===product.data.id);
 // Product may be beyond the first page. Query pages explicitly rather than infer success.
 let found=balance,offset=0;while(!found){offset+=100;const p=(await call('/stock/balances?locationId='+loc.id+'&limit=100&offset='+offset)).data;found=p.items.find((x:any)=>x.product_id===product.data.id);if(!p.hasMore)break;}
 expect(found).toBeTruthy();expect(found.version).toBe(2);
 const denied=await call('/stock/transfer',{productId:product.data.id,quantity:1,fromLocationId:loc.id,toLocationId:loc.id,reason:'旁路',handoverConfirmed:true});expect(denied.status).toBe(400);
},120000);
