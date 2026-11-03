// Run against a dedicated disposable PostgreSQL database before application setup.
import './load-env.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {connect,transaction} from './pg-connection.mjs';

if(process.env.DB_PG_SMOKE_CONFIRM!=='DISPOSABLE:'+process.env.DB_NAME) throw Error('Set DB_PG_SMOKE_CONFIRM=DISPOSABLE:<database> only for an isolated test database');
if (!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST) && process.env.DB_SSL!=='true') throw Error('Remote probe requires verified TLS');
const left=await connect();
const table='foxcore_probe_'+randomUUID().replaceAll('-','');
let right,created=false,failed=false;
async function step(name,run,required=true) {
  try { await run(); console.log(name+': PASS'); }
  catch(e) { if(required) failed=true; console.log(name+': FAIL ('+(e.code??'ASSERTION')+')'); }
}
try {
  right=await connect();
  await step('target_database',async()=>assert.equal((await left.query('SELECT current_database() AS name')).rows[0].name,process.env.DB_NAME));
  await step('enum_optional',async()=>{
    await transaction(left,async()=>{
      await left.query(`CREATE TYPE ${table}_mood AS ENUM ('a','b')`);
      await left.query(`DROP TYPE ${table}_mood`);
    });
  },false);
  await step('identity_and_returning',async()=>{
    await left.query(`CREATE TABLE ${table}(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, qty integer CHECK(qty>0), parent BIGINT REFERENCES ${table}(id))`);
    created=true;
    const {rows:[row]}=await left.query(`INSERT INTO ${table}(qty) VALUES($1) RETURNING id`,[1]);
    assert.equal(row.id,'1');
  });
  await step('checks_and_foreign_keys',async()=>{
    assert.ok(created);
    await assert.rejects(left.query(`INSERT INTO ${table}(qty) VALUES(0)`),{code:'23514'});
    await assert.rejects(left.query(`INSERT INTO ${table}(qty,parent) VALUES(1,9999)`),{code:'23503'});
  });
  await step('advisory_transaction_lock',async()=>{
    const q='SELECT pg_try_advisory_xact_lock(179284362, 3) AS locked';
    await transaction(left,async()=>{
      assert.equal((await left.query(q)).rows[0].locked,true);
      assert.equal((await right.query(q)).rows[0].locked,false);
    });
    assert.equal((await right.query(q)).rows[0].locked,true);
  });
  await step('row_lock',async()=>{
    assert.ok(created);
    await transaction(left,async()=>{
      assert.equal((await left.query(`SELECT id FROM ${table} WHERE id=1 FOR UPDATE`)).rowCount,1);
      await assert.rejects(right.query(`SELECT id FROM ${table} WHERE id=1 FOR UPDATE NOWAIT`),{code:'55P03'});
    });
    assert.equal((await right.query(`SELECT id FROM ${table} WHERE id=1 FOR UPDATE NOWAIT`)).rowCount,1);
  });
  await step('ddl_rollback',async()=>{
    assert.ok(created);
    const name=table+'_rollback';
    try {
      await left.query('BEGIN');
      await left.query(`CREATE TABLE ${name}(id integer)`);
      await left.query('ROLLBACK');
      assert.equal((await left.query('SELECT to_regclass($1) AS relation',[name])).rows[0].relation,null);
    } finally { await left.query(`DROP TABLE IF EXISTS ${name}`); }
  });
  await step('numeric_and_timezone',async()=>{
    const {rows:[row]}=await left.query("SELECT 0.1::numeric AS amount, 9223372036854775807::bigint AS id, (TIMESTAMPTZ '2026-01-01 08:00:00+08' AT TIME ZONE 'UTC')::text AS utc");
    assert.deepEqual(row,{amount:'0.1',id:'9223372036854775807',utc:'2026-01-01 00:00:00'});
  });
  await step('metadata_and_do',async()=>{
    await left.query('DO $$ BEGIN PERFORM 1; END $$');
    assert.ok((await left.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",[table])).rowCount===1);
    assert.ok((await left.query("SELECT 1 FROM pg_catalog.pg_class WHERE relname=$1",[table])).rowCount===1);
  });
} finally {
  try { if(created) await left.query(`DROP TABLE ${table}`); }
  finally { await Promise.all([left.end(),right?.end()]); }
}
if(failed) process.exitCode=1;
