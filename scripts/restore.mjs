import { restoreBackup } from '../src/recovery.mjs';
if(process.env.NODE_ENV==='production')throw Error('Production recovery policy is pending review.');
try{
  if(process.argv.length!==4)throw Error('用法：npm run restore -- <备份.sqlite> <尚不存在的独立目录>');
  console.log(JSON.stringify(await restoreBackup(process.argv[2],process.argv[3]),null,2));
}catch(error){console.error(`恢复失败：${error.message}`);process.exitCode=1;}
