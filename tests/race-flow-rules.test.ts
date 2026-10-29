import { expect,test } from 'vitest';
import { chipLabel,chipState,finalConfirm,groupStatus,leadFinalLine,raceName,raceSections,volunteerFinalLine,type RaceGroup,type RaceSummary,type StepStatus } from '../src/shared/race-flow.js';
const status=(state:StepStatus['state'],count=state==='not started'?0:1):StepStatus=>({state,count,expected:null,version:1,by:null,at:null,doneBy:null,doneAt:null});
const race=(id:string,createdAt:string,steps:RaceSummary['steps'],state:RaceSummary['state']='in progress'):RaceSummary=>({id,kind:'heat',number:1,state,createdAt,updatedAt:createdAt,steps});
const group=(code:string,races:RaceSummary[],updatedAt:string,finalAvailable=false)=>({event:{code},races,updatedAt,finalAvailable}) as unknown as RaceGroup;
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
    group('finished',[race('f','2026-06-01T09:00:00Z',saved,'saved')],'2026-06-01T09:20:00Z'),
    group('no races',[],'')
  ];
  const finishLine=raceSections(groups,'finish');
  expect(finishLine.ready.map(item=>item.event.code)).toEqual(['older','newer']);
  // Nobody is checked in to "nobody yet", so the finish line has nothing to place there yet.
  expect(finishLine.inProgress.map(item=>item.event.code)).toEqual(['nobody yet','placed','final next']);
  expect(finishLine.done.map(item=>item.event.code)).toEqual(['finished']);
  expect(raceSections(groups,'start').ready.map(item=>item.event.code)).toEqual(['nobody yet']);
  expect(raceSections(groups,'timer').ready.map(item=>item.event.code)).toEqual(['placed','older','newer']);
});
test('a card says in words what is waiting for my step, and each chip names its state',()=>{
  const step=(state:StepStatus['state'])=>status(state);
  const heat=(number:number,steps:RaceSummary['steps'],state:RaceSummary['state']='in progress')=>({...race(`h${number}`,'2026-06-01T10:00:00Z',steps,state),number});
  const timed=heat(1,{runners:step('done'),positions:step('done'),times:step('done')},'saved');
  const second=heat(2,{runners:step('done'),positions:step('done'),times:step('done')},'saved');
  const third=heat(3,{runners:step('done'),positions:step('in progress'),times:step('not started')});
  const fourth=heat(4,{runners:step('done'),positions:step('not started'),times:step('not started')});
  const fifth=heat(5,{runners:step('in progress'),positions:step('not started'),times:step('not started')});
  expect(groupStatus({races:[timed,second,third,fourth]},'timer')).toBe('Heats 3 and 4 need times · 1 and 2 done');
  expect(groupStatus({races:[timed,second]},'timer')).toBe('All 2 heats done');
  expect(groupStatus({races:[third,fifth]},'finish')).toBe('Heats 3 and 5 need positions');
  expect(groupStatus({races:[fifth]},'timer')).toBe('Heat 5 needs times');
  // One heat done is that heat, never "All 1 heat".
  expect(groupStatus({races:[timed]},'timer')).toBe('Heat 1 done');
  expect(chipLabel(third,'timer')).toBe('Heat 3, needs times');
  expect(chipLabel(timed,'timer')).toBe('Heat 1, times done');
  expect(chipLabel(third,'start')).toBe('Heat 3, runners done');
  expect(chipState(third,'lead')).toBe('waiting');
  const blocked=heat(6,{runners:step('done'),positions:step('done'),times:step('done')});
  expect([chipState(blocked,'lead'),chipLabel(blocked,'lead')]).toEqual(['ready','Heat 6, needs a lead']);
});
test('only a lead is offered the final: a volunteer\'s card says who makes it, a lead\'s says when, and the confirm counts the heats',()=>{
  const steps=(state:StepStatus['state'])=>({runners:status(state),positions:status(state),times:status(state)});
  const saved=(number:number)=>({...race(`h${number}`,'2026-06-01T10:00:00Z',steps('done'),'saved'),number});
  const running={...race('h3','2026-06-01T10:00:00Z',steps('in progress')),number:3};
  const cubs=(races:RaceSummary[],heatsOpen=true,format='heats')=>({event:{format,section:'Girl Cubs'},races,heatsOpen}) as unknown as RaceGroup;
  expect(volunteerFinalLine(cubs([saved(1),running]))).toBe('A lead makes the final once every heat has run.');
  expect(leadFinalLine(cubs([saved(1),saved(2),running]))).toBe('Heats 1 and 2 saved · make the final once every heat has run');
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
