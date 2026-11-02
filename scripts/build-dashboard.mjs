import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('..',import.meta.url);
const files=['index.html','style.css','app.js','auth.css','auth.js','favicon.svg','robots.txt'];
const assets={};
for(const name of files)assets['/'+name]=await readFile(new URL('public/'+name,root),'utf8');
let source=await readFile(new URL('server/worker.mjs',root),'utf8');
source=source.replace('export default {','const application = {');
source+='\nconst embeddedAssets='+JSON.stringify(assets)+';\n';
source+=`export default { async fetch(request, env) {
  const ASSETS = { async fetch(req) {
    const pathname=new URL(req.url).pathname;
    const key=pathname==='/'?'/index.html':pathname;
    if(!(key in embeddedAssets))return new Response('Not found',{status:404});
    const type=key.endsWith('.html')?'text/html; charset=utf-8':key.endsWith('.css')?'text/css; charset=utf-8':key.endsWith('.js')?'text/javascript; charset=utf-8':key.endsWith('.svg')?'image/svg+xml':'text/plain; charset=utf-8';
    return new Response(req.method==='HEAD'?null:embeddedAssets[key],{headers:{'Content-Type':type}});
  }};
  return application.fetch(request,{...env,ASSETS});
}};\n`;
await mkdir(new URL('.wrangler/',root),{recursive:true});
await writeFile(new URL('.wrangler/dashboard-worker.mjs',root),source);
console.log('Dashboard bundle built without private roster or credentials.');
