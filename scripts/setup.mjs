import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {passwordDigest,proofDigest} from '../server/worker.mjs';
const privateDir=new URL('../.private/',import.meta.url);await mkdir(privateDir,{recursive:true});
const secretFile=new URL('secrets.json',privateDir);
try{await access(secretFile);if(!process.argv.includes('--rotate')){console.error('Настройките вече съществуват. За нова парола: npm run setup -- --rotate');process.exit(1);}}catch(error){if(error.code!=='ENOENT')throw error;}
let names;
try{names=JSON.parse(await readFile(new URL('roster.json',privateDir),'utf8'));}catch(_){console.error('Първо запази имената като JSON масив в .private/roster.json. Виж README.');process.exit(1);}
if(!Array.isArray(names)||!names.length||names.length>60||names.some(n=>typeof n!=='string'||!n.trim()||n.length>60||/\d{8,}/.test(n))||new Set(names).size!==names.length)throw new Error('Невалиден списък с имена.');
let username='uchitel';
if(process.stdin.isTTY&&!process.argv.includes('--default-user')){const input=createInterface({input:process.stdin,output:process.stdout});username=(await input.question('Потребителско име [uchitel]: ')).trim()||username;input.close();}
if(!/^[\w.-]{3,64}$/.test(username))throw new Error('Използвай 3–64 латински букви, цифри, точка, тире или долна черта.');
// Generate a strong password locally; never print it to logs or commit it.
const password=randomBytes(20).toString('base64url'),salt=randomBytes(24).toString('hex');
const env={TEACHER_USERNAME:username,TEACHER_HASH:await proofDigest(await passwordDigest(password,salt)),TEACHER_SALT:salt,SESSION_SECRET:randomBytes(32).toString('hex'),CLASS_NAMES_JSON:JSON.stringify(names)};
await writeFile(secretFile,JSON.stringify(env,null,2),{mode:0o600});
await writeFile(new URL('teacher-login.txt',privateDir),`Учителски вход\n\nПотребителско име: ${username}\nПарола: ${password}\n\nНе качвай този файл в GitHub и не го споделяй публично.\nСесията изтича след 2 часа. За нова парола: npm run setup -- --rotate\nСлед смяна публикувай тайните отново: npm run publish-secrets\n`,{mode:0o600});
console.log('Готово. Данните за учителя са в .private/teacher-login.txt. Не са отпечатани в конзолата.');
