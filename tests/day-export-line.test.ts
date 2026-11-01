import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
import { dayExportLine } from '../src/shared/stages.js';
import { inputRunningRow } from '../src/server/day/workbook.js';
import type { TeamEntry } from '../src/shared/races.js';
const at='2026-10-23T10:00:00Z';
// J, M and P: the 1st, 2nd and 3rd place cells of the export's Input - Running row.
const places=(row:ReadonlyArray<unknown>)=>[row[9],row[12],row[15]];

test('a timed event\'s Day export line names the export row\'s 1st, 2nd and 3rd, with "-" for a place nobody holds',()=>{
  const race:ResultsRace={id:'r1',kind:'heat',number:1,checkedInAt:at,deleted:false,saved:true,runners:[{id:'a',wristband:2014},{id:'b',wristband:2003}],finish:{order:['a','b'],didNotFinish:[]},times:{places:[2900,3000],outOfOrder:false}};
  const event={code:'E2',name:'200m',section:'Girl Cubs' as const,format:'timed' as const};
  const input=eventResults({event,races:[race],completedStages:['event']}).inputRunning!;
  expect(dayExportLine(input)).toBe('1st 2014 · 2nd 2003 · 3rd -');
  expect(places(inputRunningRow(input,event.section))).toEqual([2014,2003,null]);
});

test('a relay\'s Day export line names the medal teams in the export row\'s order: each place\'s scored child is one of that team\'s',()=>{
  const legs=(number:number)=>[1,2,3,4].map(leg=>2000+number*100+leg);
  const team=(id:string,number:number):TeamEntry=>({id,team:{id:`team-${number}`,number},legs:legs(number).map(wristband=>({wristband,warnings:[],here:true}))});
  const heat:ResultsRace={id:'heat',kind:'heat',number:1,checkedInAt:at,deleted:false,saved:true,runners:[team('h1',1),team('h2',2),team('h3',3)],finish:{order:['h1','h2','h3'],didNotFinish:[]},times:{places:[3400,3500,3600],outOfOrder:false}};
  const final:ResultsRace={id:'final',kind:'final',number:1,checkedInAt:at,deleted:false,saved:true,runners:[team('f1',1),team('f2',2),team('f3',3)],finish:{order:['f3','f1','f2'],didNotFinish:[]},times:null,
    final:{generation:'g',hasRun:true,heatsComplete:true,entries:['h1','h2','h3'].map((heatEntryId,index)=>({finalEntryId:`f${index+1}`,heatRaceId:'heat',heatEntryId,heatWristband:null,seed:index+1,heatRank:index+1,kind:'qualifier' as const,absent:false}))}};
  const event={code:'R22',name:'4x50m Relay',section:'Girl Cubs' as const,format:'heats' as const};
  const input=eventResults({event,races:[heat,final],completedStages:['heats','final']}).inputRunning!;
  expect(dayExportLine(input)).toBe('1st Team 3 · 2nd Team 1 · 3rd Team 2');
  expect(places(inputRunningRow(input,event.section)).map((scored,index)=>legs([3,1,2][index]!).includes(scored as number))).toEqual([true,true,true]);
});
