/** Controlled local/server-console recovery. No unauthenticated HTTP reset endpoint. */
import {connect} from './pg-connection.mjs';
import argon2 from 'argon2';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {isAbsolute,resolve,relative} from 'node:path';
const database=process.env.DB_NAME,output=process.env.OWNER_RECOVERY_PASSWORD_FILE,username=process.env.OWNER_RECOVERY_USERNAME??'owner',reason=process.env.OWNER_RECOVERY_REASON;
if(!/^[a-z][a-z0-9_]*$/.test(database??'')||process.env.OWNER_RECOVERY_CONFIRM!=='RESET_OWNER:'+database)throw Error('Set OWNER_RECOVERY_CONFIRM to RESET_OWNER:<exact database name> only on the intended server console');
if(!output||!isAbsolute(output)||!relative(resolve('.'),resolve(output)).startsWith('..'))throw Error('Choose an absolute private output file outside the repository; existing files are never overwritten');
if(!reason?.trim()||reason.length>500)throw Error('An operational recovery reason is required');
const temporary=randomBytes(32).toString('base64url');
const db=await connect({database});
try{
 await db.query('BEGIN');
 const {rows:users}=await db.query("SELECT id FROM users WHERE LOWER(username)=LOWER($1) AND role='OWNER' AND active=TRUE FOR UPDATE",[username]);
 if(users.length!==1)throw Error('Exactly one active matching OWNER is required');
 await writeFile(output,temporary,{mode:0o600,flag:'wx'});
 const hash=await argon2.hash(temporary,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
 await db.query('UPDATE users SET password_hash=$1,must_change_password=TRUE,failed_logins=0,locked_until=NULL WHERE id=$2',[hash,users[0].id]);
 await db.query('UPDATE sessions SET revoked_at=(clock_timestamp() AT TIME ZONE \'UTC\') WHERE user_id=$1',[users[0].id]);
 await db.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail_json) VALUES(NULL,'OWNER_RECOVERED','USER',$1,$2)",[users[0].id,JSON.stringify({reason,channel:'controlled-server-console'})]);
 await db.query('COMMIT');console.log('Owner recovery committed; old sessions revoked. Retrieve the one-time password privately, then change it at first login.');
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
