import mysql from 'mysql2/promise';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const rootPassword=(await readFile(process.env.DB_ROOT_PASSWORD_FILE,'utf8')).trim();
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??3306),user:'root',password:rootPassword,database:process.env.DB_NAME,multipleStatements:true});
const database=process.env.DB_NAME;
if(!/^[a-z][a-z0-9_]*$/.test(database??'')) throw new Error('Invalid database name');
const dbUser=process.env.DB_USER;
if(!/^[a-z][a-z0-9_]*$/.test(dbUser??'')) throw new Error('Invalid database user');
const principal=`'${dbUser}'@'%'`;
try {
  const [lock]=await db.query('SELECT GET_LOCK(?,15) AS locked',['foxcore_migrate_'+database]);if(lock[0]?.locked!==1) throw new Error('Migration lock unavailable');
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(100) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  for(const file of (await readdir('db/migrations')).filter(x=>x.endsWith('.sql')).sort()){
    const sql=await readFile(join('db/migrations',file),'utf8'),digest=createHash('sha256').update(sql).digest('hex');
    const [old]=await db.query('SELECT checksum FROM schema_migrations WHERE version=?',[file]);
    if(old.length){if(old[0].checksum!==digest) throw new Error('Migration checksum mismatch: '+file);console.log('verified',file);continue;}
    await db.query(sql);await db.query('INSERT INTO schema_migrations(version,checksum) VALUES(?,?)',[file,digest]);console.log('applied',file);
  }
  await db.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${principal}`);
  await db.query(`GRANT SELECT,INSERT ON ${database}.* TO ${principal}`);
  const updateTables=['venues','events','booths','products','salespeople','shifts','users','sessions','sales','sale_lines','stock_locations','stock_balances','stock_holds','returns','return_lines','commission_settlements','idempotency_keys'];
  for(const table of updateTables) await db.query(`GRANT UPDATE ON ${database}.${table} TO ${principal}`);
  for(const table of ['sale_lines','commission_claims']) await db.query(`GRANT DELETE ON ${database}.${table} TO ${principal}`);
  await db.query(`GRANT UPDATE ON ${database}.commission_claims TO ${principal}`);
  await db.query('FLUSH PRIVILEGES');
  console.log('Runtime grants restricted; schema ready.');
} finally {await db.query('SELECT RELEASE_LOCK(?)',['foxcore_migrate_'+database]);await db.end();}
