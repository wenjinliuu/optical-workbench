import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotKey} from '../preview/snapshot-key.mjs';

test('static snapshot matching removes read proofs and display page sizes',()=>{
  assert.equal(snapshotKey('/api/my-work?expected_source=private-proof&limit=30&offset=0'),'/api/my-work');
  assert.equal(snapshotKey('/api/customers/a?expected_parent_source=proof&payment_limit=20'),'/api/customers/a');
});
test('static snapshots keep meaningful filters, historical versions and later pages distinct',()=>{
  for(const filter of ['q=客户','scope=completed','sort=date_asc','offset=30','version=1','task_state=blocked'])assert.notEqual(snapshotKey('/api/my-work?'+filter),snapshotKey('/api/my-work'));
  assert.notEqual(snapshotKey('/api/customers/a'),snapshotKey('/api/customers/b'));
});
test('snapshot lookup normalizes query ordering without losing repeated filter values',()=>{
  assert.equal(snapshotKey('/api/tasks?role=professional&q=后续'),snapshotKey('/api/tasks?q=%E5%90%8E%E7%BB%AD&role=professional'));
  assert.notEqual(snapshotKey('/api/tasks?role=professional&role=manager'),snapshotKey('/api/tasks?role=manager'));
});
