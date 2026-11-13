import { expect,test } from 'vitest';
import { atRevision } from '../src/server/results/read.js';
import type { Database } from '../src/server/races/records.js';
// A read-only snapshot whose day is at `revision`: all atRevision asks of it.
const at=(revision:number)=>({query:async()=>({rows:[{revision}],rowCount:1})}) as unknown as Database;
test('Reads of a day at one revision share one answer; a new revision, another day or another key reads again',async()=>{
  let reads=0;
  const read=async()=>++reads;
  const day=`day-${Math.random()}`,other=`day-${Math.random()}`;
  expect(await atRevision(at(5),day,'lead',read)).toBe(1);
  expect(await atRevision(at(5),day,'lead',read)).toBe(1);
  expect(await atRevision(at(5),day,'event:R16',read)).toBe(2);
  expect(await atRevision(at(5),other,'lead',read)).toBe(3);
  expect(await atRevision(at(6),day,'lead',read)).toBe(4);
  expect(await atRevision(at(6),day,'lead',read)).toBe(4);
  // A slow snapshot still at the older revision reads for itself and keeps nothing.
  expect(await atRevision(at(5),day,'lead',read)).toBe(5);
  expect(await atRevision(at(6),day,'lead',read)).toBe(4);
});
test('A read that fails is not kept: the next read at the same revision tries again',async()=>{
  const day=`day-${Math.random()}`;
  await expect(atRevision(at(1),day,'lead',async()=>{throw new Error('lost');})).rejects.toThrow('lost');
  expect(await atRevision(at(1),day,'lead',async()=>'read again')).toBe('read again');
});
