import { expect,test } from 'vitest';
import { finalMark } from '../src/shared/finals.js';
test('a finalist has one mark: Here once in the race, else Absent, else not marked yet',()=>{
  const runners=[{id:'a'},{id:'b'}];
  expect(finalMark({finalEntryId:'a',absent:false},runners)).toBe('here');
  expect(finalMark({finalEntryId:'c',absent:true},runners)).toBe('absent');
  expect(finalMark({finalEntryId:'d',absent:false},runners)).toBeNull();
  // In the race wins: a finalist back in the race is Here whatever was stored before.
  expect(finalMark({finalEntryId:'b',absent:true},runners)).toBe('here');
});
