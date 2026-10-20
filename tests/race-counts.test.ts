import { expect,test } from 'vitest';
import { notCountedReasons,raceCounts,type CountingRace } from '../src/shared/race-counts.js';
const finish={order:['one','two'],didNotFinish:[]};
const race:CountingRace={kind:'heat',saved:true,finish,times:{places:[1200,1300],outOfOrder:false}};
test('a saved race counts once it has a finishing order and agreeing times in order',()=>{
  expect(notCountedReasons(race)).toEqual([]);expect(raceCounts(race)).toBe(true);
});
test('a race counts only once it is saved, whatever its parts hold',()=>{
  expect(notCountedReasons({...race,saved:false})).toEqual(['in progress']);
  expect(raceCounts({...race,kind:'final',saved:false,times:null})).toBe(false);
});
test('a saved race a lead left without a finishing order does not count',()=>{
  expect(notCountedReasons({...race,finish:null,times:null})).toEqual(['checked in']);
  expect(notCountedReasons({...race,finish:null})).toEqual(['awaiting finishing order']);
});
test('a heat or timed race with missing times does not count, while a final needs only its finishing order',()=>{
  expect(notCountedReasons({...race,times:null})).toEqual(['awaiting times']);
  expect(notCountedReasons({...race,kind:'race',times:null})).toEqual(['awaiting times']);
  expect(raceCounts({...race,kind:'final',times:null})).toBe(true);
});
test('a race where nobody finished needs no times',()=>{
  expect(raceCounts({...race,finish:{order:[],didNotFinish:['one','two']},times:null})).toBe(true);
});
test('kept out-of-order times do not count until a lead accepts them',()=>{
  const outOfOrder={places:[1300,1200],outOfOrder:true};
  expect(notCountedReasons({...race,times:outOfOrder})).toEqual(['times out of order']);
  expect(raceCounts({...race,times:{...outOfOrder,acceptedByLead:true}})).toBe(true);
});
test('a race whose finishers and times disagree does not count',()=>{
  expect(notCountedReasons({...race,finish:{order:['one'],didNotFinish:['two']}})).toEqual(["finishers and times don't agree"]);
  expect(raceCounts({...race,times:{places:[1200,null],outOfOrder:false}})).toBe(false);
});
test('a race with a clash does not count, whatever its parts hold',()=>{
  expect(notCountedReasons({...race,clash:true})).toEqual(['two versions, lead to check']);
  expect(notCountedReasons({...race,kind:'final',saved:false,clash:true,finish:null,times:null})).toEqual(['two versions, lead to check','in progress']);
});
