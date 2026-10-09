import {specialtyTables} from './specialty.mjs';
import {verifySpecialty} from './specialty-recovery.mjs';
import {referralTables} from './referrals.mjs';
import {verifyReferrals} from './referral-recovery.mjs';
import {contactTables} from './contact.mjs';
import {verifyContact} from './contact-recovery.mjs';
import {longitudinalTables} from './longitudinal.mjs';
import {verifyLongitudinal} from './longitudinal-recovery.mjs';
import {familyTables} from './family-training.mjs';
import {verifyFamilyTraining} from './family-training-recovery.mjs';
import {schedulingTables} from './scheduling.mjs';
import {verifyScheduling} from './scheduling-recovery.mjs';
import {entitlementTables} from './entitlements.mjs';
import {verifyEntitlements} from './entitlements-recovery.mjs';
import {trainingTables} from './training.mjs';
import {verifyTraining} from './training-recovery.mjs';
import {parameterTables} from './parameters.mjs';
import {verifyParameters} from './parameter-recovery.mjs';
import {refundTables,verifyRefunds} from './refunds.mjs';
import {dispositionTables,verifyDispositions} from './aftercare-dispositions.mjs';
import {replacementTables,verifyReplacements} from './aftercare-replacements.mjs';
import {aftercareWorkTables,verifyAftercareWork} from './aftercare-work.mjs';
import {dispatchTables,verifyDispatch} from './dispatch.mjs';
import {aftercareTables,verifyAftercare} from './aftercare.mjs';
import {fulfillmentTables,verifyFulfillment} from './fulfillment.mjs';
import {processingTables,verifyProcessing} from './processing.mjs';
import { paymentTables,verifyPayments } from './payments.mjs';
import { inventoryTables,verifyInventory } from './inventory.mjs';
import { retailTables, verifyRetail } from './retail.mjs';
import { verifyAmendments } from './task-amendments.mjs';
import { verifyCompletions } from './task-completions.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants, copyFileSync, chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { openDatabase } from './db.mjs';

