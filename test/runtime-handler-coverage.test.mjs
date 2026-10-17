import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createRuntime} from '../src/runtime.mjs';

const handlerSamples={
  organization:'/api/organization',dispatch:'/api/dispatch/receipts',inventorySources:'/api/inventory/products/p/sources',
  supplierReturns:'/api/supplier-returns',batches:'/api/inventory/products/p/batch-sources',moneyReview:'/api/money-review',
  requestNotifications:'/api/family-request-notifications/staff/r',screeningWork:'/api/screening-batch-work/p/v',
  screeningBatches:'/api/screening-batches/p',screeningRowLinks:'/api/screening-row-links/p/v/1',
  screeningRegistrations:'/api/screening-registrations/p/v/1',screeningProjects:'/api/screening-projects',
  screeningImport:'/api/screening-import/preview',familyNotifications:'/api/family-notifications/staff/c/g',
  familyCommunication:'/api/family-communication/context/c',familyChanges:'/api/family-changes/publications/p/options',
  familyOffers:'/api/family-offers',familyBookings:'/api/family-bookings',familyRequests:'/api/family-requests',
  familyProgress:'/api/family-progress',expenses:'/api/expenses',channelReview:'/api/channel-review',
  staffCover:'/api/staff-cover/a',staffRecords:'/api/staff-records/r',staffHandover:'/api/staff-handover/employees',
  myWork:'/api/my-work',reservedBatches:'/api/inventory/reservations/r/lines/1/batch-sources',
  reserved:'/api/inventory-reserved/r',custody:'/api/inventory-custody/r',extraReturns:'/api/purchase-extra-returns',
  purchaseQuality:'/api/purchase-quality',receiving:'/api/purchase-receipts',procurement:'/api/suppliers',
  specialtyContinuity:'/api/specialty-continuity/cases/c',specialtyReview:'/api/specialty-reviews',
  specialtyCare:'/api/specialty-care',specialtyTrace:'/api/specialty-orders',specialty:'/api/specialty/protocols',
  referrals:'/api/referrals/records',contacts:'/api/contacts/cases',longitudinal:'/api/longitudinal/cases',
  familyTraining:'/api/family-training/practices',scheduling:'/api/scheduling/resources',
  entitlements:'/api/entitlements/packages',training:'/api/training/projects',parameters:'/api/parameters',
  refunds:'/api/refunds',dispositions:'/api/aftercare/cases/c/dispositions',
  replacements:'/api/aftercare/cases/c/replacements',aftercareWork:'/api/aftercare/cases/c/work',
  aftercare:'/api/aftercare/cases',fulfillment:'/api/fulfillment/jobs',processing:'/api/processing/jobs',
  payments:'/api/payments',inventory:'/api/inventory/products',retail:'/api/retail/products',
  documents:'/api/customers/c/documents',cycleRecords:'/api/cycles/c',taskEvidence:'/api/tasks/t/completion',
  tasks:'/api/tasks',timeline:'/api/customers/c/timeline',profiles:'/api/customers/c/profile'
};

function route(path){
  const events=[],runtime=createRuntime({logger:e=>events.push(e)}),res=new EventEmitter();
  res.setHeader=()=>{};res.statusCode=404;res.writableFinished=true;
  const request=runtime.begin({url:path,method:'GET'},res);request.setStore('a');request.setError('NOT_FOUND');res.emit('finish');
  return events[0].route;
}

test('every registered business handler has an explicit sanitized runtime route sample',()=>{
  const source=readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
  const registered=[...source.matchAll(/(?:if\(|\|\|)await ([A-Za-z][A-Za-z0-9]*)(?:\.handle)?\(/g)].map(x=>x[1]);
  registered.push('timeline');
  assert.deepEqual([...new Set(registered)].sort(),Object.keys(handlerSamples).sort());
  for(const [handler,path] of Object.entries(handlerSamples))assert.notEqual(route(path),'/api/unknown',handler+' '+path);
});

