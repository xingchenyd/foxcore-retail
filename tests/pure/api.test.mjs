import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { api, jsonRequestInit, readAllPages } = await import(pathToFileURL(resolve(process.env.FOXCORE_COMPILED, 'apps/web/src/lib/api.js')));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
for (const [name, headers] of [
  ['plain object', {'X-CSRF-Token':'test-csrf','Idempotency-Key':'test-id'}],
  ['Headers instance', new Headers({'X-CSRF-Token':'test-csrf','Idempotency-Key':'test-id'})],
  ['tuple array', [['X-CSRF-Token','test-csrf'],['Idempotency-Key','test-id']]],
]) test(`FX-F01-02/03 JSON with ${name}`, async () => {
  let request;
  globalThis.fetch = async (path, init) => { request=new Request('http://localhost'+path,init); return Response.json({id:'3'}); };
  assert.deepEqual(await api('/venues',{method:'POST',headers,body:'{"name":"x"}'}),{id:'3'});
  assert.equal(request.headers.get('content-type'),'application/json');
  assert.equal(request.headers.get('x-csrf-token'),'test-csrf');
  assert.equal(request.headers.get('idempotency-key'),'test-id');
  assert.equal(await request.text(),'{"name":"x"}');
  assert.equal(request.credentials,'same-origin');
});
test('FX-F01-01 no custom headers and abort signal', () => {
  const signal=new AbortController().signal;
  const init=jsonRequestInit({method:'POST',body:'{}',signal});
  assert.equal(init.signal,signal); assert.equal(init.headers.get('content-type'),'application/json');
});
test('FX-F01-04 mixed case cannot override JSON contract', () => {
  const init=jsonRequestInit({body:'{}',headers:{'cOnTeNt-TyPe':'text/plain','x-csrf-token':'c'}});
  assert.equal(init.headers.get('Content-Type'),'application/json'); assert.equal(init.headers.get('X-CSRF-Token'),'c');
});
test('JSON-only helper rejects FormData/Blob rather than mislabelling uploads', () => {
  assert.throws(()=>jsonRequestInit({body:new FormData()}), /JSON/);
  assert.throws(()=>jsonRequestInit({body:new Blob(['hi'])}), /JSON/);
});
test('bodyless GET preserves caller headers and has no invented JSON body', () => {
  const init=jsonRequestInit({headers:{Accept:'application/json'}});
  assert.equal(init.body,undefined); assert.equal(init.headers.get('content-type'),null);
});
test('API rejects foreign or protocol-relative paths', async () => {
  await assert.rejects(api('//example.com/'),/路径/); await assert.rejects(api('https://example.com'),/路径/);
});
test('HTTP error preserves status/code, never returns success', async () => {
  globalThis.fetch=async()=>Response.json({code:'CONFLICT',message:'版本冲突'},{status:409});
  await assert.rejects(api('/x'),e=>e.status===409 && e.code==='CONFLICT' && e.message==='版本冲突');
});
test('network rejection remains rejected',async()=>{
  globalThis.fetch=async()=>{throw new TypeError('offline');}; await assert.rejects(api('/x'),/offline/);
});
test('FX-F07-03 loader requests real additional API pages',async()=>{
  const calls=[];
  globalThis.fetch=async(path)=>{ const url=new URL(path,'http://localhost'); const offset=Number(url.searchParams.get('offset')); calls.push(offset);
    return Response.json({items:Array.from({length:offset===0?100:21},(_,n)=>({id:String(n+offset+1)})),limit:100,offset,total:121,hasMore:offset===0}); };
  const result=await readAllPages('/products?active=true');
  assert.equal(result.items.length,121); assert.equal(result.items[120].id,'121'); assert.deepEqual(calls,[0,100]);
});
test('loader refuses silent resource-cap truncation',async()=>{
  globalThis.fetch=async()=>Response.json({items:[{id:'1'}],limit:1,offset:0,total:10001,hasMore:true});
  await assert.rejects(readAllPages('/products'),/上限/);
});
test('loader abort signal is forwarded to every page',async()=>{
  const signal=new AbortController().signal;
  globalThis.fetch=async(path,init)=>{assert.equal(init.signal,signal);return Response.json({items:[],limit:100,offset:0,total:0,hasMore:false});};
  await readAllPages('/products',signal);
});
test('loader rejects non-progressing or inconsistent pagination',async()=>{
  globalThis.fetch=async()=>Response.json({items:[],limit:100,offset:0,total:20,hasMore:true});
  await assert.rejects(readAllPages('/products'),/分页/);
});
