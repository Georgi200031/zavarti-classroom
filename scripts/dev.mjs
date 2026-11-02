import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import worker from '../server/worker.mjs';
let secrets;try{secrets=JSON.parse(await readFile(new URL('../.private/secrets.json',import.meta.url),'utf8'));}catch(_){console.error('Първо изпълни npm run setup.');process.exit(1);}
const root=fileURLToPath(new URL('../public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const attempts=new Map();
const env={...secrets,LOGIN_LIMITER:{async limit({key}){const now=Date.now();let entry=attempts.get(key);if(!entry||entry.reset<now)entry={count:0,reset:now+60000};entry.count++;attempts.set(key,entry);return {success:entry.count<=8};}},ASSETS:{async fetch(request){const url=new URL(request.url),rel=url.pathname==='/'?'index.html':url.pathname.slice(1);try{const bytes=await readFile(path.join(root,rel));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':mime[path.extname(rel)]||'application/octet-stream'}});}catch(_){return new Response('Not found',{status:404});}}}};
const port=Number(process.env.PORT||8770);
createServer(async(req,res)=>{
  try{
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
    headers.set('CF-Connecting-IP',req.socket.remoteAddress||'local');
    let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>2048){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const init={method:req.method,headers};if(!['GET','HEAD'].includes(req.method))init.body=Buffer.concat(chunks);
    const request=new Request(`http://127.0.0.1:${port}${req.url}`,init);
    const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(_){res.writeHead(500);res.end('Server error');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}`));
