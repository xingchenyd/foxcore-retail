import mysql, { type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

if (process.env.APP_ENV !== 'production') {
  try { process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url))); } catch { /* environment may already be provided */ }
}

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
if (!process.env.DB_PASSWORD && process.env.DB_PASSWORD_FILE) process.env.DB_PASSWORD = readFileSync(process.env.DB_PASSWORD_FILE, 'utf8').trim();
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`);

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  timezone: 'Z',
  decimalNumbers: false
});

export type Db = PoolConnection;
export async function rows<T extends RowDataPacket>(db: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await db.query<T[]>(sql, params);
  return result;
}
export async function first<T extends RowDataPacket>(db: Db, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await rows<T>(db, sql, params))[0];
}
export async function exec(db: Db, sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await db.query<ResultSetHeader>(sql, params);
  return result;
}
export async function tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const db = await pool.getConnection();
    try {
      await db.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await db.beginTransaction();
      const result = await fn(db);
      await db.commit();
      return result;
    } catch (error) {
      await db.rollback();
      const code = (error as {code?: string}).code;
      if (attempt < 3 && ['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT','ER_CHECKREAD'].includes(code ?? '')) {
        await new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 50)));
        continue;
      }
      throw error;
    } finally {
      db.release();
    }
  }
  throw new Error('Transaction retry limit reached');
}
