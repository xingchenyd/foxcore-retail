import { randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import argon2 from 'argon2';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, exec, first, tx } from './db.js';
import { ApiError, audit, bad, body, forbidden, hash, nonempty } from './core.js';
import { sessionToken } from './session-token.js';

interface UserRow extends RowDataPacket {
  id: string; username: string; role: 'OWNER' | 'SALESPERSON'; salesperson_id: string | null;
  password_hash: string; active: number; must_change_password: number; failed_logins: number;
  locked_until: string | null;
}
interface SessionRow extends UserRow { session_id: string; expires_at: string; last_seen_at: string; revoked_at: string | null }
export interface Actor { id: string; username: string; role: 'OWNER' | 'SALESPERSON'; salespersonId: string | null; mustChangePassword: boolean; csrf: string }

export const passwordOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const cookieSecure = process.env.COOKIE_SECURE === 'true';
const cookieName = 'foxcore_session';
const csrfFromToken = (token: string) => hash(`csrf:${token}`);

export async function actor(req: FastifyRequest): Promise<Actor> {
  const token = sessionToken(req.headers.authorization, req.cookies[cookieName]);
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', '请先登录');
  const db = await pool.getConnection();
  try {
    const session = await first<SessionRow>(db,
      `SELECT s.id AS session_id,s.expires_at,s.last_seen_at,s.revoked_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`, [hash(token)]);
    const now = Date.now();
    if (!session || !session.active || session.revoked_at || Date.parse(session.expires_at + 'Z') <= now || Date.parse(session.last_seen_at + 'Z') + 30 * 60_000 <= now) {
      throw new ApiError(401, 'SESSION_EXPIRED', '会话已失效，请重新登录');
    }
    await exec(db, 'UPDATE sessions SET last_seen_at=UTC_TIMESTAMP(3) WHERE id=?', [session.session_id]);
    return { id: session.id, username: session.username, role: session.role, salespersonId: session.salesperson_id, mustChangePassword: Boolean(session.must_change_password), csrf: csrfFromToken(token) };
  } finally { db.release(); }
}
export function owner(a: Actor): void { if (a.role !== 'OWNER') throw forbidden(); }
export function writable(req: FastifyRequest, a: Actor): void {
  const expected = process.env.PUBLIC_ORIGIN;
  if (req.headers.origin && expected && req.headers.origin !== expected) throw forbidden();
  if (req.headers['x-csrf-token'] !== a.csrf) throw new ApiError(403, 'CSRF', '安全校验失败，请刷新页面');
  if (a.mustChangePassword && !['/api/v1/auth/password','/api/v1/auth/logout'].includes(req.url)) throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', '请先修改初始密码');
}
export async function login(req: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  return loginWithTransport(req, reply, false);
}
export async function miniLogin(req: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  return loginWithTransport(req, reply, true);
}
async function loginWithTransport(req: FastifyRequest, reply: FastifyReply, bearer: boolean): Promise<unknown> {
  const data = body(req.body, ['username', 'password']);
  const username = nonempty(data.username, 80);
  const password = nonempty(data.password, 200);
  const expected = process.env.PUBLIC_ORIGIN;
  if (req.headers.origin && expected && req.headers.origin !== expected) throw forbidden();
  return tx(async db => {
    const user = await first<UserRow>(db, 'SELECT * FROM users WHERE username=? FOR UPDATE', [username]);
    if (!user || !user.active) throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码不正确');
    if (user.locked_until && Date.parse(user.locked_until + 'Z') > Date.now()) throw new ApiError(429, 'LOGIN_LOCKED', '登录尝试过多，请稍后再试');
    if (!(await argon2.verify(user.password_hash, password))) {
      const failures = user.failed_logins + 1;
      await exec(db, 'UPDATE users SET failed_logins=?,locked_until=IF(? >= 5,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE),NULL) WHERE id=?', [failures, failures, user.id]);
      // Failed attempts must commit rather than be rolled back by the outer transaction.
      return { invalid: true };
    }
    await exec(db, 'UPDATE users SET failed_logins=0,locked_until=NULL WHERE id=?', [user.id]);
    const token = randomBytes(32).toString('base64url');
    const csrf = csrfFromToken(token);
    await exec(db, 'INSERT INTO sessions(user_id,token_hash,csrf_hash,expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 12 HOUR))', [user.id, hash(token), hash(csrf)]);
    await audit(db, user.id, 'LOGIN', 'USER', user.id);
    if (!bearer) reply.setCookie(cookieName, token, { path: '/', httpOnly: true, secure: cookieSecure, sameSite: 'lax', maxAge: 12 * 60 * 60 });
    return { user: { id: user.id, username: user.username, role: user.role, salespersonId: user.salesperson_id, mustChangePassword: Boolean(user.must_change_password) }, csrf,
      ...(bearer ? { accessToken: token, expiresIn: 43200, idleTimeout: 1800 } : {}) };
  }).then(result => {
    if ('invalid' in result) throw new ApiError(401, 'INVALID_CREDENTIALS', '用户名或密码不正确');
    return result;
  });
}
export async function logout(req: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  const a = await actor(req); writable(req, a);
  const token = sessionToken(req.headers.authorization, req.cookies[cookieName]);
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', '请先登录');
  await tx(async db => { await exec(db, 'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE token_hash=?', [hash(token)]); await audit(db, a.id, 'LOGOUT', 'USER', a.id); });
  reply.clearCookie(cookieName, { path: '/' });
  return { ok: true };
}
export async function changePassword(req: FastifyRequest): Promise<unknown> {
  const a = await actor(req); writable(req, a);
  const data = body(req.body, ['currentPassword', 'newPassword']);
  const current = nonempty(data.currentPassword, 200);
  const next = nonempty(data.newPassword, 200);
  if (next.length < 16) throw bad('新密码至少 16 个字符');
  await tx(async db => {
    const user = await first<UserRow>(db, 'SELECT * FROM users WHERE id=? FOR UPDATE', [a.id]);
    if (!user || !(await argon2.verify(user.password_hash, current))) throw new ApiError(401, 'INVALID_CREDENTIALS', '当前密码不正确');
    await exec(db, 'UPDATE users SET password_hash=?,must_change_password=FALSE WHERE id=?', [await argon2.hash(next, passwordOptions), a.id]);
    await exec(db, 'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=?', [a.id]);
    await audit(db, a.id, 'PASSWORD_CHANGED', 'USER', a.id);
  });
  if (a.role === 'OWNER' && a.mustChangePassword && process.env.OWNER_PASSWORD_FILE) {
    try { await unlink(process.env.OWNER_PASSWORD_FILE); } catch { /* password has changed even if the local display file was already removed */ }
  }
  return { ok: true, reauthenticationRequired: true };
}
