import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { transaction, lock } from './pg-connection.mjs';

const folder=new URL('../db/migrations/',import.meta.url);
const digest=text=>createHash('sha256').update(text).digest('hex');
export function requireProductionGate() {
  if (process.env.APP_ENV !== 'production') return;
  if (process.env.ALLOW_PRODUCTION_MIGRATION !== 'yes') throw Error('Production migration requires ALLOW_PRODUCTION_MIGRATION=yes');
  if (!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST) && process.env.DB_SSL!=='true') throw Error('Remote production database requires DB_SSL=true');
}
export async function migrate(db, after=async()=>{}) {
  const results=await transaction(db,async()=>{
    await lock(db,1);
    await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP(3) NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'))");
    const applied=[];
    for (const file of (await readdir(folder)).filter(name=>name.endsWith('.sql')).sort()) {
      const sql=(await readFile(new URL(file,folder),'utf8')).replace(/\r\n/g,'\n'), checksum=digest(sql);
      const {rows:[old]}=await db.query('SELECT checksum FROM schema_migrations WHERE version=$1',[file]);
      if(old) {
        if (![checksum,digest(sql.replace(/\n/g,'\r\n'))].includes(old.checksum)) throw Error('Migration checksum changed: '+file);
      } else {
        await db.query(sql);
        await db.query('INSERT INTO schema_migrations(version, checksum) VALUES($1,$2)',[file,checksum]);
      }
      applied.push([old?'verified':'applied',file]);
    }
    await after();
    return applied;
  });
  for (const result of results) console.log(...result);
}
