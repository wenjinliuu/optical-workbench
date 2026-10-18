import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {registerScreeningRowFunctions} from './screening-row-links.mjs';
import {registerRegistrationFunctions} from './screening-registrations.mjs';
import {prepareDatabaseFile} from './database-files.mjs';

export function openDatabase(path) {
  prepareDatabaseFile(path);
  const db = new DatabaseSync(path);
  registerScreeningRowFunctions(db);
  registerRegistrationFunctions(db);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const root = fileURLToPath(new URL('../migrations/', import.meta.url));
  for (const name of readdirSync(root).filter(x => x.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name)) continue;
    transaction(db, () => {
      db.exec(readFileSync(`${root}/${name}`, 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name, new Date().toISOString());
    });
  }
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
