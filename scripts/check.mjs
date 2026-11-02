import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=new URL('..',import.meta.url);
for(const directory of ['public','server','scripts','test']){
  for(const name of await readdir(new URL(directory+'/',root))){
    const file=new URL(directory+'/'+name,root),text=await readFile(file,'utf8');
    assert(!/\b(?:19|20)\d{8}\b/.test(text),'Unexpected identification number in public source');
    if(/\.(m?js)$/.test(name)){const result=spawnSync(process.execPath,['--check',fileURLToPath(file)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
  }
}
const app=await readFile(new URL('public/app.js',root),'utf8');assert(app.includes('const DEFAULT_NAMES = [];'),'Roster must not be bundled in public JavaScript');
console.log('Syntax checks and public-source privacy checks passed.');
