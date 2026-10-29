import { expect,test } from 'vitest';
import { chipLabel,chipState,finalConfirm,groupDone,groupStatus,leadFinalLine,leadSections,raceName,raceSections,volunteerFinalLine,type RaceGroup,type RaceSummary,type StepStatus } from '../src/shared/race-flow.js';
import { teamState,teamsReadyLine,teamsRow,teamsSheetLine,type RelayTeam } from '../src/shared/teams.js';
const status=(state:StepStatus['state'],count=state==='not started'?0:1):StepStatus=>({state,count,expected:null,version:1,by:null,at:null,doneBy:null,doneAt:null});
const race=(id:string,createdAt:string,steps:RaceSummary['steps'],state:RaceSummary['state']='in progress'):RaceSummary=>({id,kind:'heat',number:1,state,createdAt,updatedAt:createdAt,steps});
const group=(code:string,races:RaceSummary[],updatedAt:string,finalAvailable=false,medalsDecided=false)=>({event:{code},races,updatedAt,finalAvailable,medalsDecided}) as unknown as RaceGroup;
test('every run is named a heat, and an event has one final',()=>{
  expect(raceName({kind:'race',number:2})).toBe('Heat 2');
  expect(raceName({kind:'final',number:1})).toBe('Final');
});
test('Ready for you lists groups with a race my step can be worked on, oldest waiting first; the rest are in progress or done',()=>{
  const checkedIn={runners:status('done'),positions:status('not started'),times:status('not started')};
  const empty={runners:status('not started'),positions:status('not started'),times:status('not started')};
  const placed={runners:status('done'),positions:status('done'),times:status('not started')};
  const saved={runners:status('done'),positions:status('done'),times:status('done')};
  const groups=[
    group('newer',[race('a','2026-06-01T10:05:00Z',checkedIn)],'2026-06-01T10:06:00Z'),
    group('older',[race('b','2026-06-01T10:01:00Z',checkedIn)],'2026-06-01T10:02:00Z'),
    group('nobody yet',[race('c','2026-06-01T09:00:00Z',empty)],'2026-06-01T11:00:00Z'),
    group('placed',[race('d','2026-06-01T09:00:00Z',placed)],'2026-06-01T09:30:00Z'),
    group('final next',[race('e','2026-06-01T09:00:00Z',saved,'saved')],'2026-06-01T09:10:00Z',true),
    group('every race saved',[race('s','2026-06-01T09:00:00Z',saved,'saved')],'2026-06-01T09:15:00Z'),
    group('finished',[race('f','2026-06-01T09:00:00Z',saved,'saved')],'2026-06-01T09:20:00Z',false,true),
    group('no races',[],'')
  ];
  const finishLine=raceSections(groups,'finish');
  expect(finishLine.ready.map(item=>item.event.code)).toEqual(['older','newer']);
  // Nobody is checked in to "nobody yet", so the finish line has nothing to place there yet; every race saved is not done until the medals are decided.
  expect(finishLine.inProgress.map(item=>item.event.code)).toEqual(['nobody yet','placed','every race saved','final next']);
  expect(finishLine.done.map(item=>item.event.code)).toEqual(['finished']);
  expect(raceSections(groups,'start').ready.map(item=>item.event.code)).toEqual(['nobody yet']);
  expect(raceSections(groups,'timer').ready.map(item=>item.event.code)).toEqual(['placed','older','newer']);
});
test('a card says each race\'s state in my step, naming the final apart from the heats, and each chip says it too',()=>{
  const step=(state:StepStatus['state'])=>status(state);
  const heat=(number:number,steps:RaceSummary['steps'],state:RaceSummary['state']='in progress')=>({...race(`h${number}`,'2026-06-01T10:00:00Z',steps,state),number});
  const final=(steps:RaceSummary['steps'],state:RaceSummary['state']='in progress')=>({...race('f','2026-06-01T11:00:00Z',steps,state),kind:'final' as const,number:1});
  const saved=(number:number)=>heat(number,{runners:step('done'),positions:step('done'),times:step('done')},'saved');
  const checkedIn=heat(3,{runners:step('done'),positions:step('in progress'),times:step('not started')});
  const placed=heat(4,{runners:step('done'),positions:step('done'),times:step('not started')});
  const checkingIn=heat(5,{runners:step('in progress'),positions:step('not started'),times:step('not started')});
  const empty=heat(6,{runners:step('not started'),positions:step('not started'),times:step('not started')});
  // Start line: a heat checked in but not saved is "checked in", never "done"; a final not yet checked in asks who is here.
  expect(groupStatus({races:[checkedIn]},'start')).toBe('Heat 3 checked in');
  expect(groupStatus({races:[saved(1),saved(2),checkedIn,checkingIn]},'start')).toBe('Heat 5 needs runners · Heat 3 checked in · Heats 1 and 2 done');
  expect(groupStatus({races:[saved(1),saved(2),final({runners:step('not started'),positions:step('not started')})]},'start')).toBe('The final: check who is here · Heats 1 and 2 done');
  // Every race saved: the final is named, never counted as a heat.
  const savedFinal=final({runners:step('done'),positions:step('done')},'saved');
  for(const role of ['start','finish','timer'] as const) expect(groupStatus({races:[saved(1),saved(2),savedFinal]},role)).toBe('Heats 1 and 2 and the final done');
  expect(groupStatus({races:[saved(1)]},'timer')).toBe('Heat 1 done');
  // Finish line: the finishing order, then "order saved"; a heat nobody is checked in to is still checking in.
  expect(groupStatus({races:[checkedIn,placed,empty]},'finish')).toBe('Heat 3 needs the finishing order · Heat 4 order saved · Heat 6 is checking in');
  expect(groupStatus({races:[saved(1),final({runners:step('done'),positions:step('in progress')})]},'finish')).toBe('The final needs the finishing order · Heat 1 done');
  // Timer: heats need times, then are "timed"; a final has no times, so the timer just sees it run.
  const timed=heat(7,{runners:step('done'),positions:step('done'),times:step('done')});
  expect(groupStatus({races:[saved(1),saved(2),checkedIn,placed]},'timer')).toBe('Heats 3 and 4 need times · Heats 1 and 2 done');
  expect(groupStatus({races:[timed,empty,{...empty,id:'h8',number:8}]},'timer')).toBe('Heat 7 timed · Heats 6 and 8 are checking in');
  expect(groupStatus({races:[saved(1),final({runners:step('done'),positions:step('in progress')})]},'timer')).toBe('Heat 1 done · The final is waiting');
  // Zone lead: the race saved, waiting on a lead, or in progress.
  const blocked=heat(9,{runners:step('done'),positions:step('done'),times:step('done')});
  expect(groupStatus({races:[saved(1),saved(2),checkedIn]},'lead')).toBe('Heat 3 in progress · Heats 1 and 2 saved');
  expect(groupStatus({races:[blocked,checkedIn]},'lead')).toBe('Heat 9 needs a lead · Heat 3 in progress');
  expect(groupStatus({races:[saved(1),savedFinal]},'lead')).toBe('Heat 1 and the final saved');
  // Each chip names its state in the same words.
  expect(chipLabel(checkedIn,'timer')).toBe('Heat 3, needs times');
  expect(chipLabel(timed,'timer')).toBe('Heat 7, timed');
  expect(chipLabel(checkedIn,'start')).toBe('Heat 3, checked in');
  expect(chipLabel(checkedIn,'finish')).toBe('Heat 3, needs the finishing order');
  expect(chipLabel(placed,'finish')).toBe('Heat 4, order saved');
  expect(chipLabel(empty,'finish')).toBe('Heat 6, checking in');
  expect(chipLabel(saved(1),'finish')).toBe('Heat 1, done');
  expect(chipLabel(final({runners:step('not started'),positions:step('not started')}),'start')).toBe('Final, check who is here');
  expect(chipState(checkedIn,'lead')).toBe('waiting');
  expect([chipState(blocked,'lead'),chipLabel(blocked,'lead')]).toEqual(['ready','Heat 9, needs a lead']);
  expect(chipLabel(saved(1),'lead')).toBe('Heat 1, saved');
});
test('an event is done once its medals are decided, not when its races are saved',()=>{
  const saved={runners:status('done'),positions:status('done'),times:status('done')};
  const hurdles=(medalsDecided:boolean)=>({...group('hurdles',[race('a','2026-06-01T09:00:00Z',saved,'saved')],'2026-06-01T09:10:00Z'),medalsDecided}) as RaceGroup;
  expect(groupDone(hurdles(false))).toBe(false);
  expect(raceSections([hurdles(false)],'timer')).toMatchObject({inProgress:[{event:{code:'hurdles'}}],done:[]});
  expect(groupDone(hurdles(true))).toBe(true);
  expect(raceSections([hurdles(true)],'timer')).toMatchObject({inProgress:[],done:[{event:{code:'hurdles'}}]});
});
test('only a lead is offered the final: a volunteer\'s card says who makes it, a lead\'s says when, and the confirm counts the heats',()=>{
  const steps=(state:StepStatus['state'])=>({runners:status(state),positions:status(state),times:status(state)});
  const saved=(number:number)=>({...race(`h${number}`,'2026-06-01T10:00:00Z',steps('done'),'saved'),number});
  const running={...race('h3','2026-06-01T10:00:00Z',steps('in progress')),number:3};
  const cubs=(races:RaceSummary[],heatsOpen=true,format='heats')=>({event:{format,section:'Girl Cubs'},races,heatsOpen}) as unknown as RaceGroup;
  expect(volunteerFinalLine(cubs([saved(1),running]))).toBe('A lead makes the final once every heat has run.');
  expect(leadFinalLine(cubs([saved(1),saved(2),running]))).toBe('Heat 3 in progress · Heats 1 and 2 saved · make the final once every heat has run');
  expect(leadFinalLine(cubs([saved(1),saved(2)]))).toBe('Heats 1 and 2 saved · make the final once every heat has run');
  expect(leadFinalLine(cubs([saved(2)]))).toBe('Heat 2 saved · make the final once every heat has run');
  // Nothing saved yet, the final made, or an event with no final: neither line.
  expect(leadFinalLine(cubs([running]))).toBeNull();
  for(const group of [cubs([saved(1)],false),cubs([saved(1)],true,'timed')]) {
    expect(volunteerFinalLine(group)).toBeNull();
    expect(leadFinalLine(group)).toBeNull();
  }
  expect(finalConfirm(cubs([saved(1),saved(2),saved(3)]))).toEqual({title:'Have all Girl Cubs heats run?',text:'3 heats saved. The final takes the fastest 6, and no more heats can be added.'});
  expect(finalConfirm(cubs([saved(1)])).text).toBe('1 heat saved. The final takes the fastest 6, and no more heats can be added.');
});
test('a relay with teams and no heats sits in Teams ready, no heats yet, after In progress; one with neither is not listed',()=>{
  const team=(number:number,races:RelayTeam['races']=[]):RelayTeam=>({id:`t${number}`,number,legs:[],version:1,changedBy:null,changing:null,races});
  const relay=(code:string,teams:RelayTeam[],races:RaceSummary[]=[])=>({...group(code,races,'2026-06-01T10:00:00Z'),teams}) as RaceGroup;
  const groups=[relay('ready',[team(1),team(2)]),relay('empty',[]),relay('running',[team(1)],[race('a','2026-06-01T10:00:00Z',{runners:status('in progress'),positions:status('not started'),times:status('not started')})]),group('race',[],'')];
  for(const sections of [raceSections(groups,'start'),leadSections(groups,[])]) {
    expect(sections.teamsReady.map(item=>item.event.code)).toEqual(['ready']);
    expect([...sections.ready,...sections.inProgress,...sections.done].map(item=>item.event.code)).toEqual(['running']);
  }
  expect(finalConfirm({...relay('cubs',[team(1)],[{...race('h1','2026-06-01T10:00:00Z',{},'saved'),number:1}]),event:{format:'heats',section:'Girl Cubs',relay:true}} as unknown as RaceGroup).text)
    .toBe('1 heat saved. The final takes the fastest 6 teams, and no more heats can be added.');
});
test('a relay\'s Teams row and teams sheet say how many teams there are, which are still to run, and what each team is doing',()=>{
  const legs=(filled:number)=>[0,1,2,3].map(index=>({wristband:index<filled?2001+index:null,warnings:[]}));
  const team=(number:number,races:RelayTeam['races']=[],filled=4):RelayTeam=>({id:`t${number}`,number,legs:legs(filled),version:1,changedBy:null,changing:null,races});
  const ran=team(1,[{id:'h1',kind:'heat',number:1,state:'saved'}]),checking=team(2,[{id:'h2',kind:'heat',number:2,state:'in progress'}]);
  const final=team(3,[{id:'h1',kind:'heat',number:1,state:'saved'},{id:'f',kind:'final',number:1,state:'in progress'}]);
  expect([ran,checking,final,team(4),team(5,[],3)].map(teamState)).toEqual(['Heat 1 · ran','Heat 2 · change it at check-in','Final · change it at check-in','Still to run','Still to run · 3 of 4']);
  expect(teamsRow([ran,checking,team(4),team(5,[],3)])).toBe('Teams 4 · 2 still to run');
  expect(teamsRow([ran,checking])).toBe('Teams 2');
  expect(teamsSheetLine([ran,team(4)],true)).toBe('2 teams · 1 still to run. Tap a team still to run to change it.');
  expect(teamsSheetLine([team(4)],true)).toBe('1 team · 1 still to run. Tap a team still to run to change it.');
  expect(teamsSheetLine([],true)).toBe('No teams yet. Tap New team to type the first.');
  expect(teamsSheetLine([ran],false)).toBe('The final has been made, so the teams can\'t change. A lead can correct a team in Results.');
  expect(teamsReadyLine([team(1),team(2),team(3)])).toBe('3 teams ready · no heats yet');
});
