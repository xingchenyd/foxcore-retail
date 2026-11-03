// Read-only catalog snapshot. Never queries application rows.
import './load-env.mjs';
import { connect } from './pg-connection.mjs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const db=await connect();
try {
  const {rows:columns}=await db.query(`
    SELECT t.relname AS "tableName",a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
      CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS nullable,
      CASE WHEN EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='p' AND a.attnum=ANY(k.conkey)) THEN 'PRI'
           WHEN EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='u' AND a.attnum=ANY(k.conkey)) THEN 'UNI'
           ELSE '' END AS "keyKind"
    FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid
    WHERE n.nspname='public' AND t.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY t.relname,a.attnum`);
  const {rows:fks}=await db.query(`
    SELECT st.relname AS source,sa.attname AS "sourceColumn",tt.relname AS target,ta.attname AS "targetColumn",k.conname AS name
    FROM pg_constraint k JOIN pg_class st ON st.oid=k.conrelid JOIN pg_class tt ON tt.oid=k.confrelid
    JOIN pg_namespace ns ON ns.oid=st.relnamespace
    CROSS JOIN LATERAL generate_subscripts(k.conkey,1) AS x(i)
    JOIN pg_attribute sa ON sa.attrelid=st.oid AND sa.attnum=k.conkey[x.i]
    JOIN pg_attribute ta ON ta.attrelid=tt.oid AND ta.attnum=k.confkey[x.i]
    WHERE k.contype='f' AND ns.nspname='public' ORDER BY source,name,x.i`);
  const {rows:constraints}=await db.query(`
    SELECT t.relname AS "tableName",k.conname AS name,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' ORDER BY t.relname,k.conname`);
  const {rows:indexes}=await db.query(`SELECT tablename AS "tableName",indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`);
  const migrations={};
  for(const file of (await readdir('db/migrations')).filter(x=>x.endsWith('.sql')).sort()){
    migrations[file]=createHash('sha256').update((await readFile('db/migrations/'+file,'utf8')).replace(/\r\n/g,'\n')).digest('hex');
  }
  const names=new Set(columns.map(x=>x.tableName));
  if(names.size!==34||!names.has('schema_migrations')) throw Error('Expected the dedicated 34-table Foxcore database');
  const schema={source:'PostgreSQL 16 pg_catalog after migrations 001–005; structure only',businessTables:33,migrationTables:1,migrations,columns,fks,constraints,indexes};
  await writeFile('docs/retail-operations/schema.json',JSON.stringify(schema,null,2)+'\n');
} finally { await db.end(); }
