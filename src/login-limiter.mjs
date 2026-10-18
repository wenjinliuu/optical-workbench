import {performance} from 'node:perf_hooks';

// Preserve the existing 10 attempts / 60 seconds policy. The peer bound is an
// in-process resource guard, not a production capacity or identity decision.
export const LOGIN_WINDOW_MS=60_000;
export const LOGIN_ATTEMPTS=10;
export const LOGIN_PEER_LIMIT=4096;

export function createLoginLimiter({clock=()=>performance.now()}={}) {
  const peers=new Map();
  return {
    consume(peer) {
      const now=clock(),cutoff=now-LOGIN_WINDOW_MS;
      // Reclaim abandoned peers on the next login, even if they never return.
      // No background timer or persistent address/username records are needed.
      for(const [key,times] of peers)if(times.at(-1)<=cutoff)peers.delete(key);
      const recent=(peers.get(peer)||[]).filter(time=>time>cutoff);
      if(recent.length>=LOGIN_ATTEMPTS)return false;
      // Never evict a live bucket to admit a new address: that would let churn
      // discard an attacker's existing limit. Existing buckets can still run.
      if(!peers.has(peer)&&peers.size>=LOGIN_PEER_LIMIT)return false;
      recent.push(now);peers.set(peer,recent);return true;
    },
    get trackedPeers(){return peers.size;}
  };
}
