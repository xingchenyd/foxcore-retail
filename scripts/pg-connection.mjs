import pg from 'pg';
import { readFile } from 'node:fs/promises';

export async function secret(key) {
  return process.env[key] || (process.env[key+'_FILE'] ? (await readFile(process.env[key+'_FILE'],'utf8')).trim() : undefined);
}
export async function connect({user=process.env.DB_USER,password,database=process.env.DB_NAME}={}) {
  password ??= await secret('DB_PASSWORD');
  const host=process.env.DB_HOST;
  if (!host || !user || !password || !database) throw Error('Set DB_HOST, database name and private credentials');
  const tls=process.env.DB_SSL==='true', ca=process.env.DB_SSL_CA_FILE;
  if (ca && !tls) throw Error('DB_SSL_CA_FILE requires DB_SSL=true');
  const db=new pg.Client({host,port:Number(process.env.DB_PORT??5432),user,password,database,connectionTimeoutMillis:10000,
    ssl:tls ? {rejectUnauthorized:true,minVersion:'TLSv1.2',...(ca ? {ca:await readFile(ca)} : {})} : false});
  await db.connect();
  return db;
}
export async function transaction(db, fn) {
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try { const result=await fn(); await db.query('COMMIT'); return result; }
  catch(error) { try { await db.query('ROLLBACK'); } catch {} throw error; }
}
export async function lock(db, purpose) {
  const {rows:[row]}=await db.query('SELECT pg_try_advisory_xact_lock(179284362, $1::integer) AS locked',[purpose]);
  if (row?.locked!==true) throw Error('Foxcore initialization lock unavailable; retry after the other initializer finishes');
}
