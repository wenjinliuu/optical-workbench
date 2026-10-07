import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../src/db.mjs';
mkdirSync('backups',{recursive:true});const target=resolve(`backups/workbench-${Date.now()}.sqlite`);
const db=openDatabase(process.env.DATABASE_PATH||'data/workbench.sqlite');
db.prepare('VACUUM INTO ?').run(target);db.close();console.log(`Consistent SQLite backup: ${target}`);
