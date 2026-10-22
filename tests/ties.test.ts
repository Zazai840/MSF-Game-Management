import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
import type { TieSettlement } from '../src/shared/ties.js';
const heats={code:'R4',name:'60m',section:'Girl Cubs' as const,format:'heats' as const};
function races(times:number[]):ResultsRace[] {
  return times.map((time,index)=>({id:`race${index+1}`,kind:'heat',number:index+1,deleted:false,saved:true,checkedInAt:'2026-10-12T10:00:00Z',runners:[{id:`entry${index+1}`,wristband:2001+index}],finish:{order:[`entry${index+1}`],didNotFinish:[]},times:{places:[time],outOfOrder:false}}));
}
test('equal times across heats open a tie for every member when it touches the top eight',()=>{
  const result=eventResults({event:heats,races:races([900,1000,1100,1200,1300,1400,1500,1600,1600])});
  expect(result.ties.map(tie=>({time:tie.time,numbers:tie.entries.map(entry=>entry.wristband)}))).toEqual([{time:1600,numbers:[2008,2009]}]);
  expect(result.leaderboard.filter(row=>row.flags.some(flag=>flag.kind==='tie')).map(row=>row.wristband)).toEqual([2008,2009]);
  expect(result.needsYou).toMatchObject([{kind:'tie'}]);
});
test('same-race equal times and ties wholly outside the highlighted band never need settlement',()=>{
  const same=races([1000])[0];
  same.runners=[...same.runners,{id:'other',wristband:2010}];
  same.finish={order:['entry1','other'],didNotFinish:[]};same.times={places:[1000,1000],outOfOrder:false};
  expect(eventResults({event:heats,races:[same]}).ties).toEqual([]);
  expect(eventResults({event:heats,races:[same]}).leaderboard.map(row=>row.wristband)).toEqual([2001,2010]);
  expect(eventResults({event:heats,races:races([900,1000,1100,1200,1300,1400,1500,1600,1700,1700])}).ties).toEqual([]);
  expect(eventResults({event:{...heats,format:'timed'},races:races([900,1000,1100,1200,1300,1400,1500,1500])}).ties).toEqual([]);
});
test('a new race reopens a No run-off needed tie when its decision impact changes and cannot inherit an older member settlement',()=>{
  const state={event:heats,races:races([900,1000,1100,1200,1300,1300])};
  const tie=eventResults(state).ties[0];
  const tieSettlements:TieSettlement[]=[{tieId:tie.id,outcome:'no-run-off',order:tie.entries,impact:tie.impact}];
  const faster=races([800])[0];faster.id='new-race';faster.runners=[{id:'new-entry',wristband:2099}];faster.finish={order:['new-entry'],didNotFinish:[]};
  expect(eventResults({...state,races:[...state.races,faster],tieSettlements}).ties).toHaveLength(1);
  faster.times={places:[1300],outOfOrder:false};
  expect(eventResults({...state,races:[...state.races,faster],tieSettlements}).ties[0].entries.map(entry=>entry.wristband).sort((left,right)=>left-right)).toEqual([2005,2006,2099]);
  const timed={event:{...heats,format:'timed' as const},races:races([900,1000,1000])};
  const medalTie=eventResults(timed).ties[0];
  faster.times={places:[800],outOfOrder:false};
  expect(eventResults({...timed,races:[...timed.races,faster],tieSettlements:[{tieId:medalTie.id,outcome:'no-run-off',order:medalTie.entries,impact:medalTie.impact}]}).ties).toHaveLength(1);
});
test('No run-off needed is reconsidered when a disqualification moves a tie across the qualifying or medal line',()=>{
  for(const scenario of [
    {event:heats,times:[900,1000,1100,1200,1300,1400,1500,1500]},
    {event:{...heats,code:'R16',format:'timed' as const},times:[900,1000,1100,1200,1200]}
  ]) {
    const state={event:scenario.event,races:races(scenario.times)};
    const tie=eventResults(state).ties[0];
    const tieSettlements:TieSettlement[]=[{tieId:tie.id,outcome:'no-run-off',order:tie.entries,impact:tie.impact}];
    expect(eventResults({...state,tieSettlements}).ties).toEqual([]);
    const changed=eventResults({...state,tieSettlements,rulings:[{raceId:'race1',entryId:'entry1',disqualification:{reason:'Obstruction',comment:null}}]});
    expect(changed.ties).toHaveLength(1);
    expect(changed.leaderboard.filter(row=>row.flags.some(flag=>flag.kind==='tie'))).toHaveLength(2);
  }
});
test('a run-off orders tied entries before qualifiers and keeps the original times',()=>{
  const state={event:heats,races:races([900,1000,1100,1200,1300,1400,1400])};
  const tie=eventResults(state).ties[0];
  const settlement:TieSettlement={tieId:tie.id,outcome:'run-off',order:[...tie.entries].reverse(),impact:tie.impact};
  const result=eventResults({...state,tieSettlements:[settlement]});
  expect(result.ties).toEqual([]);
  expect(result.qualifiers.map(row=>row.wristband)).toEqual([2001,2002,2003,2004,2005,2007]);
  expect(result.leaderboard.slice(5).map(row=>[row.wristband,row.time,row.position])).toEqual([[2007,1400,6],[2006,1400,7]]);
  expect(result.leaderboard.slice(5).every(row=>row.flags.some(flag=>flag.kind==='tie-settled'))).toBe(true);
});

