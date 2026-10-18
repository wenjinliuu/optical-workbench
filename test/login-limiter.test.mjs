import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoginLimiter,LOGIN_PEER_LIMIT} from '../src/login-limiter.mjs';

test('login keeps the original ten-attempt sliding window and denials do not extend it',()=>{
  let now=0;const limiter=createLoginLimiter({clock:()=>now});
  for(let i=0;i<10;i++){now=i*1000;assert.equal(limiter.consume('synthetic-a'),true);}
  now=59_999;assert.equal(limiter.consume('synthetic-a'),false);
  now=60_000;assert.equal(limiter.consume('synthetic-a'),true);
  now=60_001;assert.equal(limiter.consume('synthetic-a'),false);
  now=61_000;assert.equal(limiter.consume('synthetic-a'),true);
  assert.equal(limiter.trackedPeers,1);
});

test('abandoned peer records expire without requiring those addresses to return',()=>{
  let now=0;const limiter=createLoginLimiter({clock:()=>now});
  for(let i=0;i<2048;i++)assert.equal(limiter.consume('synthetic-'+i),true);
  assert.equal(limiter.trackedPeers,2048);
  now=60_000;assert.equal(limiter.consume('new-synthetic'),true);
  assert.equal(limiter.trackedPeers,1);
});

test('peer churn stays bounded, cannot evict live limits, and releases capacity after expiry',()=>{
  let now=0;const limiter=createLoginLimiter({clock:()=>now});
  for(let i=0;i<10;i++)assert.equal(limiter.consume('blocked-peer'),true);
  for(let i=1;i<LOGIN_PEER_LIMIT;i++)assert.equal(limiter.consume('synthetic-'+i),true);
  for(let i=0;i<200;i++)assert.equal(limiter.consume('overflow-'+i),false);
  assert.equal(limiter.trackedPeers,4096);
  assert.equal(limiter.consume('blocked-peer'),false);
  assert.equal(limiter.consume('synthetic-1'),true,'active peers with remaining allowance work at capacity');
  now=60_000;assert.equal(limiter.consume('overflow-0'),true);
  assert.equal(limiter.trackedPeers,1);
});

test('login budgets are owned by each application instance',()=>{
  const a=createLoginLimiter({clock:()=>0}),b=createLoginLimiter({clock:()=>0});
  for(let i=0;i<10;i++)assert.equal(a.consume('same-peer'),true);
  assert.equal(a.consume('same-peer'),false);assert.equal(b.consume('same-peer'),true);
  assert.equal(a.trackedPeers,1);assert.equal(b.trackedPeers,1);
});

test('wall-clock changes cannot reset or extend the monotonic login budget',()=>{
  const limiter=createLoginLimiter(),original=Date.now;
  try{
    for(let i=0;i<10;i++)assert.equal(limiter.consume('same-peer'),true);
    Date.now=()=>0;assert.equal(limiter.consume('same-peer'),false);
    Date.now=()=>Number.MAX_SAFE_INTEGER;assert.equal(limiter.consume('same-peer'),false);
    assert.equal(limiter.consume('other-peer'),true);
  }finally{Date.now=original;}
});
