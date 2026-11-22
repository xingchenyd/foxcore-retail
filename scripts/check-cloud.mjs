import './load-env.mjs';
import {readdir} from 'node:fs/promises';

const i=process.argv.indexOf('--url'), value=i<0?process.env.PUBLIC_ORIGIN:process.argv[i+1];
const url=new URL(value);
const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
if(url.origin!==value || url.username || url.password || (url.protocol!=='https:' && !(process.argv.includes('--development')&&loopback))) throw Error('Use a plain HTTPS origin; only --development allows HTTP loopback');
const latest=(await readdir(new URL('../db/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort().at(-1);
const checks=[];
async function check(path,expectedStatus,predicate){
  const res=await fetch(url.origin+path,{redirect:'error',signal:AbortSignal.timeout(15000)});
  const body=await res.text();let data;try{data=JSON.parse(body);}catch{}
  const passed=res.status===expectedStatus && predicate(data,body,res.headers);
  checks.push({path,status:res.status,passed});
  if(!passed)throw Error('Cloud check failed at '+path+' (HTTP '+res.status+'); check bootstrap mode, schema, origin and platform/sharecode access gate');
  return body;
}
try{
  await check('/health/live',200,d=>d?.status==='alive'&&!d.mode);
  await check('/health/ready',200,d=>d?.status==='ready'&&d.schema===latest);
  const page=await check('/',200,(_d,text,headers)=>headers.get('content-type')?.includes('text/html')&&text.includes('id="root"')&&text.includes('/assets/'));
  for(const ext of ['js','css']){
    const path=[...page.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_.-]+)"/g)].map(x=>x[1]).find(x=>x.endsWith('.'+ext));
    if(!path)throw Error('Missing '+ext+' asset in the actual Web build');
    await check(path,200,(_d,text,headers)=>!text.trimStart().startsWith('<')&&(ext==='css'?headers.get('content-type')?.includes('text/css'):/javascript/.test(headers.get('content-type')??'')));
  }
  await check('/api/v1/auth/me',200,d=>d?.user===null&&d.csrf===null);
  await check('/api/v1/users',401,d=>d?.code==='UNAUTHENTICATED');
  console.log(JSON.stringify({status:'PASS_REACHABILITY_ONLY',origin:url.origin,checks,note:'Login, role restrictions, mutations, WeChat device, backups and capacity require separate acceptance.'},null,2));
}catch(error){console.error(JSON.stringify({status:'FAIL',checks,message:error.message},null,2));process.exitCode=1;}
