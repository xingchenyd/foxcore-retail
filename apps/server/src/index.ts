import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, exec, first, rows, tx } from './db.js';
import { actor, changePassword, login, miniLogin, logout, owner, passwordOptions, writable } from './auth.js';
import { ApiError, audit, bad, body, command, hash, id, missing, nonempty, requireKey } from './core.js';
import { registerCatalog } from './catalog.js';
import { registerInventory } from './inventory.js';
import { registerSales } from './sales.js';
import { registerReturns } from './returns.js';
import { registerCommissions } from './commissions.js';
import { registerCatalogUpdates } from './catalog-updates.js';
import { registerReports } from './reports.js';
import {registerOperations} from './operations.js';
import {registerExchanges} from './exchanges.js';
import { RuleError } from './fix-rules.js';
import { listPage } from './pagination.js';

const app=Fastify({ logger:{ redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','req.body.password','req.body.currentPassword','req.body.newPassword'] }, bodyLimit:1024*1024, ajv:{customOptions:{coerceTypes:false,removeAdditional:false}} });
await app.register(cookie);
app.addHook('onSend',async(req,reply,payload)=>{
  reply.header('X-Content-Type-Options','nosniff').header('X-Frame-Options','DENY').header('Referrer-Policy','same-origin');
  reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'");
  if(req.url.startsWith('/api/')) reply.header('Cache-Control','no-store');
  return payload;
});
app.setErrorHandler((error,req,reply)=>{
  if(error instanceof ApiError || error instanceof RuleError){reply.status(error.status).send({code:error.code,message:error.message,requestId:req.id});return;}
  const sql=error as {code?:string};
  if(['ER_DUP_ENTRY','ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2','ER_CHECK_CONSTRAINT_VIOLATED'].includes(sql.code??'')){reply.status(409).send({code:'DATA_CONFLICT',message:'数据重复、关联无效或违反数据库约束',requestId:req.id});return;}
  if((error as {validation?:unknown}).validation){reply.status(400).send({code:'VALIDATION_ERROR',message:'请求格式不正确',requestId:req.id});return;}
  req.log.error(error);
  reply.status(500).send({code:'INTERNAL_ERROR',message:'服务器处理失败，请凭请求编号联系管理员',requestId:req.id});
});
app.get('/health/live',async()=>({status:'alive'}));
app.get('/health/ready',async()=>{const db=await pool.getConnection();try{const migration=await first<RowDataPacket>(db,'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');if(!migration) throw new Error('Schema missing');return {status:'ready',schema:migration.version};}finally{db.release();}});
app.post('/api/v1/auth/login',login);
app.post('/api/v1/auth/mini/login',miniLogin);
app.post('/api/v1/auth/logout',logout);
app.post('/api/v1/auth/password',changePassword);
app.get('/api/v1/auth/me',async req=>{
  try {const a=await actor(req);return {user:{id:a.id,username:a.username,role:a.role,salespersonId:a.salespersonId,mustChangePassword:a.mustChangePassword},csrf:a.csrf};}
  catch(error){if(error instanceof ApiError&&error.status===401) return {user:null,csrf:null};throw error;}
});
app.get('/api/v1/users',async req=>{const a=await actor(req);owner(a);return listPage('SELECT id,username,role,salesperson_id,active,must_change_password,created_at FROM users ORDER BY id DESC',[],req.query as Record<string,unknown>,100);});
app.post('/api/v1/users',async req=>{
  const a=await actor(req);owner(a);writable(req,a);const d=body(req.body,['username','password','salespersonId']),k=requireKey(req.headers['idempotency-key']);
  const username=nonempty(d.username,80),password=nonempty(d.password,200),salespersonId=id(d.salespersonId);
  if(!/^[a-zA-Z][a-zA-Z0-9_.-]{2,79}$/.test(username)||password.length<16) throw bad('用户名格式无效或密码少于 16 字符');
  return tx(db=>command(db,a.id,'user.create',k,{username,salespersonId,passwordHash:hash(password)},async()=>{
    const sp=await first<RowDataPacket>(db,'SELECT id FROM salespeople WHERE id=? AND active=TRUE FOR UPDATE',[salespersonId]);if(!sp) throw missing();
    const r=await exec(db,"INSERT INTO users(username,password_hash,role,salesperson_id,must_change_password) VALUES(?,?, 'SALESPERSON',?,TRUE)",[username,await argon2.hash(password,passwordOptions),salespersonId]);
    const result={id:String(r.insertId)};await audit(db,a.id,'USER_CREATED','USER',result.id);return result;
  }));
});
app.patch('/api/v1/users/:id/active',async req=>{
  const a=await actor(req);owner(a);writable(req,a);const userId=id((req.params as Record<string,unknown>).id),d=body(req.body,['active']),k=requireKey(req.headers['idempotency-key']);
  if(typeof d.active!=='boolean') throw bad('active 必须为布尔值');
  return tx(db=>command(db,a.id,'user.active',k,{userId,active:d.active},async()=>{
    const target=await first<RowDataPacket>(db,'SELECT * FROM users WHERE id=? FOR UPDATE',[userId]);if(!target) throw missing();
    if(target.role==='OWNER'&&d.active===false){const count=await first<RowDataPacket>(db,"SELECT COUNT(*) AS n FROM users WHERE role='OWNER' AND active=TRUE");if(Number(count?.n)<=1) throw bad('不能禁用最后一个管理员');}
    await exec(db,'UPDATE users SET active=? WHERE id=?',[d.active,userId]);if(!d.active) await exec(db,'UPDATE sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[userId]);
    await audit(db,a.id,'USER_ACTIVE_CHANGED','USER',userId,{active:d.active});return {id:userId,active:d.active};
  }));
});
registerCatalog(app);registerCatalogUpdates(app);registerInventory(app);registerSales(app);registerReturns(app);registerCommissions(app);registerReports(app);
registerOperations(app);registerExchanges(app);

app.get('/api/v1/audit',async req=>{const a=await actor(req);owner(a);return listPage('SELECT id,actor_id,action,subject_type,subject_id,detail_json,created_at FROM audit_events ORDER BY id DESC',[],req.query as Record<string,unknown>,100);});

const webRoot=fileURLToPath(new URL('../../web/dist/',import.meta.url));
app.setNotFoundHandler(async(req,reply)=>{
  if(req.url.startsWith('/api/')){reply.status(404).send({code:'NOT_FOUND',message:'接口不存在',requestId:req.id});return;}
  if(existsSync(join(webRoot,'index.html'))){reply.type('text/html').send(await readFile(join(webRoot,'index.html')));return;}
  reply.status(404).send({code:'NOT_FOUND',message:'页面不存在',requestId:req.id});
});
if(existsSync(join(webRoot,'index.html'))){
  await app.register(staticFiles,{root:webRoot,prefix:'/'});
}
// 本地/Docker 部署：照常监听端口。Vercel Serverless 环境（VERCEL=1）：不监听，
// 由 api/index.js 导入本模块后以请求方式调用（见 docs/08-deployment-vercel.md）。
export default app;
if(!process.env.VERCEL){
  await app.listen({host:process.env.HOST??'0.0.0.0',port:Number(process.env.PORT??3000)});
}
