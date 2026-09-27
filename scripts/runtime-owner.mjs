import mysql from 'mysql2/promise';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const password=(await readFile(process.env.DB_PASSWORD_FILE,'utf8')).trim();
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??3306),user:process.env.DB_USER,password,database:process.env.DB_NAME});
try {
  const [owners]=await db.query("SELECT id FROM users WHERE role='OWNER' LIMIT 1");
if(!owners.length){
    let initial;
    try { initial=(await readFile(process.env.OWNER_PASSWORD_FILE,'utf8')).trim(); }
    catch (error) {
      if(error.code!=='ENOENT') throw error;
      initial=randomBytes(32).toString('base64url');
      await writeFile(process.env.OWNER_PASSWORD_FILE,initial,{mode:0o600,flag:'wx'});
    }
    if(initial.length<32) throw new Error('Initial owner password file is invalid');
    await db.beginTransaction();
    try{
      const hash=await argon2.hash(initial,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
      const [result]=await db.query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES('owner',?,'OWNER',TRUE)",[hash]);
      await db.query('INSERT INTO audit_events(actor_id,action,subject_type,subject_id) VALUES(NULL,?,?,?)',['OWNER_INITIALIZED','USER',String(result.insertId)]);
      await db.commit();console.log('Initial owner created. Retrieve the one-time password using the documented local command.');
    }catch(error){await db.rollback();throw error;}
  }
}finally{await db.end();}
