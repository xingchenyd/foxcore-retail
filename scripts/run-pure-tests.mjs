// No database substitute: compiles only dependency-free production modules and runs their real logic.
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let ts;
try { ts = require('typescript'); }
catch {
  // Explicit offline option for a preinstalled compiler; full verification still enforces package-lock/Node 24.
  if (!process.env.FOXCORE_OFFLINE_TYPESCRIPT) throw new Error('Run npm ci first (typescript is required).');
  ts = require(resolve(process.env.FOXCORE_OFFLINE_TYPESCRIPT));
}
const files = [
  'apps/web/src/lib/api.ts',
  'apps/server/src/fix-rules.ts',
  'apps/server/src/report-query.ts',
  'apps/server/src/csv.ts',
];
const temp = mkdtempSync(join(tmpdir(),'foxcore-pure-'));
try {
  writeFileSync(join(temp,'package.json'),'{"type":"module"}\n');
  for (const file of files) {
    const target = join(temp,file.replace(/\.ts$/,'.js')); mkdirSync(dirname(target),{recursive:true});
    const out = ts.transpileModule(readFileSync(join(root,file),'utf8'), {
      fileName:file, reportDiagnostics:true,
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,strict:true}
    });
    const errors=(out.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    if(errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
    writeFileSync(target,out.outputText);
  }
  const tests = readdirSync(join(root,'tests/pure')).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>join(root,'tests/pure',x));
  if (!tests.length) throw new Error('No pure regression tests found.');
  console.log(`Pure production-logic tests: Node ${process.version}, TypeScript ${ts.version}; not a DB/E2E run.`);
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests],{
    cwd:root, stdio:'inherit', env:{...process.env,FOXCORE_COMPILED:temp}
  });
  if(result.error) throw result.error;
  process.exitCode=result.status??1;
} finally { rmSync(temp,{recursive:true,force:true}); }
