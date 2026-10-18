import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/checks.yml',import.meta.url),'utf8');

function jobBlock(name,nextName) {
  const start=workflow.indexOf(`  ${name}:`);
  const end=nextName?workflow.indexOf(`  ${nextName}:`,start+1):workflow.length;
  assert.notEqual(start,-1,`${name} job must exist`);
  assert.ok(end>start,`${name} job must have a bounded block`);
  return workflow.slice(start,end);
}

test('foundation workflow listens to both push and pull request events',()=>{
  assert.match(workflow,/^on: \[push, pull_request\]$/m);
});

test('my-work browser regression always runs for pull requests and stays marker-gated for pushes',()=>{
  const block=jobBlock('browser-v079','browser-operations');
  assert.match(block,/if: github\.event_name == 'pull_request' \|\| contains\(github\.event\.head_commit\.message, '\[browser-v079\]'\)/);
  assert.match(block,/npm run test:my-work-task-state-browser/);
  assert.doesNotMatch(block,/if: contains\(github\.event\.head_commit\.message/);
});

test('operations browser regression always runs for pull requests and stays marker-gated for pushes',()=>{
  const block=jobBlock('browser-operations');
  assert.match(block,/if: github\.event_name == 'pull_request' \|\| contains\(github\.event\.head_commit\.message, '\[browser-operations\]'\)/);
  assert.match(block,/npm run test:operations-browser/);
  assert.doesNotMatch(block,/if: contains\(github\.event\.head_commit\.message/);
});
