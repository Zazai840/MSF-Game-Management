import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
const event={code:'R4',name:'60m',section:'Girl Cubs' as const,format:'heats' as const};
function race(id:string,numbers:number[],times:Array<number|null>,kind:'heat'|'race'='heat'):ResultsRace {
  const runners=numbers.map(wristband=>({id:`${id}-${wristband}`,wristband}));
  return {id,number:Number(id.replace(/\D/g,''))||1,kind,deleted:false,saved:true,checkedInAt:'2026-10-12T10:00:00Z',runners,finish:{order:runners.slice(0,times.filter(time=>time!==null).length).map(runner=>runner.id),didNotFinish:runners.slice(times.filter(time=>time!==null).length).map(runner=>runner.id)},times:{places:times,outOfOrder:false}};
}
test('a newly listed event has no ranked runners or open lead items',()=>{
  expect(eventResults({event,races:[]})).toMatchObject({leaderboard:[],qualifiers:[],medalPlaces:[],ties:[],notRankedYet:[],needsYou:[],status:'Not started',raceCount:0,provisional:true});
});
test('heats rank complete races by time, highlight eight and qualify six, with Did not finish at the bottom',()=>{
  const results=eventResults({event,races:[race('heat1',[2001,2002,2003,2004,2005],[1200,1300,1400,1500,null]),race('heat2',[2006,2007,2008,2009,2010],[1100,1250,1350,1450,1550])]});
  expect(results.leaderboard.map(row=>row.wristband)).toEqual([2006,2001,2007,2002,2008,2003,2009,2004,2010,2005]);
  expect(results.qualifiers.map(row=>row.wristband)).toEqual([2006,2001,2007,2002,2008,2003]);
  expect(results.leaderboard.filter(row=>row.highlighted).map(row=>row.wristband)).toEqual([2006,2001,2007,2002,2008,2003,2009,2004]);
  expect(results.leaderboard[9]).toMatchObject({position:null,place:null,time:null,status:'Did not finish',qualification:null});
  expect(results.band).toEqual({highlightCount:8,lineAfter:6,lineLabel:'Qualifying line'});
  expect(results).toMatchObject({raceCount:2,status:'In progress - provisional'});
});
test('timed races highlight six, give three medal marks and use finishing order for equal times within a race',()=>{
  const first=race('race1',[2001,2002,2003,2004],[1200,1200,1300,1400],'race');
  first.finish={order:['race1-2002','race1-2001','race1-2003','race1-2004'],didNotFinish:[]};
  const results=eventResults({event:{...event,code:'R16',name:'200m',format:'timed'},races:[first,race('race2',[2005,2006,2007],[1100,1250,1350],'race')]});
  expect(results.leaderboard.map(row=>row.wristband)).toEqual([2005,2002,2001,2006,2003,2007,2004]);
  expect(results.medalPlaces.map(row=>[row.wristband,row.medalPlace])).toEqual([[2005,1],[2002,2],[2001,3]]);
  expect(results.leaderboard.filter(row=>row.highlighted)).toHaveLength(6);
  expect(results.qualifiers).toEqual([]);expect(results.band).toEqual({highlightCount:6,lineAfter:3,lineLabel:'Medal line'});
});
test('every incomplete recording stays out of the leaderboard, while deleted races have no effect',()=>{
  const checked=race('heat1',[2001],[1200]);checked.finish=null;checked.times=null;
  const awaitingFinish=race('heat2',[2002],[1200]);awaitingFinish.finish=null;
  const awaitingTimes=race('heat3',[2003],[1200]);awaitingTimes.times=null;
  const outOfOrder=race('heat4',[2004,2005],[1300,1200]);
  const mismatch=race('heat5',[2006,2007],[1200,null]);mismatch.finish={order:['heat5-2006','heat5-2007'],didNotFinish:[]};
  const deleted=race('heat6',[2008],[1000]);deleted.deleted=true;
  const results=eventResults({event,races:[checked,awaitingFinish,awaitingTimes,outOfOrder,mismatch,deleted]});
  expect(results.leaderboard).toEqual([]);expect(results.raceCount).toBe(5);
  expect(results.notRankedYet.map(item=>[item.race.id,item.reasons])).toEqual([
    ['heat1',['checked in']],['heat2',['awaiting finishing order']],['heat3',['awaiting times']],['heat4',['times out of order']],['heat5',["finishers and times don't agree"]]
  ]);
});
test('kept warnings retain their own words, added runners are flagged and a number ranks in both active races with ran-twice flags',()=>{
  const first=race('heat1',[3045,2001],[1200,1300]);
  first.runners=[{...first.runners[0],warnings:[{kind:'wrong-section',message:'3045 belongs to Boy Scouts - this race is Girl Cubs',kept:true}]},{...first.runners[1],addedAtFinish:true}];
  const second=race('heat2',[3045],[1250]);
  const deleted=race('heat3',[2001],[1100]);deleted.deleted=true;
  const results=eventResults({event,races:[first,second,deleted]});
  expect(results.leaderboard.filter(row=>row.wristband===3045)).toHaveLength(2);
  expect(results.leaderboard[0].flags).toEqual([{kind:'warning',message:'3045 belongs to Boy Scouts - this race is Girl Cubs',warningKind:'wrong-section',checked:false},{kind:'ran-twice',message:'Ran twice in this event'}]);
  expect(results.leaderboard[1].flags).toEqual([{kind:'ran-twice',message:'Ran twice in this event'}]);
  expect(results.leaderboard[2].flags).toEqual([{kind:'added-at-finish',message:'Added at the finish'}]);
});

