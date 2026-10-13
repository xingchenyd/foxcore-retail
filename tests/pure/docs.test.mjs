import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRegistry,validateReferences,validateRoutes} from '../../scripts/check-fix-docs.mjs';
const c={id:'UC-01',name:'Example',source:'synthetic checker fixture',roles:['OWNER'],requirement:'FIX-UC-01',implementation:['src/example.ts'],tests:['tests/example.ts']};
const files=new Set(['src/example.ts','tests/example.ts']);
test('F08 checker accepts repeated valid references, rejects unknown IDs',()=>{const ids=validateRegistry({useCases:[c]},files);assert.doesNotThrow(()=>validateReferences('UC-01 UC-01',ids));assert.throws(()=>validateReferences('UC-99',ids),/Unknown/);});
test('F08 checker rejects conflicting registry IDs',()=>assert.throws(()=>validateRegistry({useCases:[c,{...c,name:'Conflict'}]},files),/duplicate/));
test('F08 checker rejects nonexistent implementation/test files',()=>assert.throws(()=>validateRegistry({useCases:[c]},new Set()),/Missing mapped/));
test('F08 checker detects nonexistent documented route',()=>{const contract={paths:{'/api/v1/events/{id}':{patch:{}}}};assert.doesNotThrow(()=>validateRoutes(contract,"app.patch('/api/v1/events/:id',handler)"));assert.throws(()=>validateRoutes(contract,"app.get('/api/v1/events/:id',handler)"),/missing/);});
