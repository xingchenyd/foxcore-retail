import { readFileSync,existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export function validateRegistry(registry,files){
  const ids=new Set();
  for(const c of registry.useCases??[]){
    if(!/^UC-\d{2}$/.test(c.id)||ids.has(c.id))throw new Error('Invalid or duplicate use case ID');ids.add(c.id);
    if(!c.name||!c.source||!c.requirement||!c.roles?.length)throw new Error('Incomplete case metadata');
    for(const kind of ['implementation','tests']){
      if(!c[kind]?.length)throw new Error('Missing '+kind+' mapping');
      for(const path of c[kind])if(!files.has(path))throw new Error('Missing mapped file: '+path);
    }
  }
  if(!ids.size)throw new Error('Empty case registry');return ids;
}
export function validateReferences(text,ids){for(const id of text.match(/\bUC-\d{2}\b/g)??[])if(!ids.has(id))throw new Error('Unknown use case '+id);}
export function validateRoutes(contract,source){
  for(const [path,methods] of Object.entries(contract.paths??{}))for(const method of Object.keys(methods)){
    if(!['get','post','patch','put','delete'].includes(method))continue;
    const literal=path.replace(/\{([^}]+)\}/g,':$1');
    const escaped=literal.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(!new RegExp(`app\\.${method}\\(\\s*['\"]${escaped}['\"]`).test(source))throw new Error(`Contract route missing from source: ${method} ${path}`);
  }
}
function main(){
  const root=fileURLToPath(new URL('../',import.meta.url));
  const registry=JSON.parse(readFileSync(join(root,'docs/use-cases.json'),'utf8'));
  const files=new Set(registry.useCases.flatMap(c=>[...c.implementation,...c.tests]).filter(p=>existsSync(join(root,p))));
  const ids=validateRegistry(registry,files);
  const names={'UC-01':'管理活动与展位','UC-10':'佣金结算','UC-11':'查询与导出报表','UC-13':'身份认证与会话管理'};
  for(const [id,name] of Object.entries(names))assert.equal(registry.useCases.find(x=>x.id===id)?.name,name);
  for(const path of ['docs/02-SRS.md','docs/03-SDD.md','docs/05-STD.md'])validateReferences(readFileSync(join(root,path),'utf8'),ids);
  const sdd=readFileSync(join(root,'docs/03-SDD.md'),'utf8');
  for(const [sf,required] of [['SF-01',['UC-13']],['SF-02',['UC-01','UC-02','UC-03']],['SF-03',['UC-04']],['SF-04',['UC-05','UC-06','UC-07','UC-08']],['SF-05',['UC-09']],['SF-06',['UC-10']],['SF-07',['UC-11','UC-12']]]){
    const line=sdd.split('\n').find(x=>x.startsWith('| '+sf+' |'));if(!line)throw new Error('Missing system-feature mapping '+sf);
    assert.deepEqual(line.match(/UC-\d{2}/g)??[],required,'Wrong SDD mapping '+sf);
  }
  const contract=JSON.parse(readFileSync(join(root,'docs/openapi.json'),'utf8'));
  const overlay=JSON.parse(readFileSync(join(root,'docs/openapi-fixes.json'),'utf8'));
  for(const [path,item] of Object.entries(overlay.paths))for(const [method,operation] of Object.entries(item))assert.deepEqual(contract.paths?.[path]?.[method],operation,'OpenAPI not synchronized: '+method+' '+path);
  const modules=['index.ts','catalog.ts','catalog-updates.ts','inventory.ts','returns.ts','commissions.ts','reports.ts'];
  validateRoutes(overlay,modules.map(p=>readFileSync(join(root,'apps/server/src',p),'utf8')).join('\n'));
  const acceptance=readFileSync(join(root,'docs/fixes/requirements-tests.csv'),'utf8');
  for(let n=1;n<=8;n++)if(!acceptance.includes(`F0${n},`))throw new Error('Missing finding F0'+n);
  const release=JSON.parse(readFileSync(join(root,'RELEASE_STATUS.json'),'utf8'));
  if(release.status==='BRANCH_REVIEW_NATIVE_VALIDATED_DOCKER_PENDING'){
    assert.equal(release.evidence,'docs/course-review/verification.json');
    const evidence=JSON.parse(readFileSync(join(root,release.evidence),'utf8'));
    assert.equal(evidence.baseCommit,release.baseCommit);
    assert.equal(evidence.deliveryBranch,release.branch);
    assert.equal(release.mainModified,false);assert.equal(release.publicDeployment,false);
    assert.equal(evidence.checks.invariants.violations,0);
    assert.ok(evidence.notVerified.some(x=>x.startsWith('Docker')),'Native verification must not imply Docker validation');
  }else if(release.status==='STAFF_MINIPROGRAM_NATIVE_RUNTIME_PENDING'){
    assert.equal(release.evidence,'docs/miniprogram/verification.json');
    const evidence=JSON.parse(readFileSync(join(root,release.evidence),'utf8'));
    assert.equal(evidence.baseCommit,release.baseCommit);assert.equal(evidence.deliveryBranch,release.branch);
    assert.equal(release.publicDeployment,false);assert.equal(release.miniProgramMergedToMain,false);
    assert.equal(evidence.wechatIdeCompile,'NOT_RUN');assert.equal(evidence.wechatDeviceTest,'NOT_RUN');
    assert.equal(release.webMergeCommit,'744c36ac67abb28963f32077c219fbb4047d28c4');
    assert.equal(release.webBackupCommit,'3393bc3a4989b642f881cc891dc305cfda37ee5a');
  }else assert.equal(release.status,'REPAIR_CANDIDATE_RUNTIME_UNVERIFIED');
  console.log('Documentation checks passed: registry/references, seven SDD mappings, overlay/source routes and repair tracking. Not a proof that every prose statement or runtime contract is correct.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
