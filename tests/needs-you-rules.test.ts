import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
const event={code:'R16',name:'200m',section:'Girl Cubs' as const,format:'timed' as const};
const pending:ResultsRace={id:'pending',kind:'race',number:1,checkedInAt:'2026-10-12T10:00:00Z',deleted:false,saved:true,runners:[{id:'runner',wristband:3045,warnings:[{kind:'wrong-section',message:'3045 belongs to Boy Scouts - this race is Girl Cubs',kept:true}]}],finish:null,times:null};
test('an unfinished race exposes its open eligibility warning and actionable runner without ranking them; wrong-section disqualification settles it and lifting the disqualification reopens it',()=>{
  const result=eventResults({event,races:[pending]});
  expect(result.needsYou).toMatchObject([{kind:'warning',raceId:'pending',entryId:'runner',at:'2026-10-12T10:00:00Z'}]);
  expect(result.leaderboard).toEqual([]);
  expect(result.actionableRunners).toMatchObject([{wristband:3045,status:'Pending',place:null,time:null}]);
  const disqualified=eventResults({event,races:[pending],rulings:[{raceId:'pending',entryId:'runner',disqualification:{reason:'Wrong section or age',comment:null}}]});
  expect(disqualified.needsYou).toEqual([]);expect(disqualified.actionableRunners[0].flags[0].checked).toBe(true);
  expect(eventResults({event,races:[pending],rulings:[{raceId:'pending',entryId:'runner',disqualification:null}]}).needsYou).toHaveLength(1);
});
test('all six kinds use persisted newest-first facts, including pending duplicates and independently checked additions',()=>{
  const complete=(id:string,wristband:number,at:string):ResultsRace=>({id,number:2,kind:'race',deleted:false,saved:true,checkedInAt:at,leadTimes:{times:at},runners:[{id:`${id}-runner`,wristband}],finish:{order:[`${id}-runner`],didNotFinish:[]},times:{places:[1200],outOfOrder:false}});
  const warning={...pending,leadTimes:{runners:'2026-10-12T10:01:00Z'}};
  const added:ResultsRace={...pending,id:'added',checkedInAt:'2026-10-12T10:02:00Z',runners:[{id:'added-runner',wristband:2002,addedAtFinish:true}]};
  const duplicate:ResultsRace={...pending,id:'duplicate',checkedInAt:'2026-10-12T10:03:00Z',runners:[{id:'duplicate-runner',wristband:2003}]};
  const duplicate2={...duplicate,id:'duplicate2',runners:[{id:'duplicate2-runner',wristband:2003}]};
  const times:ResultsRace={...pending,id:'times',checkedInAt:'2026-10-12T10:04:00Z',runners:[],times:{places:[1300,1200],outOfOrder:true}};
  const clash:ResultsRace={...pending,id:'clash',checkedInAt:'2026-10-12T10:00:00Z',leadTimes:{clash:'2026-10-12T10:05:00Z'},runners:[],clash:true};
  const races=[warning,added,duplicate,duplicate2,times,clash,complete('tie1',2004,'2026-10-12T10:06:00Z'),complete('tie2',2005,'2026-10-12T10:07:00Z')];
  const result=eventResults({event,races});
  expect(result.needsYou.map(item=>item.kind)).toEqual(['tie','clash','times-out-of-order','ran-twice','ran-twice','added-at-finish','warning']);
  expect(result.needsYou[0]).toMatchObject({tieId:result.ties[0].id,at:'2026-10-12T10:07:00Z'});
  expect(result.needsYou.find(item=>item.kind==='added-at-finish')).toMatchObject({raceId:'added',entryId:'added-runner'});
  const checked=eventResults({event,races:[added,times],rulings:[{raceId:'added',entryId:'added-runner',disqualification:null,addedAtFinishChecked:true}]});
  expect(checked.needsYou.map(item=>item.kind)).toEqual(['times-out-of-order']);
  expect(eventResults({event,races:[{...times,times:{...times.times!,acceptedByLead:true}}]}).needsYou).toEqual([]);
  expect(eventResults({event,races:[{...warning,deleted:true},{...duplicate,deleted:true},duplicate2]}).needsYou).toEqual([]);
});
test('acknowledging an unrelated added runner does not move older ties or clashes above a newer warning',()=>{
  const tieRace=(id:string,n:number):ResultsRace=>({id,number:n,kind:'race',deleted:false,saved:true,checkedInAt:'2026-10-12T10:00:00Z',runners:[{id:`${id}-runner`,wristband:2000+n}],finish:{order:[`${id}-runner`],didNotFinish:[]},times:{places:[1200],outOfOrder:false}});
  const clash:ResultsRace={...pending,id:'clash',clash:true,runners:[{id:'addition',wristband:2004,addedAtFinish:true}]};
  const warning={...pending,id:'new-warning',checkedInAt:'2026-10-12T10:02:00Z'};
  const result=eventResults({event,races:[tieRace('tie1',1),tieRace('tie2',2),clash,warning],rulings:[{raceId:'clash',entryId:'addition',disqualification:null,addedAtFinishChecked:true}],auditNotes:[{id:'ack',action:'mark-added-checked',actor:'Aisha',at:'2026-10-12T10:03:00Z',message:'Aisha checked addition',comment:null,touches:[{raceId:'clash',entryId:'addition'}]}]});
  expect(result.needsYou.map(item=>item.kind)).toEqual(['warning','clash','tie']);
  expect(result.needsYou.map(item=>item.at)).toEqual(['2026-10-12T10:02:00Z','2026-10-12T10:00:00Z','2026-10-12T10:00:00Z']);
});
test('final progression never becomes a ran-twice item even while two preliminary copies are still open',()=>{
  const first={...pending,id:'first',runners:[{id:'first-runner',wristband:2001}]};
  const second={...first,id:'second',runners:[{id:'second-runner',wristband:2001}]};
  const final={...first,id:'final',kind:'final' as const,runners:[{id:'final-runner',wristband:2001}]};
  const result=eventResults({event:{...event,format:'heats'},races:[first,second,final]});
  expect(result.needsYou.filter(item=>item.kind==='ran-twice').map(item=>item.raceId)).toEqual(['first','second']);
  expect(result.actionableRunners.find(row=>row.raceId==='final')?.flags).toEqual([]);
});
test('excluded unfinished duplicate choices remain explicitly unrecorded rather than looking like Did not finish',()=>{
  const result=eventResults({event,races:[pending],rulings:[{raceId:'pending',entryId:'runner',disqualification:null,notCounted:true}]});
  expect(result.actionableRunners[0]).toMatchObject({status:'Not counted',recordingPending:true});
});
test('a race still in progress puts nothing on To check, and its runners do not make a saved one ran twice',()=>{
  const saved={...pending,id:'saved',runners:[{id:'saved-runner',wristband:2001}]};
  const running:ResultsRace={...pending,id:'running',saved:false,runners:[{id:'running-runner',wristband:2001},...pending.runners]};
  expect(eventResults({event,races:[saved,running]}).needsYou).toEqual([]);
  expect(eventResults({event,races:[running]}).notRankedYet).toMatchObject([{reasons:['in progress']}]);
});
