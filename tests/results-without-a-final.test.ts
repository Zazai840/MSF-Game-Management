import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
import { eventState } from '../src/shared/event-state.js';
import type { TeamEntry } from '../src/shared/races.js';
const event={code:'R4',name:'60m',section:'Girl Cubs' as const,format:'heats' as const};
/** One heat per list of times, its runners numbered 2001, 2002... in heat 1, 2011... in heat 2, finishing in that order. */
const heat=(number:number,times:number[]):ResultsRace=>({id:`heat${number}`,kind:'heat',number,checkedInAt:'2026-10-12T10:00:00Z',deleted:false,saved:true,
  runners:times.map((_time,index)=>({id:`h${number}-${index+1}`,wristband:2000+(number-1)*10+index+1})),finish:{order:times.map((_time,index)=>`h${number}-${index+1}`),didNotFinish:[]},times:{places:times,outOfOrder:false}});
test('Results without a final awards medals to the 3 fastest times across the heats',()=>{
  const result=eventResults({event,races:[heat(1,[920,980,1040]),heat(2,[935,1010])]});
  expect(result.noFinalCheckSheet).toMatchObject({stage:'no-final',label:'Results without a final',completed:false,mustSettleFirst:[],worthALook:[]});
  expect(result.noFinalCheckSheet?.creates.map(place=>[place.position,place.wristband])).toEqual([[1,2001],[2,2011],[3,2002]]);
});
test('Results without a final is offered only on a heats event with a ranked heat',()=>{
  expect(eventResults({event,races:[]}).noFinalCheckSheet).toBeNull();
  expect(eventResults({event:{...event,format:'timed'},races:[{...heat(1,[920]),kind:'race'}]}).noFinalCheckSheet).toBeNull();
});
test('an unsettled tie in the top 6 blocks it, while one wholly outside the top 6 does not',()=>{
  const tied=eventResults({event,races:[heat(1,[900,1000,1100,1200]),heat(2,[950,1050,1150,1200])]});
  expect(tied.ties).toHaveLength(1);
  expect(tied.noFinalCheckSheet?.mustSettleFirst).toEqual([]);
  const top=eventResults({event,races:[heat(1,[900,1000,1100]),heat(2,[950,1000])]});
  expect(top.noFinalCheckSheet?.mustSettleFirst).toMatchObject([{kind:'tie',tieId:top.ties[0].id,message:'Tie: 2002, 2012'}]);
});
test('a tie for 3rd settled No run-off needed for qualifying comes back, and settling it against medals clears it',()=>{
  const races=[heat(1,[900,980,1040]),heat(2,[935,980,1060])];
  const tie=eventResults({event,races}).ties[0];
  const qualifying=eventResults({event,races,tieSettlements:[{tieId:tie.id,outcome:'no-run-off',order:tie.entries,impact:tie.impact}]});
  expect(qualifying.ties).toEqual([]);
  expect(qualifying.heatsCheckSheet?.mustSettleFirst).toEqual([]);
  expect(qualifying.noFinalTies).toMatchObject([{id:tie.id,impact:'medals:3'}]);
  expect(qualifying.noFinalCheckSheet?.mustSettleFirst).toMatchObject([{kind:'tie',tieId:tie.id}]);
  const medals=qualifying.noFinalTies[0];
  const settled=eventResults({event,races,tieSettlements:[{tieId:medals.id,outcome:'decided',order:[...medals.entries].reverse(),impact:medals.impact}]});
  expect(settled.noFinalTies).toEqual([]);
  expect(settled.noFinalCheckSheet?.mustSettleFirst).toEqual([]);
  expect(settled.noFinalCheckSheet?.creates.map(place=>place.wristband)).toEqual([2001,2011,2012]);
});
test('a heat in progress, a heat not ranked yet and a ran-twice row in the top 6 block it; open warnings are worth a look',()=>{
  const open=heat(3,[]);open.saved=false;open.runners=[{id:'h3-1',wristband:2021}];open.finish=null;open.times=null;
  expect(eventResults({event,races:[heat(1,[900]),open]}).noFinalCheckSheet?.mustSettleFirst.map(item=>item.message)).toEqual(['Heat 3 is in progress (1 checked in) - submit it or delete it']);
  const untimed=heat(2,[1000]);untimed.times=null;
  expect(eventResults({event,races:[heat(1,[900]),untimed]}).noFinalCheckSheet?.mustSettleFirst).toMatchObject([{kind:'incomplete',raceId:'heat2'}]);
  const again=(time:number)=>{const race=heat(2,[time]);race.runners=[{id:'h2-1',wristband:2001}];return race;};
  expect(eventResults({event,races:[heat(1,[900]),again(1000)]}).noFinalCheckSheet?.mustSettleFirst).toMatchObject([{kind:'ran-twice',raceId:'heat1'},{kind:'ran-twice',raceId:'heat2'}]);
  // Seventh is still in the heats' band of 8, but outside the medals' band of 6.
  expect(eventResults({event,races:[heat(1,[900,910,920,930,940,950]),again(1300)]}).noFinalCheckSheet?.mustSettleFirst).toMatchObject([{kind:'ran-twice',raceId:'heat1'}]);
  const warned=heat(1,[900]);warned.runners=[{id:'h1-1',wristband:2001,warnings:[{kind:'wrong-section',message:'Wrong section',kept:true}]}];
  expect(eventResults({event,races:[warned]}).noFinalCheckSheet).toMatchObject({mustSettleFirst:[],worthALook:[{kind:'warning',raceId:'heat1',entryId:'h1-1'}]});
});
test('once decided without a final the heats read as a timed event: medal line, medal marks, done, and the top 3 for Input - Running',()=>{
  const result=eventResults({event,races:[heat(1,[900,1000,1100,1200]),heat(2,[950,1050,1150,1250])],completedStages:['no-final']});
  expect(result).toMatchObject({decidedWithoutFinal:true,status:'Complete',provisional:false,band:{highlightCount:6,lineAfter:3,lineLabel:'Medal line'},noFinalCheckSheet:null,heatsCheckSheet:null,finalResults:null,qualifiers:[],
    checkSheet:{stage:'no-final',label:'Results without a final',completed:true},inputRunning:{eventCode:'R4',first:2001,second:2011,third:2002}});
  expect(result.leaderboard.map(row=>[row.wristband,row.medalPlace,row.qualification,row.highlighted])).toEqual([[2001,1,null,true],[2011,2,null,true],[2002,3,null,true],[2012,null,null,true],[2003,null,null,true],[2013,null,null,true],[2004,null,null,false],[2014,null,null,false]]);
  expect(result.medalPlaces.map(row=>row.wristband)).toEqual([2001,2011,2002]);
  expect(eventState({status:result.status,raceCount:result.raceCount,format:'heats',decidedWithoutFinal:result.decidedWithoutFinal})).toEqual({state:'done',label:'Done',line:'Done · medals decided, no final'});
});
test('a relay decided without a final names its 3 fastest heat teams with their four children',()=>{
  const team=(id:string,number:number):TeamEntry=>({id,team:{id:`team-${number}`,number},legs:[1,2,3,4].map(leg=>({wristband:2000+number*100+leg,warnings:[],here:true}))});
  const relayHeat=(number:number,teams:number[],times:number[]):ResultsRace=>({...heat(number,times),runners:teams.map(n=>team(`t${n}`,n)),finish:{order:teams.map(n=>`t${n}`),didNotFinish:[]}});
  const result=eventResults({event:{...event,code:'R22',name:'4x50m Relay'},races:[relayHeat(1,[1,2],[1400,1600]),relayHeat(2,[3,4],[1500,1700])],completedStages:['no-final']});
  expect(result.inputRunning).toEqual({eventCode:'R22',first:null,second:null,third:null,teams:[1,3,2].map(number=>({id:`team-${number}`,number,wristbands:[1,2,3,4].map(leg=>2000+number*100+leg)}))});
});
/** The final Heats complete builds from the fastest three above, nobody marked and no order yet. */
const final=(change:Partial<ResultsRace>={}):ResultsRace=>({id:'final',kind:'final',number:1,checkedInAt:'2026-10-12T11:00:00Z',deleted:false,saved:false,runners:[2001,2011,2002].map((wristband,index)=>({id:`f${index+1}`,wristband})),finish:null,times:null,
  final:{generation:'initial',hasRun:false,heatsComplete:true,entries:[['heat1','h1-1',2001],['heat2','h2-1',2011],['heat1','h1-2',2002]].map(([heatRaceId,heatEntryId,heatWristband],index)=>({finalEntryId:`f${index+1}`,heatRaceId:heatRaceId as string,heatEntryId:heatEntryId as string,heatWristband:heatWristband as number,seed:index+1,heatRank:index+1,kind:'qualifier' as const,absent:false}))},...change});
