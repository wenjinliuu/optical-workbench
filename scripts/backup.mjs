import { createBackup } from '../src/recovery.mjs';
if(process.env.NODE_ENV==='production')throw Error('Production backup policy is pending review.');
try{
  if(process.argv.length>2)throw Error('使用 DATABASE_PATH / BACKUP_DIRECTORY 指定来源和备份目录');
  const result=await createBackup(process.env.DATABASE_PATH||'data/workbench.sqlite',process.env.BACKUP_DIRECTORY||'backups');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(`备份失败：${error.message}`);process.exitCode=1;}
