import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
const event={code:'R16',name:'200m',section:'Girl Cubs' as const,format:'timed' as const};
const race=(id:string,number:number,time:number):ResultsRace=>({id,kind:'race',number,checkedInAt:'2026-10-12T10:00:00Z',deleted:false,saved:true,runners:[{id:`entry-${id}`,wristband:2000+number}],finish:{order:[`entry-${id}`],didNotFinish:[]},times:{places:[time],outOfOrder:false}});
test('the Event complete sheet blocks a highlighted tie and previews the podium',()=>{
  const result=eventResults({event,races:[race('a',1,1000),race('b',2,1000)]});
  expect(result.checkSheet?.mustSettleFirst).toMatchObject([{kind:'tie',tieId:result.ties[0].id}]);
  expect(result.checkSheet?.creates.map(place=>[place.position,place.wristband])).toEqual([[1,2001],[2,2002],[3,null]]);
});
test('incomplete recordings block once per race, while warning-only races can complete',()=>{
  for(const change of [
    (r:ResultsRace)=>{r.finish=null;},
    (r:ResultsRace)=>{r.times=null;},
    (r:ResultsRace)=>{r.times={places:[1000,1100],outOfOrder:false};},
    (r:ResultsRace)=>{r.runners=[...r.runners,{id:'second',wristband:2002}];r.finish={order:['entry-a','second'],didNotFinish:[]};r.times={places:[1000,900],outOfOrder:true};}
  ]) {
    const r=race('a',1,1000);change(r);
    const sheet=eventResults({event,races:[r]}).checkSheet!;
    expect(sheet.mustSettleFirst).toHaveLength(1);
    expect(sheet.mustSettleFirst[0]).toMatchObject({raceId:'a'});
  }
  const r=race('a',1,1000);r.runners[0].warnings=[{kind:'wrong-section',message:'Wrong section',kept:true}];
  const result=eventResults({event,races:[r]});
  expect(result.checkSheet?.mustSettleFirst).toEqual([]);
  expect(result.checkSheet?.worthALook).toMatchObject([{kind:'warning',raceId:'a',entryId:'entry-a'}]);
  expect(eventResults({event,races:[r],rulings:[{raceId:'a',entryId:'entry-a',disqualification:null,warningChecks:[{kind:'wrong-section',message:'Wrong section'}]}]}).checkSheet?.worthALook).toEqual([]);
});
test('ran-twice blocks inside the tinted band only, excluding a future final from Event complete',()=>{
  const entries=Array.from({length:8},(_,i)=>race(String(i),i+1,900+i*100));entries[7].runners[0].wristband=2007;
  expect(eventResults({event,races:entries}).checkSheet?.mustSettleFirst).toEqual([]);
  entries[7].times={places:[800],outOfOrder:false};
  expect(eventResults({event,races:entries}).checkSheet?.mustSettleFirst).toMatchObject([{kind:'ran-twice',raceId:'7'}]);
  const final={...race('final',1,800),kind:'final' as const,finish:null,times:null};
  expect(eventResults({event,races:[race('a',1,1000),final]}).checkSheet?.mustSettleFirst).toEqual([]);
});
test('short and empty fields complete with blank missing podium slots and saved-empty recordings count',()=>{
  const r=race('a',1,1000);r.finish={order:[],didNotFinish:['entry-a']};r.times={places:[null],outOfOrder:false};
  expect(eventResults({event,races:[r]}).checkSheet?.mustSettleFirst).toEqual([]);
  expect(eventResults({event,races:[],completedStages:['event']})).toMatchObject({status:'Complete',provisional:false,inputRunning:{eventCode:'R16',first:null,second:null,third:null}});
  expect(eventResults({event,races:[race('a',1,1000),race('b',2,1100)],completedStages:['event']})).toMatchObject({inputRunning:{eventCode:'R16',first:2001,second:2002,third:null}});
});
test('lead-accepted time order is fully recorded but count mismatches still block',()=>{
  const r=race('a',1,1000);r.runners=[...r.runners,{id:'second',wristband:2002}];r.finish={order:['entry-a','second'],didNotFinish:[]};r.times={places:[1000,900],outOfOrder:true,acceptedByLead:true};
  expect(eventResults({event,races:[r]}).checkSheet?.mustSettleFirst).toEqual([]);
  r.times.places=[1000];expect(eventResults({event,races:[r]}).checkSheet?.mustSettleFirst).toMatchObject([{kind:'incomplete'}]);
});
test('a race not saved yet must be settled, saying how many are checked in, while one with nobody checked in is ignored',()=>{
  const inProgress=(id:string,number:number,wristbands:number[]):ResultsRace=>({...race(id,number,0),saved:false,runners:wristbands.map(wristband=>({id:`entry-${wristband}`,wristband})),finish:null,times:null});
  const heats={...event,code:'R1',format:'heats' as const},heat=(r:ResultsRace):ResultsRace=>({...r,kind:'heat'});
  expect(eventResults({event,races:[race('a',1,1000),inProgress('b',2,[2004,2005,2006,2007])]}).checkSheet?.mustSettleFirst).toEqual([{id:'race:b',kind:'incomplete',raceId:'b',message:'Race 2 is in progress (4 checked in) - submit it or delete it'}]);
  expect(eventResults({event:heats,races:[heat(race('a',1,1000)),heat(inProgress('b',3,[2004]))]}).heatsCheckSheet?.mustSettleFirst.map(item=>item.message)).toEqual(['Heat 3 is in progress (1 checked in) - submit it or delete it']);
  expect(eventResults({event:heats,races:[heat(race('a',1,1000)),heat(inProgress('b',2,[]))]}).heatsCheckSheet?.mustSettleFirst).toEqual([]);
});
