import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

try { process.loadEnvFile(); } catch { /* deployed environment */ }
if (process.env.APP_ENV === 'production' && process.env.ALLOW_PRODUCTION_MIGRATION !== 'yes') throw new Error('Production migration requires ALLOW_PRODUCTION_MIGRATION=yes');
const db = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: true,
  supportBigNumbers: true, bigNumberStrings: true
});
try {
  const [lockRows] = await db.query<mysql.RowDataPacket[]>('SELECT GET_LOCK(?,10) AS locked', ['foxcore_migrate_' + process.env.DB_NAME]);
  if (lockRows[0]?.locked !== 1) throw new Error('Could not get migration lock');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  for (const file of (await readdir('db/migrations')).filter(x => x.endsWith('.sql')).sort()) {
    const sql = await readFile(join('db/migrations', file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const [rows] = await db.query<mysql.RowDataPacket[]>('SELECT checksum FROM schema_migrations WHERE version=?', [file]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) throw new Error(`Migration checksum changed: ${file}`);
      console.log(`verified ${file}`);
      continue;
    }
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations(version,checksum) VALUES(?,?)', [file, checksum]);
    console.log(`applied ${file}`);
  }
} finally {
  await db.query('SELECT RELEASE_LOCK(?)', ['foxcore_migrate_' + process.env.DB_NAME]);
  await db.end();
}
