import { expect,test } from 'vitest';
import { eventResults,medalSheet,needsCheck,placeText,qualifyingLineAt,reopenHeatsSheet,resultLabel,teamLine,teamWristbands,type LeaderboardRow,type ResultsRace } from '../src/shared/results-rules.js';
import { finalTakesChanges,teamInFinal } from '../src/shared/finals.js';
import { disqualifiedText } from '../src/shared/rulings.js';
import { openRaceLabel } from '../src/shared/races.js';

const event={code:'R3',name:'60m',section:'Boy Cubs' as const,format:'heats' as const};
const heat=(id:string,number:number,wristbands:number[]):ResultsRace=>{
  const runners=wristbands.map(wristband=>({id:`${id}-${wristband}`,wristband}));
  return {id,kind:'heat',number,checkedInAt:'2026-10-12T10:00:00Z',deleted:false,saved:true,runners,finish:{order:runners.map(runner=>runner.id),didNotFinish:[]},times:{places:wristbands.map((_,index)=>900+index*10),outOfOrder:false}};
};
const final=(heatId:string,wristbands:number[],run:boolean):ResultsRace=>{
  const runners=wristbands.map(wristband=>({id:`f-${wristband}`,wristband}));
  return {id:'final',kind:'final',number:1,checkedInAt:'2026-10-12T11:00:00Z',deleted:false,saved:run,runners,finish:run?{order:runners.map(runner=>runner.id),didNotFinish:[]}:null,times:null,
    final:{generation:'initial',entries:runners.map((runner,index)=>({finalEntryId:runner.id,heatRaceId:heatId,heatEntryId:`${heatId}-${runner.wristband}`,heatWristband:runner.wristband,seed:index+1,heatRank:index+1,kind:'qualifier' as const,absent:false})),hasRun:run,heatsComplete:true}};
};
const flag=(kind:LeaderboardRow['flags'][number]['kind'],checked?:boolean)=>({kind,message:'',checked});

test('the Check tag shows for an open warning, an addition or a runner who ran twice, never for a tie (it has its own TIE tag)',()=>{
  expect(needsCheck({flags:[flag('warning')]})).toBe(true);
  expect(needsCheck({flags:[flag('added-at-finish')]})).toBe(true);
  expect(needsCheck({flags:[flag('ran-twice')]})).toBe(true);
  expect(needsCheck({flags:[flag('warning',true)]})).toBe(false);
  expect(needsCheck({flags:[flag('tie'),flag('tie-settled')]})).toBe(false);
  expect(needsCheck({flags:[]})).toBe(false);
});

test('a result\'s place reads "6th in race", "Did not finish", or "Not recorded yet" while its race is not counted',()=>{
  expect(placeText({place:6})).toBe('6th in race');
  expect(placeText({place:null})).toBe('Did not finish');
  expect(placeText({place:2,recordingPending:true})).toBe('Not recorded yet');
});

test('a disqualification reads its reason, then the lead\'s comment when there is one',()=>{
  expect(disqualifiedText({reason:'Out of lane',comment:'Stepped into lane 3'})).toBe('Disqualified: Out of lane - Stepped into lane 3');
  expect(disqualifiedText({reason:'Obstruction',comment:null})).toBe('Disqualified: Obstruction');
  expect(disqualifiedText({reason:'Obstruction'})).toBe('Disqualified: Obstruction');
});

test('a race\'s Open button reads "Open Heat 2", or "Open final"',()=>{
  expect(openRaceLabel({kind:'heat',number:2})).toBe('Open Heat 2');
  expect(openRaceLabel({kind:'race',number:3})).toBe('Open Heat 3');
  expect(openRaceLabel({kind:'final',number:1})).toBe('Open final');
});

test('a relay team reads its children in leg order, an empty leg as "–", the same as on the race steps',()=>{
  const team={id:'t3',number:3,wristbands:[2101,null,2187,2150]};
  expect(teamWristbands(team)).toBe('2101 · – · 2187 · 2150');
  expect(teamLine(team)).toBe('Team 3 · 2101 · – · 2187 · 2150');
  expect(resultLabel({wristband:null,team})).toBe('Team 3 · 2101 · – · 2187 · 2150');
  expect(resultLabel({wristband:2001})).toBe('Runner 2001');
});

test('the qualifying line sits under the 6th ranked runner, or under the last when fewer ranked; a timed event has none',()=>{
  expect(qualifyingLineAt(eventResults({event,races:[heat('h1',1,[1001,1002,1003,1004,1005,1006,1007])]}))).toBe(6);
  expect(qualifyingLineAt(eventResults({event,races:[heat('h1',1,[1001,1002,1003])]}))).toBe(3);
  expect(qualifyingLineAt(eventResults({event,races:[]}))).toBeNull();
  expect(qualifyingLineAt(eventResults({event:{...event,format:'timed'},races:[heat('h1',1,[1001,1002,1003])]}))).toBeNull();
});

test('the medal decision shows once there is something to confirm: a timed event\'s ranked runner, or a final\'s saved order',()=>{
  const timed={...event,format:'timed' as const};
  expect(medalSheet(eventResults({event:timed,races:[]}))).toBeNull();
  expect(medalSheet(eventResults({event:timed,races:[heat('h1',1,[1001,1002])]}))).toMatchObject({stage:'event',completed:false});
  expect(medalSheet(eventResults({event:timed,races:[heat('h1',1,[1001,1002])],completedStages:['event']}))).toMatchObject({stage:'event',completed:true});
  // Open heats offer no medal decision: "+ Final" on Races makes the final.
  expect(medalSheet(eventResults({event,races:[heat('h1',1,[1001,1002])]}))).toBeNull();
  const h1=heat('h1',1,[1001,1002]);
  expect(medalSheet(eventResults({event,races:[h1,final('h1',[1001,1002],false)],completedStages:['heats']}))).toBeNull();
  expect(medalSheet(eventResults({event,races:[h1,final('h1',[1001,1002],true)],completedStages:['heats']}))).toMatchObject({stage:'final',completed:false});
});

test('Reopen heats is offered once heats are complete and until the final starts',()=>{
  const h1=heat('h1',1,[1001,1002]);
  expect(reopenHeatsSheet(eventResults({event,races:[h1]}))).toBeNull();
  expect(reopenHeatsSheet(eventResults({event,races:[h1,final('h1',[1001,1002],false)],completedStages:['heats']}))).toMatchObject({stage:'heats',completed:true});
  expect(reopenHeatsSheet(eventResults({event,races:[h1,final('h1',[1001,1002],true)],completedStages:['heats']}))).toBeNull();
});

test('a final takes call-ups and added teams until it runs; a team in its line-up, Absent ones included, is not added again',()=>{
  expect(finalTakesChanges({heatsComplete:true,hasRun:false})).toBe(true);
  expect(finalTakesChanges({heatsComplete:true,hasRun:true})).toBe(false);
  expect(finalTakesChanges({heatsComplete:false,hasRun:false})).toBe(false);
  // The line-up as the start line reads it: seeded, called up and added rows, Absent or not, and a child's row with no team.
  const lineup=[{team:{id:'t1'}},{team:{id:'t2'},absent:true},{team:{id:'t3'}},{}];
  for(const id of ['t1','t2','t3']) expect(teamInFinal(lineup,id)).toBe(true);
  expect(teamInFinal(lineup,'t4')).toBe(false);
});
