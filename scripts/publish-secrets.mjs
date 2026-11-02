import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const env=JSON.parse(await readFile(new URL('../.private/secrets.json',import.meta.url),'utf8'));
const wrangler=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url);
// Values travel through stdin, never command-line arguments, Git, or stdout.
const child=spawn(process.execPath,[fileURLToPath(wrangler),'secret','bulk'],{stdio:['pipe','inherit','inherit'],cwd:new URL('..',import.meta.url)});
child.stdin.end(JSON.stringify(env));child.on('exit',code=>process.exit(code??1));child.on('error',error=>{console.error(error.message);process.exit(1);});
