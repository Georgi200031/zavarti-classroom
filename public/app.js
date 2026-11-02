'use strict';
// Private names arrive only from the authenticated server API.
const DEFAULT_NAMES = [];
const COLORS = ['#efb5a3','#e9ce7a','#b7cda3','#a8c8c1','#e5c4c6','#f1ce94','#c7c798','#a9c4cc'];
const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let names = [...DEFAULT_NAMES], excluded = new Set(), picked = new Set(), history = [], noRepeat = true, sound = true, spinning = false, rotation = 0, wheelNames = [], audio = null, animationId = 0, toastTimer;
let authenticated = false;
try { localStorage.removeItem('zavarti-class-v1'); const prefs=JSON.parse(localStorage.getItem('zavarti-prefs-v2')); if(prefs){noRepeat=prefs.noRepeat!==false;sound=prefs.sound!==false;} } catch (_) {}
function save() { try { localStorage.setItem('zavarti-prefs-v2', JSON.stringify({noRepeat,sound})); } catch (_) {} }

function eligible() { return names.filter(n => !excluded.has(n) && (!noRepeat || !picked.has(n))); }
function icon(id, cls) { const s=document.createElementNS('http://www.w3.org/2000/svg','svg'); if(cls)s.classList.add(cls);const u=document.createElementNS(s.namespaceURI,'use');u.setAttribute('href',id);s.append(u);return s; }
function toast(text) { $('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500); }
function updateSound() { $('#sound').replaceChildren(icon(sound?'#i-sound':'#i-mute'));$('#sound').setAttribute('aria-pressed',String(sound));$('#sound').setAttribute('aria-label',sound?'Изключи звука':'Включи звука'); }
function renderList() {
  const fragment = document.createDocumentFragment();
  names.forEach((name,i) => {
    const chosen = noRepeat && picked.has(name), on = !excluded.has(name) && !chosen;
    const button=document.createElement('button');button.className='person'+(chosen?' picked':'');button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',name+(chosen?' — вече избран':on?' — участва':' — не участва'));button.disabled=spinning || chosen;
    const number=document.createElement('span');number.className='number';number.textContent=String(i+1).padStart(2,'0');
    const label=document.createElement('span');label.className='person-name';label.textContent=name;
    button.append(number,label,icon(chosen?'#i-spark':'#i-check','check'));
    button.addEventListener('click',()=>{if(spinning)return;excluded.has(name)?excluded.delete(name):excluded.add(name);rotation=0;refresh();save();});fragment.append(button);
  });
  $('#participants').replaceChildren(fragment);
}
function drawWheel() {
  const canvas=$('#wheel'), ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,1200,1200);ctx.save();ctx.translate(600,600);
  const entries=wheelNames.length?wheelNames:['Готови за нов кръг?'];
  const step=TAU/entries.length;
  entries.forEach((name,i)=>{
    const a=-Math.PI/2+i*step,b=a+step;
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,597,a,b);ctx.closePath();ctx.fillStyle=COLORS[i%COLORS.length];ctx.fill();ctx.strokeStyle='#fff9e9';ctx.lineWidth=3;ctx.stroke();
    ctx.save();ctx.rotate(a+step/2);
    const parts=name.split(' '),label=entries.length>12?parts[0]+(parts.length>1?' '+parts[parts.length-1][0]+'.':''):name;
    ctx.font=`600 ${entries.length>35?23:entries.length>20?29:34}px "Segoe UI",Arial,sans-serif`;ctx.fillStyle='#3d5142';ctx.textBaseline='middle';ctx.textAlign='right';
    ctx.fillText(label,535,0,entries.length>35?300:350);
    ctx.beginPath();ctx.arc(565,0,4,0,TAU);ctx.fillStyle='#fff9e9cc';ctx.fill();ctx.restore();
  });ctx.restore();canvas.style.transform=`rotate(${rotation}rad)`;
}
function renderHistory() {
  if(!history.length){const div=document.createElement('div');div.className='empty-history';const s=document.createElement('span');s.textContent='✧';div.append(s,document.createTextNode('Още няма избрани. Първото завъртане е най-вълнуващо!'));$('#history').replaceChildren(div);return;}
  const frag=document.createDocumentFragment();history.slice(0,8).forEach((entry,i)=>{const div=document.createElement('div');div.className='history-chip';const order=document.createElement('span');order.className='history-order';order.textContent=String(history.length-i).padStart(2,'0');const name=document.createElement('strong');name.textContent=entry.name;const time=document.createElement('time');time.dateTime=new Date(entry.time).toISOString();time.textContent=new Date(entry.time).toLocaleTimeString('bg-BG',{hour:'2-digit',minute:'2-digit'});const sparkle=document.createElement('span');sparkle.textContent='✧';div.append(order,name,time,sparkle);frag.append(div);});$('#history').replaceChildren(frag);
}
function refresh(keepWheel=false) {
  if(!keepWheel){wheelNames=eligible();drawWheel();}
  renderList();renderHistory();updateSound();
  const n=eligible().length;$('#active-count').textContent=n;$('#participant-summary').textContent=`${names.length} ученици в списъка`;$('#wheel-count').textContent=`${keepWheel?wheelNames.length:n} имена · равен шанс`;$('#no-repeat').setAttribute('aria-checked',String(noRepeat));
  $('#spin').disabled=spinning || !n;$('#spin span').textContent=spinning?'Късметът се завърта…':!n?'Кръгът приключи':'Завърти колелото';
  ['#edit','#reset','#select-all','#no-repeat','#duration'].forEach(id=>$(id).disabled=spinning);
  if(!spinning && !n)$('#spin-status').textContent=names.every(n=>excluded.has(n))?'Включи поне едно име от списъка.':'Всички получиха своя момент! Натисни „Нов кръг“.';
}
function randomIndex(n) {
  // Rejection sampling keeps the chances exactly equal, with no modulo bias.
  const array=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;let value;do{crypto.getRandomValues(array);value=array[0];}while(value>=limit);return value%n;
}
function getAudio() {if(!sound)return null;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});return audio;}catch(_){return null;}}
function tone(frequency,duration,volume=.025,delay=0,type='sine') {
  const a=getAudio();if(!a)return;try{const o=a.createOscillator(),g=a.createGain(),start=a.currentTime+delay;o.type=type;o.frequency.value=frequency;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(volume,start+.005);g.gain.exponentialRampToValueAtTime(.0001,start+duration);o.connect(g);g.connect(a.destination);o.start(start);o.stop(start+duration+.02);}catch(_){}
}
function fanfare(){[523.25,659.25,783.99,1046.5].forEach((n,i)=>tone(n,.65,.055,i*.12));}
function spin() {
  if(!authenticated || spinning || $('#winner-dialog').open || $('#edit-dialog').open)return;
  wheelNames=eligible();if(!wheelNames.length)return;
  getAudio();const index=randomIndex(wheelNames.length),winner=wheelNames[index];
  const startRotation=((rotation%TAU)+TAU)%TAU;rotation=startRotation;drawWheel();
  const wanted=(TAU-(index+.5)*TAU/wheelNames.length)%TAU;
  const delta=TAU*7+((wanted-startRotation+TAU)%TAU);
  const duration=reducedMotion.matches?600:Number($('#duration').value),start=performance.now();let lastTick=-1;
  spinning=true;$('#wheel-wrap').classList.add('spinning');$('.wheel-card').classList.add('spinning');$('#spin-status').textContent='Всяко име има шанс. Да видим чий е моментът…';refresh(true);
  function animate(now) {
    const p=Math.min((now-start)/duration,1),ease=1-Math.pow(1-p,4);
    rotation=startRotation+delta*ease;$('#wheel').style.transform=`rotate(${rotation}rad)`;
    const tick=Math.floor(rotation/(TAU/wheelNames.length));if(tick!==lastTick){lastTick=tick;if(p>.2)tone(650+120*(1-p),.035,.012);}
    if(p<1){animationId=requestAnimationFrame(animate);return;}
    spinning=false;$('#wheel-wrap').classList.remove('spinning');$('.wheel-card').classList.remove('spinning');picked.add(winner);history.unshift({name:winner,time:Date.now()});history=history.slice(0,50);save();refresh(true);
    $('#spin-status').textContent=`Колелото избра ${winner}!`;
    $('#winner-name').textContent=winner;$('#winner-dialog').showModal();fanfare();celebrate();
  }animationId=requestAnimationFrame(animate);
}

