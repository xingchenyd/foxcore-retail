// 云端（Vercel + TiDB Cloud 等 MySQL 兼容库）一次性初始化：建表迁移 + 初始 owner。
// 与本地部署的区别：
//   1. 用显式 DB_MIGRATION_USER 或 DB_USER 初始化；运行账号权限由云管理员另行配置；
//   2. 支持 DB_SSL=true 强制 TLS；
//   3. 幂等：已应用的迁移校验校验和后跳过；owner 已存在则跳过。
// 本地 Docker 部署仍使用 runtime-migrate.mjs / runtime-owner.mjs，本脚本不影响本地流程。
import './load-env.mjs';
import mysql from 'mysql2/promise';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.APP_ENV === 'production' && process.env.ALLOW_PRODUCTION_MIGRATION !== 'yes') {
  throw new Error('生产环境初始化需要设置 ALLOW_PRODUCTION_MIGRATION=yes');
}

const database = process.env.DB_NAME;
if (!/^[a-z][a-z0-9_]*$/.test(database ?? '')) throw new Error('Invalid database name');
const secret = async (key) => process.env[key] || (process.env[key+'_FILE'] ? (await readFile(process.env[key+'_FILE'],'utf8')).trim() : undefined);
const password = await secret('DB_MIGRATION_PASSWORD') ?? await secret('DB_PASSWORD');
const user = process.env.DB_MIGRATION_USER ?? process.env.DB_USER;
if (!process.env.DB_HOST || !user || !password) throw new Error('Set DB_HOST and database setup credentials before initialization');
if (process.env.APP_ENV === 'production' && !['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST) && process.env.DB_SSL !== 'true') throw new Error('Remote production database requires DB_SSL=true');
const ssl = process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2' } : undefined;
const migrations = fileURLToPath(new URL('../db/migrations/',import.meta.url));
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user,
  password,
  database,
  multipleStatements: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  ...(ssl ? { ssl } : {})
});

let locked = false;
try {
  // —— 迁移（等价于 scripts/migrate.ts，但去掉权限管理部分） ——
  const [lock] = await db.query('SELECT GET_LOCK(?, 30) AS locked', ['foxcore_migrate_' + database]);
  if (lock[0]?.locked !== 1) throw new Error('Could not get migration lock');
  locked = true;
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  for (const file of (await readdir(migrations)).filter(x => x.endsWith('.sql')).sort()) {
      const sql = await readFile(join(migrations, file), 'utf8');
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');
      const [old] = await db.query('SELECT checksum FROM schema_migrations WHERE version=?', [file]);
      if (old.length) {
        const windowsChecksum = createHash('sha256').update(sql.replace(/\r?\n/g,'\r\n')).digest('hex');
        if (![checksum,windowsChecksum].includes(old[0].checksum)) throw new Error('Migration checksum changed: ' + file);
        console.log('verified', file);
        continue;
      }
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations(version, checksum) VALUES(?, ?)', [file, checksum]);
      console.log('applied', file);
    }
  // —— 初始 owner（等价于 runtime-owner.mjs，但密码来自 OWNER_PASSWORD 环境变量） ——
  const [owners] = await db.query("SELECT id FROM users WHERE role='OWNER' LIMIT 1");
  if (owners.length) {
    console.log('owner already initialized; skipped.');
  } else {
    const initial = (await secret('OWNER_PASSWORD') ?? '').trim();
    if (initial.length < 32) throw new Error('First initialization needs OWNER_PASSWORD or OWNER_PASSWORD_FILE with at least 32 characters; passwords are never printed');
    await db.beginTransaction();
    try {
      const hashValue = await argon2.hash(initial, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
      const [result] = await db.query("INSERT INTO users(username, password_hash, role, must_change_password) VALUES('owner', ?, 'OWNER', TRUE)", [hashValue]);
      await db.query('INSERT INTO audit_events(actor_id, action, subject_type, subject_id) VALUES(NULL, ?, ?, ?)', ['OWNER_INITIALIZED', 'USER', String(result.insertId)]);
      await db.commit();
      console.log('Initial owner created (must change at first login); retrieve the initial password from your private configuration.');
    } catch (error) {
      await db.rollback();
      throw error;
    }
  }
  console.log('Cloud schema ready.');
} finally {
  try { if (locked) await db.query('SELECT RELEASE_LOCK(?)', ['foxcore_migrate_' + database]); }
  finally { await db.end(); }
}