test('a mixed cross-race tie keeps equal finishers from one race in their finishing order',()=>{
  const state={event:heats,races:races([1000,1000])};
  state.races[0].runners=[{id:'entry1',wristband:2001},{id:'same-race-second',wristband:2003}];
  state.races[0].finish={order:['entry1','same-race-second'],didNotFinish:[]};
  state.races[0].times={places:[1000,1000],outOfOrder:false};
  const tie=eventResults(state).ties[0];
  const reversed:TieSettlement={tieId:tie.id,outcome:'run-off',order:[...tie.entries].reverse(),impact:tie.impact};
  const invalid=eventResults({...state,tieSettlements:[reversed]});
  expect(invalid.ties).toHaveLength(1);
  expect(invalid.leaderboard.map(row=>row.wristband)).toEqual([2001,2003,2002]);
  const valid=eventResults({...state,tieSettlements:[{...reversed,order:[tie.entries[2],tie.entries[0],tie.entries[1]]}]});
  expect(valid.ties).toEqual([]);
  expect(valid.leaderboard.map(row=>row.wristband)).toEqual([2002,2001,2003]);
});

test('tie settlements preserve checked warnings and omit entries chosen as not counted',()=>{
  const state={event:heats,races:races([1000,1000,1000])};
  const warning={kind:'wrong-section' as const,message:'2001 belongs to Boy Cubs - this race is Girl Cubs',kept:true};
  state.races[0].runners[0].warnings=[warning];
  const rulings=[
    {raceId:'race1',entryId:'entry1',disqualification:null,warningChecks:[warning]},
    {raceId:'race3',entryId:'entry3',disqualification:null,notCounted:true}
  ];
  const tie=eventResults({...state,rulings}).ties[0];
  expect(tie.entries.map(entry=>entry.entryId)).toEqual(['entry1','entry2']);
  const result=eventResults({...state,rulings,tieSettlements:[{tieId:tie.id,outcome:'run-off',order:[...tie.entries].reverse(),impact:tie.impact}]});
  expect(result.ties).toEqual([]);
  expect(result.qualifiers.map(row=>row.entryId)).toEqual(['entry2','entry1']);
  expect(result.leaderboard[1].flags).toContainEqual({kind:'warning',warningKind:'wrong-section',checked:true,message:warning.message});
  expect(result.leaderboard[1].flags).toContainEqual({kind:'tie-settled',message:'Tie settled'});
  expect(result.leaderboard[2]).toMatchObject({entryId:'entry3',status:'Not counted',position:null,qualification:null,highlighted:false,flags:[]});
});
