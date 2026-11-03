import argon2 from 'argon2';
import { lock, transaction } from './pg-connection.mjs';

export async function initializeOwner(db, initialPassword) {
  const created=await transaction(db,async()=>{
    await lock(db,2);
    const {rows}=await db.query("SELECT id FROM users WHERE role='OWNER' LIMIT 1");
    if(rows.length) return false;
    const initial=await initialPassword();
    if (!initial || initial.length<32) throw Error('Set a private initial owner password with at least 32 characters');
    const hash=await argon2.hash(initial,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
    const {rows:[owner]}=await db.query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES('owner',$1,'OWNER',TRUE) RETURNING id",[hash]);
    await db.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id) VALUES(NULL,'OWNER_INITIALIZED','USER',$1)",[owner.id]);
    return true;
  });
  console.log(created?'Initial owner created; change the private password at first login.':'Owner already initialized; skipped.');
}
