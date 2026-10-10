import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for(const dir of ['src','scripts','test','public'])for(const f of readdirSync(dir).filter(x=>/\.(mjs|js)$/.test(x))){const r=spawnSync(process.execPath,['--check',`${dir}/${f}`],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('JavaScript syntax checks passed.');
