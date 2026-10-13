import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const rules=await import(pathToFileURL(resolve(process.env.FOXCORE_COMPILED,'apps/server/src/fix-rules.js')));
const {parsePage,parseVersion,parseRate,parseId,updateEventPolicy,assertCancelableShift,assertReturnTarget,sortedIds}=rules;
test('pagination defaults, last and empty pages',()=>{
  assert.deepEqual(parsePage({}),{limit:20,offset:0}); assert.deepEqual(parsePage({limit:'100',offset:'120'}),{limit:100,offset:120});
});
for(const [key,value] of [['limit','0'],['limit','101'],['limit','1e2'],['limit',' 20'],['limit',true],['limit',['20','30']],['offset','-1'],['offset','1.2'],['offset',''],['offset','10000001']])
  test(`FX-F07-05 reject ${key}=${JSON.stringify(value)}`,()=>assert.throws(()=>parsePage({[key]:value}),e=>e.status===400));
for(const value of ['1',0,-1,null,true,1.2,4294967295]) test(`FX-F02-06 reject version ${JSON.stringify(value)}`,()=>assert.throws(()=>parseVersion(value),e=>e.status===400));
test('versions are bounded positive JSON integers',()=>assert.equal(parseVersion(1),1));
for(const value of [null,'500',true,-1,10001,0.5]) test(`FX-F03-06 reject rate ${JSON.stringify(value)}`,()=>assert.throws(()=>parseRate(value),e=>e.status===400));
test('FX-F03-02/07 zero and full basis-point rates are valid',()=>{assert.equal(parseRate(0),0);assert.equal(parseRate(10000),10000);});
test('IDs remain strings, even above JavaScript safe-integer range',()=>assert.equal(parseId('9007199254740993'),'9007199254740993'));
for(const id of ['',0,'0','-1','1 OR 1=1',['1']]) test(`invalid identifier ${JSON.stringify(id)}`,()=>assert.throws(()=>parseId(id)));
const draft={status:'DRAFT',version:1,tax_bps:null,policy_confirmed:0};
test('FX-F03-01 incomplete event policy can be completed',()=>assert.deepEqual(updateEventPolicy(draft,{version:1,taxBps:1300,policyConfirmed:true}),{taxBps:1300,policyConfirmed:true,version:2}));
test('event patch preserves fields not submitted and accepts explicit null/false/zero',()=>{
  assert.deepEqual(updateEventPolicy(draft,{version:1,taxBps:0}),{taxBps:0,policyConfirmed:false,version:2});
  assert.deepEqual(updateEventPolicy({...draft,tax_bps:500,policy_confirmed:1},{version:1,policyConfirmed:false}),{taxBps:500,policyConfirmed:false,version:2});
  assert.equal(updateEventPolicy({...draft,tax_bps:500},{version:1,taxBps:null}).taxBps,null);
});
for(const status of ['OPEN','CLOSED','CANCELLED']) test(`FX-F03-03 reject policy change in ${status}`,()=>assert.throws(()=>updateEventPolicy({...draft,status},{version:1,taxBps:0}),e=>e.status===409));
test('stale version, no-op field set and non-boolean confirmation are rejected',()=>{
  assert.throws(()=>updateEventPolicy(draft,{version:2,taxBps:0}),e=>e.status===409);
  assert.throws(()=>updateEventPolicy(draft,{version:1}),e=>e.status===400);
  assert.throws(()=>updateEventPolicy(draft,{version:1,policyConfirmed:'true'}),e=>e.status===400);
});
const planned={status:'PLANNED',version:1,actual_start:null,actual_end:null};
test('FX-F02-01 planned cancellation does not depend on current time',()=>assert.doesNotThrow(()=>assertCancelableShift(planned,1,false)));
for(const status of ['ACTIVE','CLOSED','CANCELLED']) test(`FX-F02-02 new cancel cannot change ${status}`,()=>assert.throws(()=>assertCancelableShift({...planned,status},1,false),e=>e.status===409));
test('FX-F02-06 stale, started or sale-associated planned rows cannot be cancelled',()=>{
  assert.throws(()=>assertCancelableShift(planned,2,false));
  assert.throws(()=>assertCancelableShift({...planned,actual_start:'2026-01-01'},1,false));
  assert.throws(()=>assertCancelableShift(planned,1,true));
});
const main={id:'1',kind:'WAREHOUSE',code:'MAIN',active:1,booth_id:null,booth_active:null,event_id:null,event_status:null};
const booth={id:'2',kind:'BOOTH',code:'BOOTH-1',active:1,booth_id:'1',booth_active:1,event_id:'10',event_status:'OPEN'};
test('FX-F05-03/04 main and same-event open booth are legal',()=>{
  assert.doesNotThrow(()=>assertReturnTarget('10',main)); assert.doesNotThrow(()=>assertReturnTarget('10',booth));
});
for(const status of ['CLOSED','CANCELLED','DRAFT',null]) test(`FX-F05-01 reject ${status} target event`,()=>assert.throws(()=>assertReturnTarget('10',{...booth,event_status:status}),e=>e.status===409));
test('FX-F05-02 cross-event even OPEN is forbidden',()=>assert.throws(()=>assertReturnTarget('11',booth),e=>e.status===409));
for(const changed of [{active:0},{booth_active:0},{booth_id:null},{event_id:null}]) test(`inactive/malformed booth ${JSON.stringify(changed)}`,()=>assert.throws(()=>assertReturnTarget('10',{...booth,...changed})));
test('non-MAIN warehouse and inactive MAIN rejected',()=>{
  assert.throws(()=>assertReturnTarget('10',{...main,code:'OTHER'})); assert.throws(()=>assertReturnTarget('10',{...main,active:0}));
});
test('event locks use distinct numeric order, not lexicographic order',()=>assert.deepEqual(sortedIds(['10','2','2','9007199254740993']),['2','10','9007199254740993']));