const tables=[...specialtyTables,...referralTables,...contactTables,...longitudinalTables,...familyTables,...schedulingTables,...entitlementTables,...trainingTables,...parameterTables,...refundTables,...dispositionTables,...replacementTables,...aftercareWorkTables,...dispatchTables,...aftercareTables,...fulfillmentTables,...processingTables,...paymentTables,...inventoryTables,...retailTables,'stores','users','user_security','customers','customer_profile_versions','family_contacts','guardian_links','service_cycles','cycle_versions','visits','visit_cycles','visit_cycle_versions','work_tasks','task_events','task_conditions','task_evidence','task_evidence_documents','task_evidence_attachments','task_completions','task_completion_corrections','task_followups','attachment_blobs','attachments','document_records','document_versions','version_attachments','audit_events','idempotency','sessions'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const migrations=['001_foundation.sql','002_family_visits.sql','003_documents_attachments.sql','004_account_security.sql','005_customer_profiles.sql','006_cycle_versions.sql','007_work_tasks.sql','008_task_execution.sql','009_task_exceptions.sql','010_task_evidence.sql','011_task_completions.sql','012_task_amendments.sql','013_retail_orders.sql','014_inventory.sql','015_payments.sql','016_processing.sql','017_fulfillment.sql','018_dispatch_aftercare.sql','019_aftercare_work.sql','020_aftercare_replacements.sql','021_aftercare_dispositions.sql','022_refunds.sql','023_parameters.sql','024_training.sql','025_entitlements.sql','026_scheduling.sql','027_family_training.sql','028_longitudinal.sql','029_contact.sql','030_referrals.sql','031_specialty.sql'];
let expectedSchema;
const schema=db=>digest(JSON.stringify(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all()));
function canonicalSchema(){if(!expectedSchema){const db=openDatabase(':memory:');try{expectedSchema=schema(db);}finally{db.close();}}return expectedSchema;}
function regular(path){const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('需要普通数据库或清单文件，不能使用目录或符号链接');return stat;}
async function hashFile(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export function inspectDatabase(path){
  regular(path);const db=new DatabaseSync(path,{readOnly:true});
  try{
    if(db.prepare('PRAGMA integrity_check').all().some(row=>row.integrity_check!=='ok'))throw Error('数据库完整性校验失败');
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('数据库关联校验失败');
    const applied=db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map(row=>row.name);
    if(JSON.stringify(applied)!==JSON.stringify(migrations)||schema(db)!==canonicalSchema())throw Error('数据库结构与当前版本不匹配，请使用对应版本的恢复工具');
    if(db.prepare('SELECT 1 FROM customers c LEFT JOIN customer_profile_versions v ON v.customer_id=c.id AND v.version=(SELECT max(version) FROM customer_profile_versions WHERE customer_id=c.id) WHERE v.version IS NULL OR c.name IS NOT v.name OR c.birth_date IS NOT v.birth_date OR c.contact_name IS NOT v.contact_name OR c.phone IS NOT v.phone LIMIT 1').get())throw Error('当前档案与历史版本核对失败');
    if(db.prepare('SELECT 1 FROM service_cycles c LEFT JOIN cycle_versions v ON v.cycle_id=c.id AND v.version=(SELECT max(version) FROM cycle_versions WHERE cycle_id=c.id) WHERE v.version IS NULL OR c.goal IS NOT v.goal OR c.type IS NOT v.type LIMIT 1').get())throw Error('当前周期需求与历史版本核对失败');
    if(db.prepare('SELECT 1 FROM visit_cycles c LEFT JOIN visit_cycle_versions v ON v.visit_id=c.visit_id AND v.cycle_id=c.cycle_id WHERE v.visit_id IS NULL LIMIT 1').get())throw Error('到店周期引用快照缺失');
    if(db.prepare('SELECT 1 FROM work_tasks t LEFT JOIN task_events e ON e.task_id=t.id AND e.revision=t.revision WHERE e.task_id IS NULL OR (SELECT max(revision) FROM task_events WHERE task_id=t.id)<>t.revision OR t.assignee_id IS NOT e.assignee_id OR t.candidate_role IS NOT e.candidate_role OR t.assignment_status IS NOT e.assignment_status OR t.lifecycle_status IS NOT e.lifecycle_status OR t.exception_reason IS NOT e.exception_reason OR t.restore_status IS NOT e.restore_status OR t.restore_reason IS NOT e.restore_reason OR t.execution_status IS NOT e.execution_status OR t.updated_at IS NOT e.created_at OR (SELECT count(*) FROM task_events WHERE task_id=t.id)<>t.revision LIMIT 1').get())throw Error('任务当前状态与交接历史核对失败');
    if(db.prepare("SELECT 1 FROM work_tasks t LEFT JOIN visit_cycle_versions v ON v.visit_id=t.visit_id AND v.cycle_id=t.cycle_id WHERE t.context_basis='visit_cycle' AND (v.basis IS NOT 'captured' OR t.cycle_version IS NOT v.version) LIMIT 1").get())throw Error('任务与到店固定需求引用核对失败');
    for(const table of ['task_conditions','task_evidence'])if(db.prepare(`SELECT 1 FROM ${table} GROUP BY task_id HAVING min(version)<>1 OR count(*)<>max(version) LIMIT 1`).get())throw Error('任务条件或依据历史版本不连续');
    for(const row of db.prepare('SELECT * FROM task_evidence').iterate()){const documents=db.prepare('SELECT document_version_id FROM task_evidence_documents WHERE task_id=? AND evidence_version=? ORDER BY document_version_id').all(row.task_id,row.version).map(r=>r.document_version_id),attachments=db.prepare('SELECT attachment_id FROM task_evidence_attachments WHERE task_id=? AND evidence_version=? ORDER BY attachment_id').all(row.task_id,row.version).map(r=>r.attachment_id);if(documents.length>10||attachments.length>10||row.references_json!==JSON.stringify({document_version_ids:documents,attachment_ids:attachments}))throw Error('任务依据固定资料引用核对失败');}
    verifyCompletions(db);verifyAmendments(db);verifyRetail(db);verifyInventory(db);verifyPayments(db);verifyProcessing(db);verifyFulfillment(db);verifyDispatch(db);verifyAftercare(db);verifyAftercareWork(db);verifyReplacements(db);verifyDispositions(db);verifyRefunds(db);verifyParameters(db);verifyTraining(db);verifyEntitlements(db);verifyScheduling(db);verifyFamilyTraining(db);verifyLongitudinal(db);verifyContact(db);verifyReferrals(db);verifySpecialty(db);
    for(const blob of db.prepare('SELECT * FROM attachment_blobs').iterate())if(blob.size!==blob.bytes.length||digest(blob.bytes)!==blob.sha256)throw Error('附件内容校验失败');
    if(db.prepare('SELECT 1 FROM attachments a JOIN attachment_blobs b ON b.sha256=a.blob_sha256 WHERE a.size<>b.size LIMIT 1').get())throw Error('附件元信息校验失败');
    return {schema_sha256:schema(db),migrations:applied,counts:Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT count(*) n FROM ${table}`).get().n])),integrity:'ok',foreign_keys:'ok',attachments:'ok'};
  }finally{db.close();}
}
export async function createBackup(source,directory='backups'){
  source=resolve(source);regular(source);directory=resolve(directory);mkdirSync(directory,{recursive:true,mode:0o700});
  const target=join(directory,`workbench-${Date.now()}-${randomUUID()}.sqlite`),manifestPath=`${target}.json`;
  try{
    // Read-only source: backup never creates a database or migrates the live one.
    const db=new DatabaseSync(source,{readOnly:true});try{db.prepare('VACUUM INTO ?').run(target);}finally{db.close();}
    chmodSync(target,0o600);const checks=inspectDatabase(target);
    const manifest={format:'optical-workbench-backup-v1',created_at:new Date().toISOString(),app_version:version,database:basename(target),bytes:regular(target).size,sha256:await hashFile(target),...checks};
    writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    return {backup:target,manifest:manifestPath,checks};
  }catch(error){rmSync(target,{force:true});rmSync(manifestPath,{force:true});throw error;}
}
export async function verifyBackup(path){
  path=resolve(path);const file=regular(path),manifestPath=`${path}.json`;regular(manifestPath);
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(manifest.format!=='optical-workbench-backup-v1'||manifest.database!==basename(path)||!Number.isSafeInteger(manifest.bytes)||!/^\d+\.\d+\.\d+$/.test(manifest.app_version||'')||Number.isNaN(Date.parse(manifest.created_at))||!(/^[a-f0-9]{64}$/).test(manifest.sha256||''))throw Error('备份清单格式不正确');
  if(file.size!==manifest.bytes||await hashFile(path)!==manifest.sha256)throw Error('备份文件指纹不匹配');
  const checks=inspectDatabase(path);
  for(const key of ['schema_sha256','migrations','counts','integrity','foreign_keys','attachments'])if(JSON.stringify(checks[key])!==JSON.stringify(manifest[key]))throw Error('备份清单与数据核对不一致');
  return {backup:path,manifest:manifestPath,sha256:manifest.sha256,created_at:manifest.created_at,checks};
}
export async function restoreBackup(path,targetDirectory){
  const verified=await verifyBackup(path),target=resolve(targetDirectory);
  // A dedicated directory must be new. Never replace a live DB, WAL or existing file.
  mkdirSync(target,{mode:0o700});const database=join(target,'workbench.sqlite');
  try{
    copyFileSync(verified.backup,database,constants.COPYFILE_EXCL);chmodSync(database,0o600);
    if(await hashFile(database)!==verified.sha256)throw Error('恢复副本指纹不匹配');
    const db=new DatabaseSync(database);let revoked;
    try{db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');revoked=db.prepare('DELETE FROM sessions').run().changes;db.exec('COMMIT');}finally{db.close();}
    const checks=inspectDatabase(database);
    for(const table of tables)if(checks.counts[table]!== (table==='sessions'?0:verified.checks.counts[table]))throw Error('恢复后记录数量核对失败');
    const receipt={format:'optical-workbench-restore-v1',restored_at:new Date().toISOString(),app_version:version,backup_sha256:verified.sha256,restored_sha256:await hashFile(database),sessions_revoked:revoked,checks};
    writeFileSync(join(target,'restore-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    return {database,receipt:join(target,'restore-receipt.json'),sessions_revoked:revoked,checks};
  }catch(error){rmSync(target,{recursive:true,force:true});throw error;}
}
