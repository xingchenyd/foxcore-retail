/** Compile the real native Mini Program. This does not claim a WeChat IDE compile/upload. */
import './load-env.mjs';
import { readFileSync,writeFileSync,mkdirSync,readdirSync,copyFileSync,statSync } from 'node:fs';
import { resolve,join,relative,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { isIP } from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=join(root,'apps/miniprogram/src'),dist=join(root,'apps/miniprogram/dist'),build=join(root,'apps/miniprogram/build');
const argument=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1]??'';};
// A local Web origin is not an implicit Mini Program development opt-in.
const publicApi=process.env.PUBLIC_ORIGIN??'';
const originFallback=publicApi.startsWith('https://')||process.argv.includes('--development')?publicApi:'';
const api=argument('--api',process.env.FOXCORE_MINI_API_URL??originFallback).replace(/\/$/,'');
const appid=argument('--appid',process.env.FOXCORE_MINI_APPID??'touristappid');
const release=process.argv.includes('--release');
if(api){const u=new URL(api);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('API must be a plain HTTP(S) base URL');if(u.protocol==='http:'&&(!process.argv.includes('--development')||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw new Error('HTTP is only allowed for explicit loopback development');}
if(appid!=='touristappid'&&!/^wx[0-9a-f]{16}$/.test(appid))throw new Error('Invalid WeChat AppID');
if(release&&(!api.startsWith('https://')||appid==='touristappid'||new URL(api).hostname==='localhost'||isIP(new URL(api).hostname.replace(/^\[|\]$/g,''))))throw new Error('Release packaging needs HTTPS domain API and real AppID');
execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'-p','apps/miniprogram/tsconfig.json'],{cwd:root,stdio:'inherit'});
function files(dir){return readdirSync(dir).flatMap(name=>{const p=join(dir,name);return statSync(p).isDirectory()?files(p):[p];});}
const config=JSON.parse(readFileSync(join(source,'app.json'),'utf8'));
for(const page of config.pages){
  for(const ext of ['ts','wxml'])if(!files(source).includes(join(source,page+'.'+ext)))throw new Error('Missing page '+page+'.'+ext);
  const wxml=readFileSync(join(source,page+'.wxml'),'utf8'),controller=readFileSync(join(source,page+'.ts'),'utf8');
  for(const match of wxml.matchAll(/(?:bind|catch)(?:tap|input|change|confirm)="([A-Za-z]\w*)"/g))if(!new RegExp('\\b'+match[1]+'\\s*\\(').test(controller))throw new Error('Unbound handler '+page+': '+match[1]);
}
for(const file of files(source).filter(p=>!p.endsWith('.ts'))){const target=join(dist,relative(source,file));mkdirSync(dirname(target),{recursive:true});copyFileSync(file,target);}
writeFileSync(join(dist,'config.js'),`"use strict"; Object.defineProperty(exports,"__esModule",{value:true}); exports.apiBaseUrl=${JSON.stringify(api)}; exports.environment=${JSON.stringify(release?'release':api?'development':'unconfigured')};\n`);
for(const file of files(dist)){const target=join(build,'miniprogram',relative(dist,file));mkdirSync(dirname(target),{recursive:true});copyFileSync(file,target);}
const project=JSON.parse(readFileSync(join(root,'apps/miniprogram/project.config.json'),'utf8'));
writeFileSync(join(build,'project.config.json'),JSON.stringify({...project,appid,miniprogramRoot:'miniprogram/',setting:{...project.setting,urlCheck:true}},null,2)+'\n');
writeFileSync(join(build,'BUILD_INFO.json'),JSON.stringify({nativeProject:true,pages:config.pages.length,apiConfigured:!!api,appIdConfigured:appid!=='touristappid',release,typescript:'PASS',wechatIdeCompile:'NOT_RUN',deviceTest:'NOT_RUN'},null,2)+'\n');
console.log(`Mini Program ready: ${relative(root,build)} (${config.pages.length} native pages). ${release?'Release-configured package':'Development package'}; WeChat IDE/device verification is separate.`);
