import {screeningProjectSource} from './screening-projects.mjs';
import {screeningBatchSource} from './screening-batches.mjs';
import {screeningRowLinksSource} from './screening-row-links.mjs';
import {shareHash} from './family-progress.mjs';
export function screeningRowLinksScope(db,u,project,version,row,options={}){return shareHash({actor:u.id,project:screeningProjectSource(db,u.store_id),batch:screeningBatchSource(db,u.store_id,project,options),version,row,links:screeningRowLinksSource(db,version,options)});}
