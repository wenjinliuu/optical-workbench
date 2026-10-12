import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const repo=resolve(fileURLToPath(new URL('..',import.meta.url))),origin='https://optical-workbench-blueprint.wenjinuu.chatgpt.site';
const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--receipt'))throw Error('Usage: npm run progress:verify [-- --receipt docs/progress-sync.json]');
const progress=JSON.parse(readFileSync(join(repo,'docs/progress.json'),'utf8'));
function get(path){const r=spawnSync('curl',['--fail','--silent','--show-error','--location','--max-time','30','--retry','2','--header','Cache-Control: no-cache',origin+path],{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==0)throw Error('Unable to verify live design resource '+path);return r.stdout;}
const script=get('/progress-data.js'),prefix='DESIGN.progress=',start=script.indexOf(prefix),end=script.indexOf(';\nDESIGN.tasks.forEach',start);
assert.ok(start>=0&&end>start,'Unexpected published snapshot format.');
const live=JSON.parse(script.slice(start+prefix.length,end));
assert.equal(live.developmentVerification?.version,progress.developmentVerification.version,'Published version is stale; wait for publication propagation and verify again.');
assert.equal(live.releaseChecklist?.length,progress.releaseChecklist.length,'Published delivery count differs from the repository.');
const equal=(a,b,label)=>{try{assert.deepEqual(a,b);}catch{throw Error(label);}};
equal(live,progress,'Published webpage progress differs from the repository.');
equal(JSON.parse(get('/downloads/progress.json')),progress,'Published progress download differs from the repository.');
const baseline=JSON.parse(readFileSync(join(repo,'docs/requirements.json'),'utf8')).requirements,download=JSON.parse(get('/downloads/requirements.json'));
assert.equal(download.baseline,progress.baseline);assert.equal(download.updated,progress.updated);
equal(download.requirements,baseline.map(r=>({...r,...progress.requirements.find(x=>x.id===r.id)})),'Published requirements differ from the original content or current tracking.');
const plan=get('/downloads/development-plan.md'),version=progress.releaseChecklist.at(-1).version,checked=progress.releaseChecklist.filter(x=>x.status==='completed').length;
assert.ok(plan.includes(progress.productStatus),'Execution document has stale progress.');
assert.equal((plan.match(/^- \[x\] V0\./gm)||[]).length,checked,'Execution document delivery checkboxes differ.');
for(const t of progress.tasks)assert.ok(plan.includes('#### '+t.id+' '+t.name),'Execution document omitted task '+t.id);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const report={verified_at:new Date().toISOString(),site_url:origin,development_version:version,checked_deliveries:checked,tasks:progress.tasks.length,requirements:progress.requirements.length,accepted_tasks:progress.tasks.filter(t=>t.status==='已验收').length,progress_sha256:createHash('sha256').update(JSON.stringify(canonical(progress))).digest('hex'),resources:['/progress-data.js','/downloads/progress.json','/downloads/requirements.json','/downloads/development-plan.md'],result:'passed'};
if(args.length){const target=resolve(repo,args[1]),temporary=target+'.tmp';writeFileSync(temporary,JSON.stringify(report,null,2)+'\n');renameSync(temporary,target);}
console.log(JSON.stringify(report,null,2));
