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

test('family faults use nine fixed diagnostic areas without customer, guardian, record or version identities',()=>{
  const events=[],runtime=createRuntime({logger:event=>events.push(event)});
  for(const [url,label] of [
    ['/api/family-progress/family/PRIVATE_CUSTOMER/publications/PRIVATE_VERSION?expected_authorization=PRIVATE_SOURCE','/api/family-progress/:scope'],
    ['/api/family-requests/family/PRIVATE_CUSTOMER/PRIVATE_REQUEST/events','/api/family-requests/:scope'],
    ['/api/family-offers/selections/PRIVATE_SELECTION/admit','/api/family-offers/:scope'],
    ['/api/family-bookings/PRIVATE_BOOKING/versions','/api/family-bookings/:scope'],
    ['/api/family-changes/publications/PRIVATE_PUBLICATION/context?offer_id=PRIVATE_OFFER','/api/family-changes/:scope'],
    ['/api/family-communication/family/PRIVATE_CUSTOMER/PRIVATE_GUARDIAN/actions/PRIVATE_ACTION','/api/family-communication/:scope'],
    ['/api/family-notifications/family/PRIVATE_CUSTOMER/PRIVATE_GUARDIAN/PRIVATE_NOTICE/read/PRIVATE_VERSION','/api/family-notifications/:scope'],
    ['/api/family-notifications/staff/PRIVATE_CUSTOMER/PRIVATE_GUARDIAN/sources','/api/family-notifications/:scope/sources'],
    ['/api/family-training/practices/PRIVATE_PRACTICE/reports','/api/family-training/:scope']
  ]){record(runtime,url);assert.equal(events.at(-1).route,label);}
  assert.equal(events.length,9);
  assert.doesNotMatch(JSON.stringify(events),/PRIVATE_|expected_authorization|offer_id/);
});

test('all current family handler shapes map to fixed templates and malformed extensions stay unknown',()=>{
  const events=[],runtime=createRuntime({logger:event=>events.push(event)});
  for(const url of ['/api/family-progress/family-authorization','/api/family-progress/customers/c/options',
    '/api/family-requests/r/events','/api/family-offers/customers/c/source','/api/family-bookings/requests/r/options',
    '/api/family-changes/requests/r/authorization','/api/family-communication/context/c',
    '/api/family-notifications/staff/c/g/authorization','/api/family-training/reports/r/reviews',
    '/api/customers/c/family-training'])record(runtime,url);
  assert.ok(events.every(e=>e.route!=='/api/unknown'));
  for(const url of ['/api/family-progress/family/c/publications/v/private','/api/family-requests/family/c/r/events/private',
    '/api/family-offers/selections/s/admit/private','/api/family-notifications/family/c/g/n/read/v/private',
    '/api/family-training/practices/p/reports/private']){record(runtime,url);assert.equal(events.at(-1).route,'/api/unknown');}
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

test('family labels retain store isolation, bounded windows and one interrupted request',()=>{
  const runtime=createRuntime({logger:()=>{throw Error('PRIVATE_LOGGER_FAILURE');}});
  record(runtime,'/api/family-training/practices/PRIVATE_PRACTICE',{aborted:true});
  for(let i=0;i<205;i++)record(runtime,`/api/family-requests/family/PRIVATE_CUSTOMER/PRIVATE_${i}`,{store:'b'});
  const a=runtime.snapshot('a'),b=runtime.snapshot('b');
  assert.equal(a.requests,1);assert.equal(a.aborted,1);assert.equal(a.errors.length,1);
  assert.equal(a.errors[0].route,'/api/family-training/:scope');
  assert.equal(b.requests,205);assert.equal(b.window_size,200);assert.equal(b.errors.length,20);
  assert.ok(b.errors.every(e=>e.route==='/api/family-requests/:scope'&&!('store_id' in e)));
});

test('operations gives the three collaboration areas recognizable plain-language names',()=>{
  assert.equal(routeName('/api/my-work/completed/:id/followups'),'本人工作台');
  assert.equal(routeName('/api/screening-row-links/:id/:version/:row/authorization'),'团体筛查与名单');
  assert.equal(routeName('/api/staff-cover/:id/events'),'员工责任与交接');
  assert.equal(routeName('/api/family-progress/:scope'),'家庭发布与进度');
  assert.equal(routeName('/api/family-requests/:scope'),'家庭申请与回复');
  assert.equal(routeName('/api/family-offers/:scope'),'家庭时段选择');
  assert.equal(routeName('/api/family-bookings/:scope'),'家庭预约办理');
  assert.equal(routeName('/api/family-changes/:scope'),'家庭请假与调课');
  assert.equal(routeName('/api/family-communication/:scope'),'家庭偏好与说明');
  assert.equal(routeName('/api/family-notifications/:scope'),'家庭通知与回执');
  assert.equal(routeName('/api/family-notifications/:scope/sources'),'申请通知追溯');
  assert.equal(routeName('/api/family-training/:scope'),'家庭练习与复评');
  assert.equal(routeName('/api/unknown'),'工作台请求');
});
