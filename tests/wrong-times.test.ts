import { expect,test } from 'vitest';
import { wrongTimes,wrongTimesBanner } from '../src/shared/wrong-times.js';
import { timesOutOfOrder } from '../src/shared/time-entry.js';
test('a later place faster than the place before it is wrong, with a short reason',()=>{
  expect(wrongTimes([1244,1281,1305,1290,1340])).toMatchObject([{index:3,reason:'Faster than 3rd place'}]);
  expect(wrongTimes([1244,1244,1305])).toEqual([]);
});
test('a place is compared with the last place that has a time, as v1 does',()=>{
  expect(wrongTimes([1300,null,1200])).toMatchObject([{index:2,reason:'Faster than 1st place'}]);
  expect(wrongTimes([1300,1200,1250])).toMatchObject([{index:1,reason:'Faster than 1st place'}]);
  expect(wrongTimes([1300,1400,1200,1100])).toMatchObject([{index:2,reason:'Faster than 2nd place'},{index:3,reason:'Faster than 3rd place'}]);
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
test('a time slower than 1.5 m/s for the race is wrong, naming the event: above 40.00 for 60m, 2:13.33 for 200m, 4:26.67 for 400m',()=>{
  for(const [event,slowest] of [['60m',4000],['60m Hurdles',4000],['200m',13333],['4x50m Relay',13333],['400m',26667],['4x100m Relay',26667]] as const) {
    expect(wrongTimes([slowest],event)).toEqual([]);
    expect(wrongTimes([slowest+1],event)).toMatchObject([{index:0,reason:`Slow for ${event}`}]);
  }
  expect(wrongTimesBanner(wrongTimes([2400,2500,19022],'200m'))).toBe('The 3rd place time, 3:10.22, looks slow for 200m.');
});
test('a place faster than an earlier place keeps that reason when it is slow too; no slow time without a known distance',()=>{
  expect(wrongTimes([30000,29000],'60m')).toMatchObject([{index:0,reason:'Slow for 60m'},{index:1,reason:'Faster than 1st place'}]);
  expect(wrongTimesBanner(wrongTimes([30000,29000],'60m').slice(1))).toBe('The 2nd place time is faster than 1st.');
  expect(wrongTimes([30000],'Long jump')).toEqual([]);
  expect(wrongTimes([30000])).toEqual([]);
});
