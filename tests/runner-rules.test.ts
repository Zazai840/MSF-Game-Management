import { expect,test } from 'vitest';
import { eventResults,type EventState } from '../src/shared/results-rules.js';
const state:EventState={event:{code:'R4',name:'60m',section:'Girl Cubs',format:'heats'},races:[
  {id:'heat1',kind:'heat',number:1,checkedInAt:'2026-10-12T10:00:00Z',deleted:false,runners:[{id:'a',wristband:2001},{id:'b',wristband:3045,warnings:[{kind:'wrong-section',message:'3045 belongs to Boy Scouts - this race is Girl Cubs',kept:true}]}],finish:{order:['a','b'],didNotFinish:[]},times:{places:[1100,1200],outOfOrder:false}},
  {id:'heat2',kind:'heat',number:2,checkedInAt:'2026-10-12T10:01:00Z',deleted:false,runners:[{id:'c',wristband:2001,warnings:[{kind:'already-ran',message:'2001 already ran in this event',kept:true}]}],finish:{order:['c'],didNotFinish:[]},times:{places:[1300],outOfOrder:false}}
]};
test('checked eligibility warnings keep their words and the runner keeps their ranking',()=>{
  const results=eventResults({...state,rulings:[{raceId:'heat1',entryId:'b',disqualification:null,warningChecks:[{kind:'wrong-section',message:'3045 belongs to Boy Scouts - this race is Girl Cubs'}]}]});
  expect(results.leaderboard[1]).toMatchObject({wristband:3045,position:2,qualification:'Q',flags:[{kind:'warning',warningKind:'wrong-section',checked:true,message:'3045 belongs to Boy Scouts - this race is Girl Cubs'}]});
});
test('choosing a counted result excludes the other and clears ran-twice; historical already-ran stays grey',()=>{
  const results=eventResults({...state,rulings:[{raceId:'heat2',entryId:'c',disqualification:null,notCounted:true}]});
  expect(results.qualifiers.map(row=>row.entryId)).toEqual(['a','b']);
  expect(results.leaderboard[2]).toMatchObject({entryId:'c',status:'Not counted',position:null,qualification:null,highlighted:false,notCounted:true,flags:[{kind:'warning',warningKind:'already-ran',checked:true}]});
  expect(results.leaderboard.flatMap(row=>row.flags).some(flag=>flag.kind==='ran-twice')).toBe(false);
});
