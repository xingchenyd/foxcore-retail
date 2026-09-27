import argon2 from 'argon2';
import { pool, tx, exec, first } from '../apps/server/src/db.js';
import { passwordOptions } from '../apps/server/src/auth.js';
import type { RowDataPacket } from 'mysql2/promise';

const username = process.env.OWNER_USERNAME;
const password = process.env.OWNER_PASSWORD;
if (!username || !/^[a-zA-Z][a-zA-Z0-9_.-]{2,79}$/.test(username) || !password || password.length < 16) {
  throw new Error('Set OWNER_USERNAME and a unique OWNER_PASSWORD of at least 16 characters in the private process environment');
}
await tx(async db => {
  const old = await first<RowDataPacket>(db, 'SELECT id FROM users WHERE role=? LIMIT 1 FOR UPDATE', ['OWNER']);
  if (old) throw new Error('Owner already exists; use the protected recovery process');
  const result = await exec(db, 'INSERT INTO users(username,password_hash,role,must_change_password) VALUES(?,?,?,TRUE)', [username, await argon2.hash(password, passwordOptions), 'OWNER']);
  await exec(db, 'INSERT INTO audit_events(actor_id,action,subject_type,subject_id) VALUES(?,?,?,?)', [null, 'OWNER_INITIALIZED', 'USER', String(result.insertId)]);
});
await pool.end();
console.log('Initial owner created; change the one-time password on first login.');
