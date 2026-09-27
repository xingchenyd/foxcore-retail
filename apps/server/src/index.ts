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
import { actor, changePassword, login, logout, owner, passwordOptions, writable } from './auth.js';
import { ApiError, audit, bad, body, command, hash, id, missing, nonempty, requireKey } from './core.js';
import { registerCatalog } from './catalog.js';
import { registerInventory } from './inventory.js';
import { registerSales } from './sales.js';
import { registerReturns } from './returns.js';
import { registerCommissions } from './commissions.js';

const app=Fastify({ logger:{ redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','req.body.password','req.body.currentPassword','req.body.newPassword'] }, bodyLimit:1024*1024, ajv:{customOptions:{coerceTypes:false,removeAdditional:false}} });
await app.register(cookie);
app.addHook('onSend',async(req,reply,payload)=>{
  reply.header('X-Content-Type-Options','nosniff').header('X-Frame-Options','DENY').header('Referrer-Policy','same-origin');
  reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'");
  if(req.url.startsWith('/api/')) reply.header('Cache-Control','no-store');
  return payload;
});
app.setErrorHandler((error,req,reply)=>{
  if(error instanceof ApiError){reply.status(error.status).send({code:error.code,message:error.message,requestId:req.id});return;}
  const sql=error as {code?:string};
  if(['ER_DUP_ENTRY','ER_NO_REFERENCED_ROW_2','ER_ROW_IS_REFERENCED_2','ER_CHECK_CONSTRAINT_VIOLATED'].includes(sql.code??'')){reply.status(409).send({code:'DATA_CONFLICT',message:'数据重复、关联无效或违反数据库约束',requestId:req.id});return;}
  if((error as {validation?:unknown}).validation){reply.status(400).send({code:'VALIDATION_ERROR',message:'请求格式不正确',requestId:req.id});return;}
  req.log.error(error);
  reply.status(500).send({code:'INTERNAL_ERROR',message:'服务器处理失败，请凭请求编号联系管理员',requestId:req.id});
});
app.get('/health/live',async()=>({status:'alive'}));
app.get('/health/ready',async()=>{const db=await pool.getConnection();try{const migration=await first<RowDataPacket>(db,'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');if(!migration) throw new Error('Schema missing');return {status:'ready',schema:migration.version};}finally{db.release();}});
app.post('/api/v1/auth/login',login);
app.post('/api/v1/auth/logout',logout);
app.post('/api/v1/auth/password',changePassword);
app.get('/api/v1/auth/me',async req=>{
  try {const a=await actor(req);return {user:{id:a.id,username:a.username,role:a.role,salespersonId:a.salespersonId,mustChangePassword:a.mustChangePassword},csrf:a.csrf};}
  catch(error){if(error instanceof ApiError&&error.status===401) return {user:null,csrf:null};throw error;}
});
app.get('/api/v1/users',async req=>{const a=await actor(req);owner(a);const db=await pool.getConnection();try{return {items:await rows<RowDataPacket>(db,'SELECT id,username,role,salesperson_id,active,must_change_password,created_at FROM users ORDER BY id DESC LIMIT 100')};}finally{db.release();}});
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
registerCatalog(app);registerInventory(app);registerSales(app);registerReturns(app);registerCommissions(app);

const facts=`SELECT sa.event_id,sh.salesperson_id,sl.product_id,CAST(sl.quantity AS SIGNED) AS quantity,CAST(sl.line_net_cents AS SIGNED) AS net_cents,CAST(sl.line_tax_cents AS SIGNED) AS tax_cents,CAST(sl.line_commission_cents AS SIGNED) AS commission_cents,(sl.quantity*CAST(sl.cost_snapshot_cents AS SIGNED)) AS cost_cents FROM sales sa JOIN shifts sh ON sh.id=sa.shift_id JOIN sale_lines sl ON sl.sale_id=sa.id WHERE sa.state='POSTED'
UNION ALL SELECT sa.event_id,sh.salesperson_id,sl.product_id,-CAST(rl.quantity AS SIGNED),-CAST(rl.net_cents AS SIGNED),-CAST(rl.tax_cents AS SIGNED),-CAST(rl.commission_cents AS SIGNED),IF(rl.disposition='RESTOCK',-CAST(rl.quantity AS SIGNED)*CAST(sl.cost_snapshot_cents AS SIGNED),0) FROM returns r JOIN sales sa ON sa.id=r.sale_id JOIN shifts sh ON sh.id=sa.shift_id JOIN return_lines rl ON rl.return_id=r.id JOIN sale_lines sl ON sl.sale_id=sa.id AND sl.line_no=rl.sale_line_no WHERE r.state='POSTED'`;
function reportGroup(value:unknown):{col:string;join:string;label:string}{
  switch(value){case 'product':return {col:'f.product_id',join:'JOIN products x ON x.id=f.product_id',label:'x.name'};case 'salesperson':return {col:'f.salesperson_id',join:'JOIN salespeople x ON x.id=f.salesperson_id',label:"CONCAT(x.first_name,' ',x.last_name)"};default:return {col:'f.event_id',join:'JOIN events x ON x.id=f.event_id',label:'x.name'};}
}
async function report(req:Parameters<typeof actor>[0]):Promise<RowDataPacket[]>{
  const a=await actor(req),q=req.query as Record<string,unknown>,g=reportGroup(q.group),db=await pool.getConnection();
  try {
    const result=await rows<RowDataPacket>(db,`SELECT ${g.col} AS id,${g.label} AS name,SUM(f.quantity) AS quantity,SUM(f.net_cents) AS net_cents,SUM(f.tax_cents) AS tax_cents,SUM(f.commission_cents) AS commission_cents,SUM(f.net_cents-f.cost_cents) AS estimated_margin_cents FROM (${facts}) f ${g.join} ${a.role==='OWNER'?'':'WHERE f.salesperson_id=?'} GROUP BY ${g.col},${g.label} ORDER BY net_cents DESC LIMIT 100`,a.role==='OWNER'?[]:[a.salespersonId]);
    return a.role==='OWNER'?result:result.map(row=>{const {estimated_margin_cents:_,...safe}=row;return safe as RowDataPacket;});
  }
  finally{db.release();}
}
app.get('/api/v1/reports/sales',async req=>({items:await report(req),basis:'原活动累计：已成交销售减已过账退货；毛利为标准成本估计'}));
app.get('/api/v1/reports/sales.csv',async(req,reply)=>{
  const a=await actor(req);owner(a);const items=await report(req);const cell=(value:unknown)=>{const s=String(value??'');const safe=/^[=+@\-\t\r]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';};
  const data=['id,name,quantity,net_cents,tax_cents,commission_cents,estimated_margin_cents',...items.map(x=>[x.id,x.name,x.quantity,x.net_cents,x.tax_cents,x.commission_cents,x.estimated_margin_cents].map(cell).join(','))].join('\r\n');
  reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="foxcore-report.csv"');return '\uFEFF'+data;
});
app.get('/api/v1/audit',async req=>{const a=await actor(req);owner(a);const db=await pool.getConnection();try{return {items:await rows<RowDataPacket>(db,'SELECT id,actor_id,action,subject_type,subject_id,created_at FROM audit_events ORDER BY id DESC LIMIT 100')};}finally{db.release();}});

const webRoot=fileURLToPath(new URL('../../web/dist/',import.meta.url));
app.setNotFoundHandler(async(req,reply)=>{
  if(req.url.startsWith('/api/')){reply.status(404).send({code:'NOT_FOUND',message:'接口不存在',requestId:req.id});return;}
  if(existsSync(join(webRoot,'index.html'))){reply.type('text/html').send(await readFile(join(webRoot,'index.html')));return;}
  reply.status(404).send({code:'NOT_FOUND',message:'页面不存在',requestId:req.id});
});
if(existsSync(join(webRoot,'index.html'))){
  await app.register(staticFiles,{root:webRoot,prefix:'/'});
}
await app.listen({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??3000)});
