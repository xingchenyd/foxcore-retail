import type { Row } from './db.js';
import { pool, first, rows, type Db } from './db.js';
import { parsePage, type Pagination } from './fix-rules.js';
export { parsePage } from './fix-rules.js';
export interface Page<T> { items: T[]; limit: number; offset: number; total: number; hasMore: boolean }

/** Count and rows share a repeatable-read snapshot; no row locks or business writes. */
export async function readSnapshot<T>(run: (db: Db) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  let discard = false;
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await run(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { db.release(discard); }
}
export async function queryPage<T extends Row>(db: Db, sql: string, values: unknown[], page: Pagination): Promise<Page<T>> {
  // sql/order are server-owned strings only; request values always stay in parameter bindings.
  const count = await first<Row>(db, `SELECT COUNT(*) AS n FROM (${sql}) AS page_count`, values);
  const n = BigInt(count?.n ?? 0);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Result count exceeds safe pagination range');
  const total = Number(n);
  const items = await rows<T>(db, sql + ' LIMIT ? OFFSET ?', [...values, page.limit, page.offset]);
  return { items, ...page, total, hasMore: page.offset + items.length < total };
}
export async function listPage<T extends Row = Row>(sql: string, values: unknown[], query: Record<string, unknown>, defaultLimit = 20): Promise<Page<T>> {
  const page = parsePage(query, defaultLimit);
  return readSnapshot(db => queryPage<T>(db, sql, values, page));
}