// Fireworks and confetti are drawn in a single canvas, without external libraries.
let celebrationId=0,particles=[],celebrationStart=0,lastBurst=0;
function celebrate() {
  cancelAnimationFrame(celebrationId);particles=[];
  const c=$('#celebration'),ctx=c.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);celebrationStart=performance.now();lastBurst=-1000;
  const palette=['#f4c653','#dd917e','#8bbca6','#9bb8cb','#eab4bc','#fff4c5'];
  function burst(x,y){for(let i=0;i<(reducedMotion.matches?16:65);i++){const angle=Math.random()*TAU,speed=1.5+Math.random()*5;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,color:palette[i%palette.length],size:1+Math.random()*3,angle:Math.random()*TAU,confetti:false});}}
  for(let i=0;i<(reducedMotion.matches?25:115);i++)particles.push({x:Math.random()*w,y:-Math.random()*h*.6,vx:(Math.random()-.5)*4,vy:2+Math.random()*3,life:1,color:palette[i%palette.length],size:3+Math.random()*5,angle:Math.random()*TAU,confetti:true});
  let previous=performance.now();
  function draw(now){const elapsed=now-celebrationStart,dt=Math.min((now-previous)/16.667,3);previous=now;ctx.clearRect(0,0,w,h);if(elapsed<2400&&elapsed-lastBurst>500&&!reducedMotion.matches){lastBurst=elapsed;burst(w*(.12+Math.random()*.25),h*(.15+Math.random()*.25));burst(w*(.68+Math.random()*.2),h*(.1+Math.random()*.3));}
    particles=particles.filter(p=>p.life>0&&p.y<h+40);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.confetti?.012:.04)*dt;p.life-=(p.confetti?.0035:.009)*dt;p.angle+=.045*dt;ctx.save();ctx.globalAlpha=Math.min(p.life,1);ctx.fillStyle=p.color;ctx.translate(p.x,p.y);ctx.rotate(p.angle);if(p.confetti)ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.55);else{ctx.beginPath();ctx.arc(0,0,p.size,0,TAU);ctx.fill();}ctx.restore();}
    if(elapsed<(reducedMotion.matches?1600:6500))celebrationId=requestAnimationFrame(draw);else{ctx.clearRect(0,0,w,h);particles=[];}
  }celebrationId=requestAnimationFrame(draw);
}
function closeWinner(){if($('#winner-dialog').open)$('#winner-dialog').close();cancelAnimationFrame(celebrationId);$('#celebration').getContext('2d').clearRect(0,0,$('#celebration').width,$('#celebration').height);rotation=0;refresh();if(eligible().length)$('#spin-status').textContent='Още един звезден момент? Колелото е готово.';$('#spin').focus();}
$('#spin').addEventListener('click',spin);
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement.tagName)&&!$('#edit-dialog').open&&!$('#winner-dialog').open){e.preventDefault();spin();}});
$('#sound').addEventListener('click',()=>{sound=!sound;updateSound();save();if(sound)tone(660,.15);});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(_){toast('Използвай F11 за цял екран.');}});
document.addEventListener('fullscreenchange',()=>$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Изход от цял екран':'Цял екран'));
$('#no-repeat').addEventListener('click',()=>{if(spinning)return;noRepeat=!noRepeat;rotation=0;refresh();save();toast(noRepeat?'Всеки ще бъде избран веднъж за този кръг.':'Всяко име участва при всяко завъртане.');});
$('#select-all').addEventListener('click',()=>{if(spinning)return;excluded.clear();rotation=0;refresh();save();toast('Всички неизбрани ученици участват.');});
$('#reset').addEventListener('click',()=>{if(spinning)return;picked.clear();history=[];rotation=0;refresh();save();$('#spin-status').textContent='Нов кръг, нови възможности. Късмет на всички!';toast('Новият кръг започва!');});
$('#winner-next').addEventListener('click',closeWinner);$('#winner-dialog .dialog-close').addEventListener('click',closeWinner);$('#celebrate-again').addEventListener('click',()=>{celebrate();fanfare();});
$('#winner-dialog').addEventListener('cancel',e=>{e.preventDefault();closeWinner();});
$('#edit').addEventListener('click',()=>{if(spinning)return;$('#names-input').value=names.join('\n');$('#edit-error').textContent='';$('#edit-dialog').showModal();});
$('#edit-dialog .dialog-close').addEventListener('click',()=>$('#edit-dialog').close());
$('#restore').addEventListener('click',()=>{$('#names-input').value=DEFAULT_NAMES.join('\n');$('#edit-error').textContent='Натисни „Запази списъка“, за да възстановиш имената.';});
$('#save-names').addEventListener('click',()=>{
  const parsed=$('#names-input').value.split(/\r?\n/).map(n=>n.replace(/\s+/g,' ').trim()).filter(Boolean);
  if(!parsed.length){$('#edit-error').textContent='Добави поне едно име.';return;}
  if(parsed.length>60){$('#edit-error').textContent='Колелото побира до 60 участници.';return;}
  if(parsed.some(n=>n.length>60)){ $('#edit-error').textContent='Всяко име трябва да е до 60 знака.';return;}
  if(new Set(parsed.map(n=>n.toLocaleLowerCase('bg'))).size!==parsed.length){$('#edit-error').textContent='Има повтарящи се имена. Добави фамилия или инициали, за да ги различиш.';return;}
  if(parsed.some(n=>/\d{8,}/.test(n))){$('#edit-error').textContent='Въведи само имена, без ЕГН или други идентификационни номера.';return;}
  names=parsed;excluded.clear();picked.clear();history=[];rotation=0;save();refresh();$('#edit-dialog').close();$('#spin-status').textContent='Новият списък е готов. Да завъртим!';toast(`Запазени са ${names.length} имена.`);
});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(animationId);cancelAnimationFrame(celebrationId);});
refresh();

document.addEventListener('teacher-login', event => {
  const received=event.detail.names;
  DEFAULT_NAMES.splice(0,DEFAULT_NAMES.length,...received);names=[...received];
  excluded.clear();picked.clear();history=[];rotation=0;authenticated=true;
  refresh();$('#spin-status').textContent='Колелото е готово. Късмет на всички!';
});
document.addEventListener('teacher-logout', () => {
  authenticated=false;cancelAnimationFrame(animationId);cancelAnimationFrame(celebrationId);spinning=false;
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  $('#winner-name').textContent='';$('#names-input').value='';$('#toast').textContent='';
  DEFAULT_NAMES.length=0;names=[];wheelNames=[];history=[];excluded.clear();picked.clear();rotation=0;
  $('#wheel-wrap').classList.remove('spinning');$('.wheel-card').classList.remove('spinning');
  $('#celebration').getContext('2d').clearRect(0,0,$('#celebration').width,$('#celebration').height);
  refresh();
});
