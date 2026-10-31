import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
// @ts-expect-error Standalone deployment scripts execute directly in Node.
import {validateCloudEnvironment} from '../../scripts/cloud-config.mjs';

const valid={APP_ENV:'production',PUBLIC_ORIGIN:'https://foxcore.test-host.cn',COOKIE_SECURE:'true',DB_HOST:'db.test-host.cn',DB_USER:'runtime',DB_PASSWORD:'test-only-not-a-credential',DB_NAME:'foxcore',DB_SSL:'true'};
describe('cloud deployment guards and environment fallback',()=>{
  it('keeps platform-injected environment values ahead of production .env',()=>{
    const dir=mkdtempSync(join(tmpdir(),'foxcore-env-test-'));
    try{
      const file=join(dir,'fixture.env');writeFileSync(file,'FOXCORE_ENV_PROBE=file\nFOXCORE_ENV_FALLBACK=available\n');
      const moduleUrl=pathToFileURL(resolve('scripts/load-env.mjs')).href;
      const code=`import {loadEnvironment} from ${JSON.stringify(moduleUrl)};loadEnvironment(${JSON.stringify(file)});loadEnvironment(${JSON.stringify(join(dir,'absent.env'))});console.log(JSON.stringify([process.env.APP_ENV,process.env.FOXCORE_ENV_PROBE,process.env.FOXCORE_ENV_FALLBACK]));`;
      const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,APP_ENV:'production',FOXCORE_ENV_PROBE:'platform'}});
      expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout.trim())).toEqual(['production','platform','available']);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
  it('accepts Node 22.12+/24, PORT injection and explicit setup-independent startup',()=>{
    expect(validateCloudEnvironment({...valid,PORT:'4567'},'22.12.0')).toEqual({host:'0.0.0.0',port:4567,bootstrap:false});
    expect(validateCloudEnvironment(valid,'24.19.0').bootstrap).toBe(false);
    for(const version of ['20.20.0','22.11.0','23.0.0','25.0.0'])expect(()=>validateCloudEnvironment(valid,version)).toThrow();
  });
  it('rejects placeholder/sharecode origins, insecure remote SQL, bad ports and private binding',()=>{
    for(const origin of ['https://PLACEHOLDER','https://example.com','https://x.invalid','http://foxcore.test-host.cn','https://foxcore.test-host.cn/','https://foxcore.test-host.cn?sharecode=abc','https://foxcore.test-host.cn/api/v1'])expect(()=>validateCloudEnvironment({...valid,PUBLIC_ORIGIN:origin})).toThrow();
    for(const env of [{DB_SSL:'false'},{COOKIE_SECURE:'false'},{PORT:'3000x'},{PORT:'0'},{HOST:'127.0.0.1'},{VERCEL:'1'}])expect(()=>validateCloudEnvironment({...valid,...env})).toThrow();
  });
  it('allows only explicit health-only bootstrap without business credentials',()=>{
    expect(validateCloudEnvironment({APP_ENV:'production',CLOUD_BOOTSTRAP:'health-only'})).toEqual({host:'0.0.0.0',port:3000,bootstrap:true});
    expect(()=>validateCloudEnvironment({...valid,CLOUD_BOOTSTRAP:'anything'})).toThrow();
  });
  it('does not let WORKBUDDY or VERCEL bypass the production migration gate',()=>{
    const env={...process.env,APP_ENV:'production',WORKBUDDY:'1',VERCEL:'1'};delete env.ALLOW_PRODUCTION_MIGRATION;
    const result=spawnSync(process.execPath,['scripts/vercel-setup.mjs'],{encoding:'utf8',env});
    expect(result.status).not.toBe(0);expect(result.stderr).toContain('ALLOW_PRODUCTION_MIGRATION=yes');
  });
});
