/** Full verification owns a NEW isolated Docker stack; never borrows localhost:3000 or .env.
 * Raw logs, passwords and the synthetic backup are private. Public summary has stage exits only.
 */
import { spawn,spawnSync } from 'node:child_process';
import { randomBytes,createHash } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,readdirSync,statSync } from 'node:fs';
import { tmpdir,platform,arch } from 'node:os';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const run=randomBytes(6).toString('hex'),project='foxverify_'+run;
const startedAt=new Date().toISOString(),stages=[];let child,interrupted=false;
const privateDir=mkdtempSync(join(tmpdir(),'foxcore-verify-'));
const evidence=join(root,'docs/fixes/evidence','verify-'+run);mkdirSync(evidence,{recursive:true});
const secretFile=join(privateDir,'owner-password'),initialFile=join(privateDir,'initial-password');
const password='Verify-'+randomBytes(32).toString('base64url');writeFileSync(secretFile,password,{mode:0o600});
const env={...process.env,FOXCORE_VERIFY_RUN:run,FOXCORE_VERIFY_PROJECT:project,TEST_OWNER_PASSWORD_FILE:secretFile,TEST_OWNER_PASSWORD:password,TEST_OWNER_USERNAME:'owner',TEST_CONFIRM:'yes',FOXCORE_PRIVATE_RESULTS:join(privateDir,'browser-results')};
delete env.FOXCORE_OFFLINE_TYPESCRIPT; // Full acceptance may not borrow a different compiler version.
const owned=[];
process.on('SIGINT',()=>{interrupted=true;child?.kill('SIGTERM');});
async function exec(label,command,args=[],{input,extraEnv={},allowFailure=false,capture=false}={}){
  if(interrupted&&!allowFailure)throw new Error('Verification interrupted');
  const begin=new Date().toISOString();let stdout='',stderr='';
  const result=await new Promise((resolvePromise,reject)=>{
    child=spawn(command,args,{cwd:root,env:{...env,...extraEnv},shell:process.platform==='win32'&&command.endsWith('.cmd'),stdio:['pipe','pipe','pipe']});
    const timer=setTimeout(()=>{child?.kill('SIGTERM');},25*60_000);
    child.stdout.on('data',b=>{stdout+=b;if(stdout.length>64*1024*1024)child?.kill('SIGTERM');});child.stderr.on('data',b=>{stderr+=b;if(stderr.length>16*1024*1024)child?.kill('SIGTERM');});
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',(code,signal)=>{clearTimeout(timer);resolvePromise({code:code??1,signal});});
    child.stdin.on('error',()=>{});child.stdin.end(input??'');
  }).catch(e=>({code:1,error:e.message}));child=undefined;
  const number=stages.length+1,log=join(privateDir,String(number).padStart(2,'0')+'-'+label.replace(/[^a-z0-9-]/gi,'_')+'.log');
  // Captured output can be a password or dump; keep it private and do not put it in reports.
  writeFileSync(log,stdout+'\n'+stderr+(result.error??''),{mode:0o600});
  stages.push({name:label,command:capture?'[private capture; see verification.md]':[command,...args].join(' '),startedAt:begin,endedAt:new Date().toISOString(),exitCode:result.code,signal:result.signal??null,rawLog:log});
  console.log(`${result.code===0?'PASS':'FAIL'} ${label} (exit ${result.code})`);
  if(result.code!==0&&!allowFailure)throw new Error(`${label} failed; private log: ${log}`);
  return stdout;
}
const compose=(p,...args)=>['compose','--env-file',join(privateDir,'empty.env'),'-f','compose.verify.yaml','-p',p,...args];
writeFileSync(join(privateDir,'empty.env'),'# intentionally empty\n',{mode:0o600});
async function allocate(p,id){
  for(const kind of ['ps','volume','network']){
    const args=kind==='ps'?['ps','-aq','--filter',`label=com.docker.compose.project=${p}`]:[kind,'ls','-q','--filter',`label=com.docker.compose.project=${p}`];
    if((await exec('check-new-'+kind,'docker',args,{capture:true})).trim())throw new Error('Refusing pre-existing project resources');
  }
  owned.push({p,id});await exec('build-start-'+p,'docker',compose(p,'up','-d','--build'),{extraEnv:{FOXCORE_VERIFY_RUN:id}});
  const deadline=Date.now()+180_000;let ready=false;
  while(Date.now()<deadline){
    const state=spawnSync('docker',compose(p,'ps','--format','json','app'),{cwd:root,encoding:'utf8',env:{...env,FOXCORE_VERIFY_RUN:id}});
    const text=state.stdout??'';try{const value=JSON.parse(text);const app=Array.isArray(value)?value[0]:value;if(app?.Health==='healthy'){ready=true;break;}}catch{}
    if(interrupted)throw new Error('Interrupted');await new Promise(r=>setTimeout(r,1500));
  }
  if(!ready)throw new Error('Application did not become healthy within 180 seconds');
}
async function appScript(p,id,label,script){return exec(label,'docker',compose(p,'exec','-T','app','node','--input-type=module'),{input:script,extraEnv:{FOXCORE_VERIFY_RUN:id},capture:true});}
const connect=`import mysql from 'mysql2/promise';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const db=await mysql.createConnection({host:'db',user:'foxcore',database:'foxcore',password:readFileSync('/run/foxcore-app/db_password','utf8').trim(),supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});`;
const invariants=connect+`try{for(const file of ['db/check-invariants.sql','db/check-fix-invariants.sql']){const [rows]=await db.query(readFileSync(file,'utf8'));console.log(JSON.stringify({file,rows}));if(rows.some(x=>BigInt(x.violations)!==0n))throw new Error('Invariant failure');}}finally{await db.end();}`;
const snapshot=connect+`try{const tables=['schema_migrations','users','sales','sale_lines','stock_balances','stock_ledger','stock_holds','returns','return_lines','commission_entries','commission_settlements','commission_settlement_lines','commission_claims','audit_events'];const out={};for(const table of tables){const [rows]=await db.query('SELECT * FROM '+table);out[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows.map(x=>JSON.stringify(x)).sort())).digest('hex')};}console.log(JSON.stringify(out));}finally{await db.end();}`;
function sourceDigest(){const hash=createHash('sha256');for(const dir of ['apps','db','scripts','tests'])walk(join(root,dir));function walk(path){if(!existsSync(path))return;for(const name of readdirSync(path).sort()){if(['node_modules','dist','test-results'].includes(name))continue;const f=join(path,name);if(statSync(f).isDirectory())walk(f);else if(/\.(ts|tsx|mjs|json|sql)$/.test(name)){hash.update(f.slice(root.length));hash.update(readFileSync(f));}}}return hash.digest('hex');}
let outcome='FAIL',error=null;
try{
  if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Node 24 is required by this repository; full verification refuses another major version.');
  if(!existsSync(join(root,'package-lock.json'))||!existsSync(join(root,'node_modules/typescript')))throw new Error('Apply to the full repository and run npm ci first.');
  const npm=process.platform==='win32'?'npm.cmd':'npm',npx=process.platform==='win32'?'npx.cmd':'npx';
  await exec('docker-available','docker',['version']);await exec('compose-available','docker',['compose','version']);
  await exec('docs-consistency',process.execPath,['scripts/check-fix-docs.mjs']);
  await exec('typecheck',npm,['run','typecheck']);await exec('original-unit',npm,['run','test:unit']);await exec('pure-regression',process.execPath,['scripts/run-pure-tests.mjs']);await exec('build',npm,['run','build']);
  await allocate(project,run);
  const port=(await exec('loopback-port','docker',compose(project,'port','app','3000'),{capture:true})).trim();if(!/^127\.0\.0\.1:\d+$/.test(port))throw new Error('Refusing non-loopback test port');env.TEST_BASE_URL='http://'+port;
  const initial=(await exec('private-initial-password','docker',compose(project,'exec','-T','app','cat','/run/foxcore-app/owner_initial_password'),{capture:true})).trim();writeFileSync(initialFile,initial,{mode:0o600});env.FOXCORE_INITIAL_PASSWORD_FILE=initialFile;
  await exec('browser-bootstrap',npx,['--no-install','playwright','test','--config','playwright.fixes.config.ts'],{extraEnv:{FOXCORE_BOOTSTRAP:'yes'}});
  await exec('browser-business',npx,['--no-install','playwright','test','--config','playwright.fixes.config.ts']);
  await exec('original-http',npm,['run','test:integration']);
  await exec('new-http',process.execPath,['--test','--test-concurrency=1','tests/acceptance/http.test.mjs']);
  const screenshots=['chromium-sales.png','mobile-sales.png'].map(name=>{const path=join(root,'docs/evidence',name);return {path,old:existsSync(path)?readFileSync(path):null};});
  try{await exec('original-browser',npx,['--no-install','playwright','test','--config','playwright.config.ts','--output',join(privateDir,'original-browser')]);}
  finally{for(const {path,old} of screenshots){if(old===null)rmSync(path,{force:true});else writeFileSync(path,old);}}
  const iv=await appScript(project,run,'invariants',invariants);writeFileSync(join(evidence,'invariants.log'),iv);
  const before=JSON.parse(await appScript(project,run,'snapshot-before-restart',snapshot));
  await exec('restart-no-volume-removal','docker',compose(project,'restart','app'));
  // Wait for actual HTTP readiness after restart; health metadata can briefly retain its old state.
  let healthy=false;for(let i=0;i<60;i++){try{if((await fetch(env.TEST_BASE_URL+'/health/ready')).ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!healthy)throw new Error('Restart failed readiness');
  const after=JSON.parse(await appScript(project,run,'snapshot-after-restart',snapshot));if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Persistent data changed during restart');
  await exec('repeat-migration','docker',compose(project,'run','--rm','migrate'));await exec('repeat-owner-init','docker',compose(project,'exec','-T','app','node','scripts/runtime-owner.mjs'));
  const repeated=JSON.parse(await appScript(project,run,'snapshot-after-repeat',snapshot));if(JSON.stringify(before)!==JSON.stringify(repeated))throw new Error('Repeated initialization changed business data');
  const dump=await exec('private-synthetic-backup','docker',compose(project,'exec','-T','db','sh','-ec','exec mariadb-dump --host=127.0.0.1 --user=root --password="$(cat /run/foxcore-root/password)" --single-transaction --skip-comments --skip-dump-date --databases foxcore'),{capture:true});
  if(!dump.includes('CREATE TABLE'))throw new Error('Backup output is not a SQL dump');
  const restoreRun=randomBytes(6).toString('hex'),restoreProject='foxverify_'+restoreRun;await allocate(restoreProject,restoreRun);
  await exec('restore-to-new-owned-instance','docker',compose(restoreProject,'exec','-T','db','sh','-ec','exec mariadb --host=127.0.0.1 --user=root --password="$(cat /run/foxcore-root/password)"'),{input:dump,extraEnv:{FOXCORE_VERIFY_RUN:restoreRun},capture:true});
  const restored=JSON.parse(await appScript(restoreProject,restoreRun,'snapshot-restored',snapshot));if(JSON.stringify(before)!==JSON.stringify(restored))throw new Error('Restored records differ');
  await appScript(restoreProject,restoreRun,'restored-invariants',invariants);writeFileSync(join(evidence,'persistence.json'),JSON.stringify({before,after,restored},null,2));
  outcome='PASS';
}catch(e){error=e instanceof Error?e.message:String(e);console.error(error);process.exitCode=1;}
finally{
  for(const {p,id} of owned.reverse()){
    try{
      // Project was checked empty before creation; additionally verify every remaining container's run label.
      const ids=(await exec('cleanup-list-'+p,'docker',['ps','-aq','--filter',`label=com.docker.compose.project=${p}`],{capture:true,allowFailure:true})).trim().split(/\s+/).filter(Boolean);
      for(const container of ids){const label=(await exec('cleanup-ownership','docker',['inspect','--format','{{ index .Config.Labels "foxcore.verify.run" }}',container],{capture:true,allowFailure:true})).trim();if(label!==id)throw new Error('Cleanup ownership mismatch; resources left untouched');}
      await exec('cleanup-owned-'+p,'docker',compose(p,'down','--volumes','--remove-orphans'),{extraEnv:{FOXCORE_VERIFY_RUN:id},allowFailure:true});
      if(stages.at(-1).exitCode!==0){outcome='FAIL';process.exitCode=1;}
    }catch(e){console.error(String(e));outcome='FAIL';process.exitCode=1;}
  }
  const summary={runId:run,startedAt,endedAt:new Date().toISOString(),outcome,error,environment:{node:process.version,platform:platform(),arch:arch()},sourceDigest:sourceDigest(),baseCommit:'f5d79e193605ea71a45ff44fc1b6e4e1a2d67768',stages:stages.map(({rawLog,...s})=>s),privateLogs:privateDir,note:'PASS applies only to executed stages in this isolated stack. Original taskbook acceptance checklist is broader; see verification.md.'};
  writeFileSync(join(evidence,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  rmSync(secretFile,{force:true});rmSync(initialFile,{force:true});
  console.log(`Summary: ${join(evidence,'summary.json')}`);console.log(`Raw logs remain PRIVATE at ${privateDir}; do not commit/upload them. They may contain authentication details or a synthetic database dump.`);
}
