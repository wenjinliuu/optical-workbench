import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRuntime} from '../src/runtime.mjs';
import {routeName} from '../public/operations.js';

function record(runtime, url, {store='a',status=404,aborted=false}={}) {
  const res=new EventEmitter();res.setHeader=()=>{};res.statusCode=status;res.writableFinished=!aborted;
  const request=runtime.begin({url,method:'GET'},res);request.setStore(store);request.setError('NOT_FOUND');
  res.emit(aborted?'close':'finish');res.emit('close');return runtime.snapshot(store);
}

test('new collaboration faults retain fixed operation labels without IDs, rows, query or credentials',()=>{
  const events=[],runtime=createRuntime({logger:event=>events.push(event)});
  for(const [url,label] of [
    ['/api/my-work?q=PRIVATE_QUERY','/api/my-work'],
    ['/api/my-work/authorization?expected_source=PRIVATE_SOURCE','/api/my-work/authorization'],
    ['/api/my-work/completed/PRIVATE_TASK/followups/authorization','/api/my-work/completed/:id/followups/authorization'],
    ['/api/screening-import/preview','/api/screening-import/preview'],
    ['/api/screening-projects/context','/api/screening-projects/context'],
    ['/api/screening-projects/PRIVATE_PROJECT','/api/screening-projects/:id'],
    ['/api/screening-batches/PRIVATE_PROJECT/authorization','/api/screening-batches/:id/authorization'],
    ['/api/screening-batches/PRIVATE_PROJECT/PRIVATE_VERSION','/api/screening-batches/:id/:version'],
    ['/api/screening-batch-work/PRIVATE_PROJECT/PRIVATE_VERSION/authorization','/api/screening-batch-work/:id/:version/authorization'],
    ['/api/screening-row-links/PRIVATE_PROJECT/PRIVATE_VERSION/678901/customers','/api/screening-row-links/:id/:version/:row/customers'],
    ['/api/screening-registrations/PRIVATE_PROJECT/PRIVATE_VERSION/678901/review','/api/screening-registrations/:id/:version/:row/review'],
    ['/api/staff-handover/employees/PRIVATE_EMPLOYEE/responsibilities','/api/staff-handover/employees/:id/responsibilities'],
    ['/api/staff-records/employees/PRIVATE_EMPLOYEE','/api/staff-records/employees/:id'],
    ['/api/staff-records/PRIVATE_RECORD/versions','/api/staff-records/:id/versions'],
    ['/api/staff-cover/absence/PRIVATE_ABSENCE/candidates','/api/staff-cover/absence/:id/candidates'],
    ['/api/staff-cover/PRIVATE_ARRANGEMENT/events','/api/staff-cover/:id/events']
  ]){record(runtime,url);assert.equal(events.at(-1).route,label);}
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_|678901/);
  assert.equal(events.length,16);
});

test('unrecognized or malformed collaboration paths remain anonymous and static assets stay excluded',()=>{
  const events=[],runtime=createRuntime({logger:event=>events.push(event)});
  for(const url of ['/api/my-work/PRIVATE_UNKNOWN','/api/my-work-extra/PRIVATE_UNKNOWN',
    '/api/screening-row-links/PRIVATE_PROJECT/PRIVATE_VERSION/not-a-row',
    '/api/screening-registrations/p/v/1/PRIVATE_UNKNOWN','/api/staff-cover/a/events/PRIVATE_UNKNOWN',
    '/api/screening-projects/%3CPRIVATE_HTML%3E','/api/screening-projects/a//b']){
    record(runtime,url);assert.equal(events.at(-1).route,'/api/unknown');
  }
  record(runtime,'/operations.js?PRIVATE_QUERY');assert.equal(events.length,7);
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_|not-a-row/);
});

test('new labels retain store isolation, bounded fault windows and single aborted-request accounting',()=>{
  const runtime=createRuntime({logger:()=>{throw Error('PRIVATE_LOGGER_FAILURE');}});
  record(runtime,'/api/my-work/authorization',{aborted:true});
  for(let i=0;i<205;i++)record(runtime,`/api/screening-projects/PRIVATE_${i}`,{store:'b'});
  const a=runtime.snapshot('a'),b=runtime.snapshot('b');
  assert.equal(a.requests,1);assert.equal(a.aborted,1);assert.equal(a.errors.length,1);
  assert.equal(a.errors[0].status,499);assert.equal(a.errors[0].route,'/api/my-work/authorization');
  assert.equal(b.requests,205);assert.equal(b.window_size,200);assert.equal(b.errors.length,20);
  assert.ok(b.errors.every(e=>e.route==='/api/screening-projects/:id'&&!('store_id' in e)));
});

test('operations gives the three collaboration areas recognizable plain-language names',()=>{
  assert.equal(routeName('/api/my-work/completed/:id/followups'),'本人工作台');
  assert.equal(routeName('/api/screening-row-links/:id/:version/:row/authorization'),'团体筛查与名单');
  assert.equal(routeName('/api/staff-cover/:id/events'),'员工责任与交接');
  assert.equal(routeName('/api/unknown'),'工作台请求');
});