test('disqualification moves runners over the qualifying line and lifting restores their places with a note tag',()=>{
  const races=[race('heat1',[2001,2002,2003,2004,2005,2006],[1100,1200,1300,1400,1500,1600]),race('heat2',[2007,2008,2009],[1700,1800,1900])];
  const rulings=[{raceId:'heat1',entryId:'heat1-2001',disqualification:{reason:'Obstruction' as const,comment:null}}];
  const auditNotes=[{id:'note1',action:'disqualify',actor:'Aisha',at:'2026-10-12T14:32:00Z',message:'Aisha disqualified 2001 (Heat 1): Obstruction',comment:null,touches:[{raceId:'heat1',entryId:'heat1-2001'}]}];
  const disqualified=eventResults({event,races,rulings,auditNotes});
  expect(disqualified.qualifiers.map(row=>row.wristband)).toEqual([2002,2003,2004,2005,2006,2007]);
  expect(disqualified.leaderboard.filter(row=>row.highlighted).map(row=>row.wristband)).toEqual([2002,2003,2004,2005,2006,2007,2008,2009]);
  expect(disqualified.leaderboard[8]).toMatchObject({wristband:2001,status:'Disqualified',position:null,qualification:null,highlighted:false,disqualification:{reason:'Obstruction'},hasNote:true});
  const lifted=eventResults({event,races,rulings:[],auditNotes});
  expect(lifted.qualifiers.map(row=>row.wristband)).toEqual([2001,2002,2003,2004,2005,2006]);
  expect(lifted.leaderboard[0]).toMatchObject({wristband:2001,position:1,status:'Finished',disqualification:null,hasNote:true});
});
test('a disqualification moves the next runner into a medal place and the seventh into the timed highlight band',()=>{
  const races=[race('race1',[2001,2002,2003,2004,2005,2006],[1100,1200,1300,1400,1500,1600],'race'),race('race2',[2007],[1700],'race')];
  const results=eventResults({event:{...event,format:'timed'},races,rulings:[{raceId:'race1',entryId:'race1-2002',disqualification:{reason:'Two false starts',comment:null}}]});
  expect(results.medalPlaces.map(row=>[row.wristband,row.medalPlace])).toEqual([[2001,1],[2003,2],[2004,3]]);
  expect(results.leaderboard.filter(row=>row.highlighted).map(row=>row.wristband)).toEqual([2001,2003,2004,2005,2006,2007]);
  expect(results.leaderboard[6]).toMatchObject({wristband:2002,position:null,medalPlace:null,highlighted:false,status:'Disqualified'});
});