const heats=()=>[heat(1,[920,980,1040]),heat(2,[935,1010])];
test('after Heats complete it is offered while the final is unstarted, and gone once a finalist is marked Absent or an order is recorded',()=>{
  const completedStages=['heats' as const];
  expect(eventResults({event,races:[...heats(),final()],completedStages}).noFinalCheckSheet).toMatchObject({stage:'no-final',completed:false,mustSettleFirst:[]});
  const absent=final({runners:final().runners.slice(1)});absent.final={...absent.final!,entries:absent.final!.entries.map(entry=>({...entry,absent:entry.finalEntryId==='f1'}))};
  expect(eventResults({event,races:[...heats(),absent],completedStages})).toMatchObject({noFinalCheckSheet:null,finalResults:{started:true}});
  expect(eventResults({event,races:[...heats(),final({finish:{order:['f2'],didNotFinish:[]}})],completedStages}).noFinalCheckSheet).toBeNull();
  // A final left over after Reopen heats is offered, or not, the same way.
  expect(eventResults({event,races:[...heats(),final()]}).noFinalCheckSheet).not.toBeNull();
  expect(eventResults({event,races:[...heats(),absent]}).noFinalCheckSheet).toBeNull();
});
test('deleting a started final offers it again',()=>{
  expect(eventResults({event,races:[...heats(),final({deleted:true,finish:{order:['f2'],didNotFinish:[]}})],completedStages:['heats']}).noFinalCheckSheet).toMatchObject({stage:'no-final'});
});
test('a relay final has started once a child of a finalist team is marked here',()=>{
  const team=(id:string,number:number,here=false):TeamEntry=>({id,team:{id:`team-${number}`,number},legs:[1,2,3,4].map(leg=>({wristband:2000+number*100+leg,warnings:[],here}))});
  const relayHeat:ResultsRace={...heat(1,[1400,1500]),runners:[team('h1-1',1,true),team('h1-2',2,true)]};
  const relayFinal=(here:boolean)=>final({runners:[team('f1',1,here),team('f2',2)]});
  const relay={...event,code:'R22',name:'4x50m Relay'};
  expect(eventResults({event:relay,races:[relayHeat,relayFinal(false)],completedStages:['heats']}).noFinalCheckSheet).not.toBeNull();
  expect(eventResults({event:relay,races:[relayHeat,relayFinal(true)],completedStages:['heats']}).noFinalCheckSheet).toBeNull();
});
