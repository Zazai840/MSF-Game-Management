import { expect,test } from 'vitest';
import { wrongTimes,wrongTimesBanner } from '../src/shared/wrong-times.js';
import { timesOutOfOrder } from '../src/shared/time-entry.js';
test('a later place faster than the place before it is wrong, with a short reason',()=>{
  expect(wrongTimes([1244,1281,1305,1290,1340])).toEqual([{index:3,fasterThan:2,reason:'Faster than 3rd place'}]);
  expect(wrongTimes([1244,1244,1305])).toEqual([]);
});
test('a place is compared with the last place that has a time, as v1 does',()=>{
  expect(wrongTimes([1300,null,1200])).toEqual([{index:2,fasterThan:0,reason:'Faster than 1st place'}]);
  expect(wrongTimes([1300,1200,1250])).toEqual([{index:1,fasterThan:0,reason:'Faster than 1st place'}]);
  expect(wrongTimes([1300,1400,1200,1100])).toEqual([{index:2,fasterThan:1,reason:'Faster than 2nd place'},{index:3,fasterThan:2,reason:'Faster than 3rd place'}]);
  expect(wrongTimes([null,null])).toEqual([]);
});
test('wrong times agree with the v1 out-of-order check on every case',()=>{
  for(const places of [[1234,1234,1320,null],[1234,1200,null],[null,null],[1300,null,1200],[1,2,3],[3,2,1],[]]) expect(wrongTimes(places).length>0).toBe(timesOutOfOrder(places));
});
test('the banner names the first wrong place and the place it beats',()=>{
  expect(wrongTimesBanner(wrongTimes([1244,1281,1305,1290]))).toBe('The 4th place time is faster than 3rd.');
  expect(wrongTimesBanner(wrongTimes([1300,1400,1200,1100]))).toBe('The 3rd place time is faster than 2nd.');
  expect(wrongTimesBanner([])).toBeNull();
});
