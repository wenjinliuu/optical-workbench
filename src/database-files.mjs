import {closeSync,mkdirSync,openSync} from 'node:fs';
import {dirname} from 'node:path';

export function prepareDatabaseFile(path) {
  if(path===':memory:')return {created:false};
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  try{
    closeSync(openSync(path,'wx',0o600));
    return {created:true};
  }catch(error){
    if(error?.code==='EEXIST')return {created:false};
    throw error;
  }
}
