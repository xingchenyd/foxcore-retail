import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { bind } from './sql-parameters.js';

try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
if (!process.env.DB_PASSWORD && process.env.DB_PASSWORD_FILE) process.env.DB_PASSWORD = readFileSync(process.env.DB_PASSWORD_FILE, 'utf8').trim();
for (const name of ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME']) if (!process.env[name]) throw new Error(`Missing ${name}`);
if (process.env.DB_SSL_CA_FILE && process.env.DB_SSL !== 'true') throw new Error('DB_SSL_CA_FILE requires DB_SSL=true');

pg.types.setTypeParser(16, value => value === 't' ? 1 : 0);
pg.types.setTypeParser(1082, value => value);
pg.types.setTypeParser(1114, value => value.includes('.') ? value.padEnd(23, '0') : value + '.000');
pg.types.setTypeParser(1184, value => new Date(value).toISOString().replace('T', ' ').slice(0, -1));
// pg preserves bigint and numeric as strings by default.
export const pool = new pg.Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  max: 10, connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true, minVersion: 'TLSv1.2',
    ...(process.env.DB_SSL_CA_FILE ? { ca: readFileSync(process.env.DB_SSL_CA_FILE) } : {}) } : false
});
// Idle connection failures are handled by the pool; later requests reconnect.
pool.on('error', error => console.error('Idle PostgreSQL connection closed', (error as {code?: string}).code ?? 'UNKNOWN'));

export type Db = PoolClient;
export type Row = QueryResultRow;
export async function rows<T extends Row>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(bind(sql, params.length), params)).rows;
}
export async function first<T extends Row>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(db, sql, params))[0];
}
export async function exec(db: Db, sql: string, params: unknown[] = []) {
  return db.query(bind(sql, params.length), params);
}
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const db = await pool.connect();
    let discard = false;
    try {
      await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      try { await db.query('ROLLBACK'); } catch { discard = true; }
      if (attempt === 3 || !['40P01','55P03','40001'].includes((error as {code?: string}).code ?? '')) throw error;
    } finally {
      db.release(discard);
    }
    await new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 50)));
  }
  throw new Error('Transaction retry limit reached');
}
