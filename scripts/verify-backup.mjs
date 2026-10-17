import { verifyBackup } from '../src/recovery.mjs';
if(process.env.NODE_ENV==='production')throw Error('Production recovery policy is pending review.');
try{
  if(process.argv.length!==3)throw Error('用法：npm run backup:verify -- <备份.sqlite>');
  console.log(JSON.stringify(await verifyBackup(process.argv[2]),null,2));
}catch(error){console.error(`校验失败：${error.message}`);process.exitCode=1;}
