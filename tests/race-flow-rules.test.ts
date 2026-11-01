import { expect,test } from 'vitest';
import { changedLine,chipLabel,emptyRaceLine,chipState,finalConfirm,groupDone,groupStatus,leadFinalLine,leadSections,raceName,raceSections,volunteerFinalLine,type RaceGroup,type RaceSummary,type StepStatus } from '../src/shared/race-flow.js';
import { childCount,entryWords,legsText,runsShortLine,teamListOf,type RelayTeam } from '../src/shared/teams.js';
const status=(state:StepStatus['state'],count=state==='not started'?0:1):StepStatus=>({state,count,expected:null,version:1,by:null,at:null,doneBy:null,doneAt:null});
const race=(id:string,steps:RaceSummary['steps'],state:RaceSummary['state']='in progress'):RaceSummary=>({id,kind:'heat',number:1,state,steps});
const group=(code:string,races:RaceSummary[],finalAvailable=false,medalsDecided=false)=>({event:{code},races,finalAvailable,medalsDecided}) as unknown as RaceGroup;
test('every run is named a heat, and an event has one final',()=>{
  expect(raceName({kind:'race',number:2})).toBe('Heat 2');
  expect(raceName({kind:'final',number:1})).toBe('Final');
});
test('Ready for you lists groups with a race my step can be worked on; the rest are in progress or done; each section in the day\'s programme',()=>{
  const checkedIn={runners:status('done'),positions:status('not started'),times:status('not started')};
  const empty={runners:status('not started'),positions:status('not started'),times:status('not started')};
  const placed={runners:status('done'),positions:status('done'),times:status('not started')};
  const saved={runners:status('done'),positions:status('done'),times:status('done')};
  const groups=[
    group('newer',[race('a',checkedIn)]),
    group('older',[race('b',checkedIn)]),
    group('nobody yet',[race('c',empty)]),
    group('placed',[race('d',placed)]),
    group('final next',[race('e',saved,'saved')],true),
    group('every race saved',[race('s',saved,'saved')]),
    group('finished',[race('f',saved,'saved')],false,true),
    group('no races',[])
  ];
  const finishLine=raceSections(groups,'finish');
  expect(finishLine.ready.map(item=>item.event.code)).toEqual(['newer','older']);
  // Nobody is checked in to "nobody yet", so the finish line has nothing to place there yet; every race saved is not done until the medals are decided.
  expect(finishLine.inProgress.map(item=>item.event.code)).toEqual(['nobody yet','placed','final next','every race saved']);
  expect(finishLine.done.map(item=>item.event.code)).toEqual(['finished']);
  expect(raceSections(groups,'start').ready.map(item=>item.event.code)).toEqual(['nobody yet']);
  expect(raceSections(groups,'timer').ready.map(item=>item.event.code)).toEqual(['newer','older','placed']);
});
test('a lead\'s sections follow the day\'s programme too, whichever group started waiting first',()=>{
  const saved={runners:status('done'),positions:status('done'),times:status('done')};
  const waiting=(code:string,since:string)=>({...group(code,[race(code,saved,'saved')]),medalsWaiting:{stage:'event',since}}) as RaceGroup;
  const running=(code:string)=>group(code,[race(code,{runners:status('in progress'),positions:status('not started'),times:status('not started')})]);
  const sections=leadSections([waiting('60m','2026-06-01T09:00:00Z'),running('60m Hurdles'),waiting('200m','2026-06-01T10:00:00Z'),running('400m')],[]);
  expect(sections.ready.map(item=>item.event.code)).toEqual(['60m','200m']);
  expect(sections.inProgress.map(item=>item.event.code)).toEqual(['60m Hurdles','400m']);
});
test('a card says each race\'s state in my step, naming the final apart from the heats, and each chip says it too',()=>{
  const step=(state:StepStatus['state'])=>status(state);
  const heat=(number:number,steps:RaceSummary['steps'],state:RaceSummary['state']='in progress')=>({...race(`h${number}`,steps,state),number});
  const final=(steps:RaceSummary['steps'],state:RaceSummary['state']='in progress')=>({...race('f',steps,state),kind:'final' as const,number:1});
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
  const hurdles=(medalsDecided:boolean)=>({...group('hurdles',[race('a',saved,'saved')]),medalsDecided}) as RaceGroup;
  expect(groupDone(hurdles(false))).toBe(false);
  expect(raceSections([hurdles(false)],'timer')).toMatchObject({inProgress:[{event:{code:'hurdles'}}],done:[]});
  expect(groupDone(hurdles(true))).toBe(true);
  expect(raceSections([hurdles(true)],'timer')).toMatchObject({inProgress:[],done:[{event:{code:'hurdles'}}]});
});
test('only a lead is offered the final: a volunteer\'s card says who makes it, a lead\'s says when, and the confirm counts the heats',()=>{
  const steps=(state:StepStatus['state'])=>({runners:status(state),positions:status(state),times:status(state)});
  const saved=(number:number)=>({...race(`h${number}`,steps('done'),'saved'),number});
  const running={...race('h3',steps('in progress')),number:3};
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
test('a relay is listed once it has a heat, as any event is: teams typed ahead with no heats give it no card',()=>{
  const relay=(code:string,races:RaceSummary[]=[])=>({...group(code,races),event:{code,relay:true}}) as unknown as RaceGroup;
  const groups=[relay('ahead'),relay('running',[race('a',{runners:status('in progress'),positions:status('not started'),times:status('not started')})]),group('race',[])];
  for(const sections of [raceSections(groups,'start'),leadSections(groups,[])]) {
    expect(sections).not.toHaveProperty('teamsReady');
    expect([...sections.ready,...sections.inProgress,...sections.done].map(item=>item.event.code)).toEqual(['running']);
  }
  expect(finalConfirm({...relay('cubs',[{...race('h1',{},'saved'),number:1}]),event:{format:'heats',section:'Girl Cubs',relay:true}} as unknown as RaceGroup).text)
    .toBe('1 heat saved. The final takes the fastest 6 teams, and no more heats can be added.');
});
test('a team reads the same on every screen: whether it runs short, and its four children in leg order',()=>{
  const legs=(filled:number)=>[0,1,2,3].map(index=>({wristband:index<filled?2001+index:null,warnings:[]}));
  const team=(filled=4):RelayTeam=>({id:'t1',number:1,legs:legs(filled),version:1,changedBy:null,races:[]});
  expect([runsShortLine(team(3)),runsShortLine(team())]).toEqual(['Runs short · 3 of 4',null]);
  expect(legsText(team(3).legs)).toBe('2001 · 2002 · 2003 · –');
  expect([childCount(1),childCount(3)]).toEqual(['1 child','3 children']);
  expect(teamListOf({event:{code:'R22',name:'4x50m Relay',section:'Girl Cubs'},teams:[team()]})).toEqual({code:'R22',name:'4x50m Relay',section:'Girl Cubs',teams:[team()]});
});
test('the finish line and Timer word a relay\'s teams and a race\'s runners from one place',()=>{
  expect(entryWords(true)).toMatchObject({add:'+ Team not on the list',allPlaced:'Every team is placed',who:'Which team',noneElse:'No other team crossed the line',appear:'Teams appear here as the start line adds them or marks them Here.',timerMeta:'time each team\'s 4th leg'});
  expect(entryWords(false)).toMatchObject({add:'+ Runner not on the list',allPlaced:'Everyone is placed',who:'Who',noneElse:'Nobody else crossed the line',timerMeta:null});
});
test('a write someone overtook names them, on a race step and a relay team alike',()=>{
  expect([changedLine('Tom Barker'),changedLine(null)]).toEqual(['Tom Barker changed this a moment ago','Someone changed this a moment ago']);
});
test('a race with nobody in it says so the same way on its finish line and its refused That\'s everyone',()=>{
  const race=(kind:'heat'|'final',relay:boolean)=>({kind,event:{relay}});
  expect([race('heat',false),race('heat',true),race('final',false),race('final',true)].map(emptyRaceLine)).toEqual(['Nobody is checked in yet','No team is in this heat yet','Nobody is marked Here yet','No team is marked Here yet']);
});
