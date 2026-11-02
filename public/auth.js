const form=document.querySelector('#login-form');
const message=document.querySelector('#login-error');
let sessionExpires=0,checkTimer;
const send=(type,detail)=>document.dispatchEvent(new CustomEvent(type,{detail}));
async function makeProof(password){
  const response=await fetch('/api/auth-info',{cache:'no-store'}),info=await response.json();
  if(!response.ok)throw new Error(info.error||'Входът още не е настроен.');
  if(!/^[a-f\d]{32,128}$/i.test(info.salt)||info.salt.length%2||info.iterations!==100000)throw new Error('Невалидни настройки за вход.');
  const salt=Uint8Array.from(info.salt.match(/.{2}/g),s=>parseInt(s,16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:info.iterations,hash:'SHA-512'},key,256);
  return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function lock(text=''){
  clearTimeout(checkTimer);sessionExpires=0;send('teacher-logout');document.body.classList.add('auth-locked');
  form.reset();document.querySelector('#password').type='password';document.querySelector('#show-password').textContent='Покажи';document.querySelector('#show-password').setAttribute('aria-pressed','false');message.textContent=text;
}
async function unlock(){
  const response=await fetch('/api/roster',{cache:'no-store',credentials:'same-origin'});
  if(!response.ok)throw new Error('Не успяхме да заредим списъка. Влез отново.');
  const data=await response.json();
  if(!Array.isArray(data.names))throw new Error('Невалиден списък.');
  sessionExpires=data.expiresAt;send('teacher-login',{names:data.names});
  document.body.classList.remove('auth-locked');form.reset();document.querySelector('#password').type='password';
  clearTimeout(checkTimer);checkTimer=setTimeout(()=>lock('Сесията изтече. Влез отново.'),Math.max(1,sessionExpires-Date.now()));
}
form.addEventListener('submit',async e=>{
  e.preventDefault();message.textContent='';const button=document.querySelector('#login-submit');button.disabled=true;
  const username=form.username.value.trim(),password=form.password.value;
  try{
    const proof=await makeProof(password);
    const response=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,proof})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Входът не беше успешен.');
    await unlock();
  }catch(error){lock(error.message||'Няма връзка със сървъра. Опитай отново.');}
  finally{button.disabled=false;}
});
document.querySelector('#show-password').addEventListener('click',()=>{const input=document.querySelector('#password'),show=input.type==='password';input.type=show?'text':'password';document.querySelector('#show-password').textContent=show?'Скрий':'Покажи';document.querySelector('#show-password').setAttribute('aria-label',show?'Скрий паролата':'Покажи паролата');document.querySelector('#show-password').setAttribute('aria-pressed',String(show));});
document.querySelector('#logout').addEventListener('click',async()=>{
  // Always wipe the displayed roster; report a failed server logout without hiding it.
  lock();try{const response=await fetch('/api/logout',{method:'POST',credentials:'same-origin'});if(!response.ok)throw new Error();}
  catch(_){message.textContent='Списъкът е скрит, но изходът не беше потвърден от сървъра. Затвори браузъра, ако устройството е споделено.';}
});
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState!=='visible'||!sessionExpires)return;if(Date.now()>=sessionExpires){lock('Сесията изтече. Влез отново.');return;}try{const response=await fetch('/api/session',{cache:'no-store'});if(!response.ok)lock('Влез отново, за да продължиш.');}catch(_){lock('Няма връзка със сървъра. Влез отново.');}});
// Wipe private UI before this document can be placed in the back-forward cache.
window.addEventListener('pagehide',()=>lock());
window.addEventListener('pageshow',event=>{if(event.persisted)unlock().catch(()=>lock());});
unlock().catch(()=>lock());
