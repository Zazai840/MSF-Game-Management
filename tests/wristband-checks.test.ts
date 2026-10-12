import { expect,test } from 'vitest';
import { sectionForWristband,wristbandWarnings } from '../src/shared/wristband-checks.js';
test.each([
  [0,null],[1,'Beavers'],[999,'Beavers'],[1000,'Boy Cubs'],[1999,'Boy Cubs'],
  [2000,'Girl Cubs'],[2999,'Girl Cubs'],[3000,'Boy Scouts'],[3999,'Boy Scouts'],
  [4000,'Girl Scouts'],[4999,'Girl Scouts'],[5000,null],[10000,null]
])('wristband %i belongs to section %s', (number,section)=>{
  expect(sectionForWristband(number)).toBe(section);
});
test('unknown numbers and a number from another section carry plain warnings',()=>{
  expect(wristbandWarnings(0,'Girl Cubs')).toEqual([{kind:'unknown-number',message:'0 is not a known wristband number'}]);
  expect(wristbandWarnings(5000,'Girl Cubs')).toEqual([{kind:'unknown-number',message:'5000 is not a known wristband number'}]);
  expect(wristbandWarnings(3045,'Girl Cubs')).toEqual([{kind:'wrong-section',message:'3045 belongs to Boy Scouts - this race is Girl Cubs'}]);
  expect(wristbandWarnings(2000,'Girl Cubs')).toEqual([]);
});
test.each(['Boy Beavers','Girl Beavers'] as const)('either Beaver section accepts the full Beaver range: %s',section=>{
  expect(wristbandWarnings(1,section)).toEqual([]);
  expect(wristbandWarnings(999,section)).toEqual([]);
});
test('already ran considers other active races and skips pre-filled finals and re-runs',()=>{
  const races=[{id:'this-race',deleted:false,wristbands:[2001]},{id:'deleted-race',deleted:true,wristbands:[2002]},{id:'other-race',deleted:false,wristbands:[2003]}];
  expect(wristbandWarnings(2001,'Girl Cubs',races,{currentRaceId:'this-race'})).toEqual([]);
  expect(wristbandWarnings(2002,'Girl Cubs',races)).toEqual([]);
  expect(wristbandWarnings(2003,'Girl Cubs',races)).toEqual([{kind:'already-ran',message:'2003 already ran in this event'}]);
  expect(wristbandWarnings(2003,'Girl Cubs',races,{skipAlreadyRan:true})).toEqual([]);
});
