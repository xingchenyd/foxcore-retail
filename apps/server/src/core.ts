import { createHash, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { exec, first, type Db } from './db.js';
import { parseMoney } from './amounts.js';
export { moneyText, halfUp } from './amounts.js';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const bad = (message: string) => new ApiError(400, 'BAD_REQUEST', message);
export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);
export const forbidden = () => new ApiError(403, 'FORBIDDEN', '无权执行此操作');
export const missing = () => new ApiError(404, 'NOT_FOUND', '记录不存在');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const key = () => randomUUID();

export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) throw bad('无效 ID');
  return value;
}
export function nonempty(value: unknown, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw bad('必填文本为空或过长');
  return value.trim();
}
export function opt(value: unknown, max = 500): string | null {
  if (value === undefined || value === null || value === '') return null;
  return nonempty(value, max);
}
export function positiveInt(value: unknown, max = 9999): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) throw bad('数量必须为有效正整数');
  return value as number;
}
export function bps(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 10000) throw bad('费率必须为 0–10000 bps');
  return value as number;
}
export function money(value: unknown): bigint {
  try { return parseMoney(value); }
  catch { throw bad('金额必须为非负十进制金额字符串，最多两位小数'); }
}
export function body(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('请求体必须为对象');
  const result = value as Record<string, unknown>;
  for (const field of Object.keys(result)) if (!allowed.includes(field)) throw bad(`未知字段 ${field}`);
  return result;
}
export function requireKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw bad('缺少有效 Idempotency-Key');
  return value;
}
interface CommandRow extends RowDataPacket { request_hash: string; response_json: string }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export async function command<T>(db: Db, actorId: string, operation: string, commandKey: string, payload: unknown, run: () => Promise<T>): Promise<T> {
  const digest = hash(canonical(payload));
  // The unique insert is the serialization point. A concurrent retry waits for the first transaction.
  const claim = await exec(db, 'INSERT IGNORE INTO idempotency_keys(actor_id,operation,command_key,request_hash,response_json) VALUES(?,?,?,?,?)', [actorId, operation, commandKey, digest, 'null']);
  if (claim.affectedRows === 0) {
    const old = await first<CommandRow>(db, 'SELECT request_hash,response_json FROM idempotency_keys WHERE actor_id=? AND operation=? AND command_key=?', [actorId, operation, commandKey]);
    if (!old || old.request_hash !== digest) throw conflict('幂等键已用于不同请求');
    return JSON.parse(old.response_json) as T;
  }
  const result = await run();
  await exec(db, 'UPDATE idempotency_keys SET response_json=? WHERE actor_id=? AND operation=? AND command_key=?', [JSON.stringify(result), actorId, operation, commandKey]);
  return result;
}
export async function audit(db: Db, actorId: string | null, action: string, type: string, subjectId: string | null, detail: unknown = null): Promise<void> {
  await exec(db, 'INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail_json) VALUES(?,?,?,?,?)', [actorId, action, type, subjectId, detail === null ? null : JSON.stringify(detail)]);
}
