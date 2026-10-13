/** Apply narrowly scoped documentation corrections to the complete base repository.
 * --plan performs every parse/replacement without writing; the delivery installer calls it first.
 * Original PDF/SVG derivatives are NOT regenerated and are explicitly labelled historical.
 */
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const assets=fileURLToPath(new URL('../',import.meta.url));
const root=process.argv.includes('--root')?resolve(process.argv[process.argv.indexOf('--root')+1]):assets;
const plan=process.argv.includes('--plan'),writes=new Map();
const read=path=>readFileSync(join(root,path),'utf8');
const note='本轮修复：实现与验证状态以 [修复说明](fixes/README.md)、[决策](fixes/decisions.md)、[验证记录](fixes/verification.md) 和 `use-cases.json` 为准。下文未更新的历史运行统计不代表本轮通过。PDF/既有图片是旧基线派生物，尚未重新生成；修复后以 Markdown、源码及新合同为准。';
function banner(text,message){const mark='<!-- foxcore-fixes-current -->';text=text.replace(/<!-- foxcore-fixes-current -->[\s\S]*?<!-- \/foxcore-fixes-current -->\n*/,'');return `${mark}\n> ${message}\n<!-- /foxcore-fixes-current -->\n\n${text}`;}
function replace(text,old,next,path){if(text.includes(next))return text;const count=text.split(old).length-1;if(count!==1)throw new Error(`${path}: expected one exact baseline block, got ${count}; no files written`);return text.replace(old,next);}
for(const path of ['docs/01-vision-business.md','docs/02-SRS.md','docs/03-SDD.md','docs/04-database.md','docs/05-STD.md','docs/06-user-operations.md','docs/07-deployment-local.md'])writes.set(path,banner(read(path),note));
let sdd=writes.get('docs/03-SDD.md');
const mappings=[
 ['| SF-01 | 身份认证与会话管理 | `auth.ts` | FR-AUTH, UC-01, NFR-SEC |','| SF-01 | 身份认证与会话管理 | `auth.ts` | UC-13（认证扩展） |'],
 ['| `catalog.ts` | UC-02~UC-05 |','| `catalog.ts`, `catalog-updates.ts` | UC-01, UC-02, UC-03 |'],
 ['| `inventory.ts` | UC-06, UC-07 |','| `inventory.ts` | UC-04 |'],
 ['| `sales.ts` | UC-08, UC-09 |','| `sales.ts` | UC-05, UC-06, UC-07, UC-08 |'],
 ['| `returns.ts` | UC-10 |','| `returns.ts`, `return-target.ts` | UC-09 |'],
 ['| `commissions.ts` | UC-11 |','| `commissions.ts` | UC-10 |'],
 ['| `catalog.ts`（报表）、`core.ts`（审计） | UC-12 |','| `reports.ts`（报表）、`index.ts`（审计查询）、`core.ts`（审计写入） | UC-11, UC-12 |'],
 ['调拨为**两段式**——创建单据即生成流水与目标库位在途记录，实物交接后由接收方确认才计入可用余额。','调拨按当前实现为**已完成实物交接后的原子登记**：请求必须包含 `handoverConfirmed=true`，同一事务扣来源余额、加目标余额并写双向流水；不存在在途库存和二次接收接口。']
];for(const [old,next] of mappings)sdd=replace(sdd,old,next,'docs/03-SDD.md');writes.set('docs/03-SDD.md',sdd);
let srs=writes.get('docs/02-SRS.md');const anchor='| UC-12 | 账户与审计 | OWNER | — | 账号生命周期与审计查询 |';
srs=replace(srs,anchor,anchor+'\n| UC-13 | 身份认证与会话管理 | 全部账户 | — | 登录、首次改密、退出与会话撤销（EXT） |','docs/02-SRS.md');writes.set('docs/02-SRS.md',srs);
let readme=banner(read('README.md'),note.replaceAll('(fixes/','(docs/fixes/').replace('`use-cases.json`','`docs/use-cases.json`'));
readme=readme.replace('共 **53 项测试全部通过**','历史基线共列有 **53 项检查（并非本轮运行结果）**').replaceAll('（JSON Schema 校验）','（显式服务端输入校验）');
readme+='\n## 本轮修复验收入口\n\n`npm run verify:static` 为快速检查；`npm run verify:full` 使用独立一次性 Compose 实例执行完整验证。需要 Node 24、锁定依赖、Docker Compose 和 Playwright Chromium；任何前提/阶段失败均非零退出，不计为通过。旧 `npm run verify` 保留兼容，但不代表完整浏览器验收。先阅读 `docs/fixes/verification.md`。\n';
// Keep this added section idempotent on repeat runs.
const heading='\n## 本轮修复验收入口\n';const first=readme.indexOf(heading),second=readme.indexOf(heading,first+heading.length);if(second>=0)readme=readme.slice(0,second);
writes.set('README.md',readme);
for(const path of ['.ai/STATE.md','.ai/TASKS.md'])if(existsSync(join(root,path)))writes.set(path,banner(read(path),'当前任务以 `docs/fixes/README.md` 为唯一修复状态表。F01–F08 有生产代码/测试实现；本次离线环境仅执行了纯逻辑及静态检查。Node 24 完整构建、MariaDB、浏览器和 Docker 验收尚未在作者环境执行。不得沿用旧 PASS。'));
const original=JSON.parse(read('docs/openapi.json'));if(!original.paths||!original.openapi)throw new Error('Unexpected original OpenAPI document');
const overlay=JSON.parse(readFileSync(join(assets,'docs/openapi-fixes.json'),'utf8'));
for(const [path,item] of Object.entries(overlay.paths))original.paths[path]={...(original.paths[path]??{}),...item};
original.components={...original.components,schemas:{...original.components?.schemas,...overlay.components.schemas}};
original.info={...original.info,description:(original.info?.description??'').replace(/\nF01–F08 repair overlay[\s\S]*$/,'')+'\nF01–F08 repair overlay applied. Runtime inputs are explicitly validated in handlers; this document is not automatic AJV registration. Full execution is not yet verified.'};writes.set('docs/openapi.json',JSON.stringify(original,null,2)+'\n');
let trace=read('docs/traceability.csv');trace=trace.split('\n').filter(l=>!/^FIX-F0[1-8],/.test(l)).join('\n').trimEnd();
for(let i=1;i<=8;i++)trace+=`\nFIX-F0${i},S-TASK DEC-FIX,Repair F0${i},docs/fixes/requirements-tests.csv,docs/fixes/verification.md,implementation_added_full_runtime_not_run`;
writes.set('docs/traceability.csv',trace+'\n');
writes.set('RELEASE_STATUS.json',JSON.stringify({status:'REPAIR_CANDIDATE_RUNTIME_UNVERIFIED',baseCommit:'f5d79e193605ea71a45ff44fc1b6e4e1a2d67768',productionChanges:'F01-F08',verifiedHere:['pure production-logic tests','syntax and documentation-checker fixture checks','patch integrity'],notRunHere:['Node 24 full typecheck/build','MariaDB HTTP/concurrency/invariants','browser E2E','Docker installation/restart/backup/restore','cloud deployment'],evidence:'docs/fixes/verification.md',pdfDerivatives:'not regenerated'},null,2)+'\n');
if(plan){console.log(`Documentation plan OK: ${writes.size} source files; no writes`);process.exit(0);}
for(const [path,text] of writes)writeFileSync(join(root,path),text);
// Manifest is generated over the actual complete working copy after code + docs are applied.
// It does not embed file contents; secrets, working logs and the manifest itself are excluded.
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const safe=paths.filter(p=>p!=='SHA256SUMS'&&!/(^|\/)(node_modules|\.git|dist|test-results|playwright-report)(\/|$)/.test(p)&&!/(^|\/)\.env$|password|secret|\.pem$|\.key$|\.sql\.gz$|\.dump$/i.test(p)&&!p.startsWith('docs/fixes/evidence/verify-')&&existsSync(join(root,p)));
writeFileSync(join(root,'SHA256SUMS'),safe.sort().map(p=>createHash('sha256').update(readFileSync(join(root,p))).digest('hex')+'  '+p).join('\n')+'\n');
console.log(`Synchronized ${writes.size} source documents; derived PDFs/images remain historical. SHA256SUMS regenerated.`);
