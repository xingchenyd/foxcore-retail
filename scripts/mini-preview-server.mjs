/** Local development adapter for actual WXML + compiled Page controllers.
 * It is NOT the WeChat engine or a production client. No accounts or fixtures are embedded.
 */
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.MINI_PREVIEW_PORT??8021),upstream=process.env.MINI_PREVIEW_API??'http://127.0.0.1:3000';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(upstream))throw new Error('Preview proxy only accepts an explicit loopback API');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.wxml':'text/plain; charset=utf-8','.wxss':'text/plain; charset=utf-8','.png':'image/png'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
    if(url.pathname.startsWith('/api/v1/')){
      if(!['GET','POST'].includes(req.method)){res.writeHead(405).end();return;}
      const headers={'content-type':'application/json'};
      for(const key of ['authorization','x-csrf-token','idempotency-key'])if(req.headers[key])headers[key]=req.headers[key];
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw new Error('Body too large');chunks.push(chunk);}
      const reply=await fetch(upstream+url.pathname+url.search,{method:req.method,headers,body:req.method==='GET'?undefined:Buffer.concat(chunks),signal:AbortSignal.timeout(20000)});
      res.writeHead(reply.status,{'content-type':reply.headers.get('content-type')??'application/json'}).end(Buffer.from(await reply.arrayBuffer()));return;
    }
    const prefix=url.pathname.startsWith('/mini/')?'apps/miniprogram/dist/':'tools/mini-preview/';
    const name=url.pathname.startsWith('/mini/')?url.pathname.slice(6):url.pathname==='/'?'index.html':url.pathname.slice(1);
    const folder=resolve(root,prefix),file=resolve(folder,decodeURIComponent(name));
    if(!file.startsWith(folder+'\\')&&!file.startsWith(folder+'/')){res.writeHead(403).end();return;}
    if(!mime[extname(file)]||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':mime[extname(file)]}).end(readFileSync(file));
  }catch{res.writeHead(502,{'content-type':'application/json'}).end(JSON.stringify({code:'PREVIEW_ERROR',message:'本机开发适配器失败，请检查服务'}));}
}).listen(port,'127.0.0.1',()=>console.log(`Local native-page adapter: http://127.0.0.1:${port}. This is not WeChat IDE/device validation.`));
