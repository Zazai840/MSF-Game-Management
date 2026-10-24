import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
const event={code:'R3',name:'60m',section:'Boy Cubs' as const,format:'heats' as const};
const heat:ResultsRace={id:'heat',kind:'heat',number:1,checkedInAt:'2026-10-12T10:00:00Z',deleted:false,saved:true,runners:[{id:'h1',wristband:1023},{id:'h2',wristband:1088}],finish:{order:['h1','h2'],didNotFinish:[]},times:{places:[901,925],outOfOrder:false}};
const final:ResultsRace={id:'final',kind:'final',number:1,checkedInAt:'2026-10-12T11:00:00Z',deleted:false,saved:true,runners:[{id:'f1',wristband:1023},{id:'f2',wristband:1088}],finish:null,times:null,final:{generation:'initial',entries:[{finalEntryId:'f1',heatRaceId:'heat',heatEntryId:'h1',heatWristband:1023,seed:1,heatRank:1,kind:'qualifier',absent:false},{finalEntryId:'f2',heatRaceId:'heat',heatEntryId:'h2',heatWristband:1088,seed:2,heatRank:2,kind:'qualifier',absent:false}],hasRun:false,heatsComplete:true}};
test('heats check sheet previews a short seeded final, distinct from the final completion sheet',()=>{
 const open=eventResults({event,races:[heat]});expect(open.checkSheet).toMatchObject({stage:'heats',label:'Heats complete',creates:[{position:1,wristband:1023},{position:2,wristband:1088}]});
 const result=eventResults({event,races:[heat,final],completedStages:['heats']});expect(result.status).toBe('Heats complete - final to run');expect(result.checkSheet).toMatchObject({stage:'final',mustSettleFirst:[{kind:'incomplete',raceId:'final'}]});expect(result.inputRunning).toBeNull();expect(result.heatsCheckSheet?.completed).toBe(true);
});
test('final ranks finishing order without times, excludes disqualified runners, and retains heat qualification and immutable absent seed',()=>{
 const race={...final,finish:{order:['f2','f1'],didNotFinish:[]},final:{...final.final!,hasRun:true}};
 const result=eventResults({event,races:[heat,race],completedStages:['heats','final'],rulings:[{raceId:'final',entryId:'f2',disqualification:{reason:'Two false starts',comment:null}}]});
 expect(result.qualifiers.map(row=>row.wristband)).toEqual([1023,1088]);expect(result.finalResults?.leaderboard.map(row=>[row.wristband,row.position,row.time])).toEqual([[1023,1,null],[1088,null,null]]);expect(result.inputRunning).toEqual({eventCode:'R3',first:1023,second:null,third:null});expect(result.status).toBe('Complete');expect(result.checkSheet?.mustSettleFirst).toEqual([]);
 const absent={...race,runners:[race.runners[0]],finish:{order:['f1'],didNotFinish:[]},final:{...race.final,entries:race.final.entries.map(entry=>({...entry,absent:entry.finalEntryId==='f2'}))}};
 expect(eventResults({event,races:[heat,absent],completedStages:['heats']}).finalResults?.entries[1]).toMatchObject({heatEntryId:'h2',absent:true});
});
test('final pending facts are stage scoped, empty saved final can complete, and run history prevents heats reopening',()=>{
 const empty={...final,runners:[],finish:{order:[],didNotFinish:[]},final:{...final.final!,entries:[],hasRun:true}};
 const result=eventResults({event,races:[{...heat,times:null},empty],completedStages:['heats']});expect(result.checkSheet?.mustSettleFirst).toEqual([]);expect(result.heatsCheckSheet?.mustSettleFirst).toHaveLength(1);expect(result.heatsCheckSheet?.reopenWarning).toContain('Heats cannot be reopened');
 expect(result.checkSheet?.creates.map(place=>place.wristband)).toEqual([null,null,null]);
});

test('an unsaved final blocks completion and a heat appearance is never a repeated final appearance',()=>{
 const race={...final,saved:false,finish:{order:['f2','f1'],didNotFinish:[]},final:{...final.final!,hasRun:true}};
 const result=eventResults({event,races:[heat,race],completedStages:['heats']});expect(result.checkSheet?.mustSettleFirst).toMatchObject([{kind:'incomplete',raceId:'final'}]);expect(result.finalResults?.leaderboard).toEqual([]);expect(result.heatsCheckSheet?.mustSettleFirst).toEqual([]);
 const ready=eventResults({event,races:[heat,{...race,saved:true}],completedStages:['heats']});expect(ready.actionableRunners.filter(row=>row.raceId==='final')).toHaveLength(2);expect(ready.actionableRunners.filter(row=>row.raceId==='final').every(row=>!row.recordingPending)).toBe(true);expect(ready.finalResults?.leaderboard.every(row=>row.flags.every(flag=>flag.kind!=='ran-twice'))).toBe(true);
});
