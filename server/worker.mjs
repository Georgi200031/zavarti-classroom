const encoder = new TextEncoder();
const SESSION_SECONDS = 2 * 60 * 60;
export const PBKDF2_ITERATIONS = 100000;
const PUBLIC_PATHS = new Set(['/', '/index.html', '/style.css', '/app.js', '/favicon.svg', '/auth.css', '/auth.js', '/robots.txt']);
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const bytesToHex = bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2,'0')).join('');
const hexToBytes = hex => { if(typeof hex!=='string'||!hex.length||hex.length%2||!/^[a-f\d]+$/i.test(hex))throw new Error('Invalid hexadecimal value');return Uint8Array.from(hex.match(/.{2}/g),s=>parseInt(s,16)); };
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));

export async function passwordDigest(password,salt){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return bytesToHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexToBytes(salt),iterations:PBKDF2_ITERATIONS,hash:'SHA-512'},key,256));
}
// Stretch the password in the browser, then store only a one-way verifier.
// This avoids an expensive password KDF on the Free Worker's small CPU budget.
export async function proofDigest(proof){return bytesToHex(await crypto.subtle.digest('SHA-256',hexToBytes(proof)));}
function equal(a,b){const x=encoder.encode(a),y=encoder.encode(b);let difference=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)difference|=(x[i]||0)^(y[i]||0);return difference===0;}
function configured(env){return typeof env.TEACHER_USERNAME==='string'&&/^[\w.-]{3,64}$/.test(env.TEACHER_USERNAME)&&/^[a-f\d]{64}$/i.test(env.TEACHER_HASH||'')&&/^[a-f\d]{32,128}$/i.test(env.TEACHER_SALT||'')&&/^[a-f\d]{64}$/i.test(env.SESSION_SECRET||'')&&typeof env.CLASS_NAMES_JSON==='string';}
async function signingKey(env){return crypto.subtle.importKey('raw',hexToBytes(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function createSession(env){
  const expiresAt=Date.now()+SESSION_SECONDS*1000;
  const payload=b64(encoder.encode(JSON.stringify({u:env.TEACHER_USERNAME,e:expiresAt,n:crypto.randomUUID()})));
  const signature=b64(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode(payload)));
  return {token:payload+'.'+signature,expiresAt};
}
function cookieName(request){return new URL(request.url).protocol==='https:'?'__Host-zavarti':'zavarti-dev';}
function cookie(request,value,maxAge){const secure=new URL(request.url).protocol==='https:';return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;}
export async function verifySession(request,env){
  if(!configured(env))return null;
  const cookies=request.headers.get('Cookie')||'';
  const entry=cookies.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName(request)+'='));
  if(!entry||entry.length>2048)return null;
  try{
    const token=entry.slice(entry.indexOf('=')+1),parts=token.split('.');if(parts.length!==2||!parts.every(p=>/^[a-z\d_-]+$/i.test(p)))return null;
    const [payload,signature]=parts;
    if(!await crypto.subtle.verify('HMAC',await signingKey(env),unb64(signature),encoder.encode(payload)))return null;
    const session=JSON.parse(new TextDecoder().decode(unb64(payload)));
    if(session.u!==env.TEACHER_USERNAME||!Number.isFinite(session.e)||session.e<=Date.now()||session.e>Date.now()+SESSION_SECONDS*1000+60000)return null;
    return session;
  }catch(_){return null;}
}
async function limitedJSON(request){
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return null;
  if(Number(request.headers.get('Content-Length')||0)>2048)return null;
  const reader=request.body?.getReader();if(!reader)return null;const chunks=[];let total=0;
  while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>2048){await reader.cancel();return null;}chunks.push(value);}
  const all=new Uint8Array(total);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(all));}catch(_){return null;}
}
function roster(env){
  const names=JSON.parse(env.CLASS_NAMES_JSON);
  if(!Array.isArray(names)||!names.length||names.length>60||names.some(n=>typeof n!=='string'||!n.trim()||n.length>60||/\d{8,}/.test(n))||new Set(names).size!==names.length)throw new Error('Invalid roster');
  return names;
}
async function handle(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path.startsWith('/api/')){
    if(!configured(env))return json({error:'Входът все още не е настроен. Свържи се с администратора.'},503);
    if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return json({error:'Невалидна заявка.'},403);
    if(path==='/api/auth-info'&&request.method==='GET')return json({salt:env.TEACHER_SALT,iterations:PBKDF2_ITERATIONS});
    if(path==='/api/login'&&request.method==='POST'){
      if(!env.LOGIN_LIMITER?.limit)return json({error:'Защитата за вход не е настроена.'},503);
      const {success}=await env.LOGIN_LIMITER.limit({key:'login:'+ (request.headers.get('CF-Connecting-IP')||'unknown')});
      if(!success)return json({error:'Твърде много опити. Изчакай една минута.'},429,{'Retry-After':'60'});
      const input=await limitedJSON(request);
      if(!input||typeof input.username!=='string'||input.username.length>64||typeof input.proof!=='string'||!/^[a-f\d]{64}$/i.test(input.proof))return json({error:'Невалидни данни за вход.'},400);
      const digest=await proofDigest(input.proof);
      const validUser=equal(input.username,env.TEACHER_USERNAME),validPassword=equal(digest,env.TEACHER_HASH);
      if(!validUser||!validPassword)return json({error:'Невалидно потребителско име или парола.'},401);
      const session=await createSession(env);
      return json({ok:true,expiresAt:session.expiresAt},200,{'Set-Cookie':cookie(request,session.token,SESSION_SECONDS)});
    }
    if(path==='/api/logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});
    if((path==='/api/roster'||path==='/api/session')&&request.method==='GET'){
      const session=await verifySession(request,env);if(!session)return json({error:'Влез с учителския профил.'},401);
      return path==='/api/session'?json({ok:true,expiresAt:session.e}):json({names:roster(env),expiresAt:session.e});
    }
    return json({error:'Няма такава операция.'},404);
  }
  if(!PUBLIC_PATHS.has(path))return new Response('Not found',{status:404});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request,env){
    let response;try{response=await handle(request,env);}catch(_){response=json({error:'Временен проблем със сървъра. Опитай отново.'},503);}
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(new URL(request.url).protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000');
    if(new URL(request.url).pathname.startsWith('/api/'))headers.set('Cache-Control','no-store');
    else if(new URL(request.url).pathname==='/'||response.headers.get('Content-Type')?.includes('text/html'))headers.set('Cache-Control','no-store');
    return new Response(response.body,{status:response.status,headers});
  }
};
