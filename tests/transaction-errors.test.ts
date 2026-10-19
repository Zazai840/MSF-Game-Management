import { expect,test,vi } from 'vitest';
import type pg from 'pg';
import { raceChange } from '../src/server/races/records.js';
import { resultsSnapshot } from '../src/server/results/read.js';
import { signInTransaction } from '../src/server/access/sign-in.js';
const phone={id:'phone',dayId:'day',name:'Ahmed',level:'Volunteer' as const,profileId:'profile'};
for(const name of ['raceChange','resultsSnapshot','signInTransaction'] as const) {
  for(const rollbackFails of [false,true]) test(`${name} preserves the original error (rollback failure: ${rollbackFails})`,async()=>{
    const original=new Error('transaction failed'),rollback=new Error('rollback failed');
    const query=vi.fn(async(sql:string)=>{
      if(sql==='ROLLBACK' && rollbackFails) throw rollback;
      return {rows:[{id:'day'}],rowCount:1};
    });
    const release=vi.fn(),client={query,release} as unknown as pg.PoolClient;
    const pool={connect:async()=>client} as unknown as pg.Pool;
    const fail=async()=>{throw original;};
    const result=name==='raceChange'?raceChange(pool,phone,fail):name==='resultsSnapshot'?resultsSnapshot(pool,phone.dayId,fail):signInTransaction(pool,fail);
    await expect(result).rejects.toBe(original);
    expect(query.mock.calls.some(([sql])=>sql==='ROLLBACK')).toBe(true);
    expect(release).toHaveBeenCalledExactlyOnceWith(name==='signInTransaction'?(rollbackFails?rollback:undefined):original);
  });
  test(`${name} releases successful transactions without an error`,async()=>{
    const query=vi.fn(async()=>({rows:[{id:'day'}],rowCount:1}));
    const release=vi.fn(),client={query,release} as unknown as pg.PoolClient;
    const pool={connect:async()=>client} as unknown as pg.Pool;
    const result=name==='raceChange'?raceChange(pool,phone,async()=>42):name==='resultsSnapshot'?resultsSnapshot(pool,phone.dayId,async()=>42):signInTransaction(pool,async()=>42);
    expect(await result).toBe(42);
    expect(release).toHaveBeenCalledExactlyOnceWith(undefined);
  });
}
