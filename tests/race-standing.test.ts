import { expect,test } from 'vitest';
import { chipLabel,chipState,raceSections,raceStanding,roles,type RaceGroup,type RaceStanding,type RaceSummary,type StepStatus } from '../src/shared/race-flow.js';
const step=(state:StepStatus['state'],count=state==='not started'?0:1):StepStatus=>({state,count,expected:null,version:1,by:null,at:null,doneBy:null,doneAt:null});
const heat=(steps:RaceSummary['steps'],state:RaceSummary['state']='in progress'):RaceSummary=>({id:'h',kind:'heat',number:1,state,steps,blocker:null});
const empty=heat({runners:step('not started'),positions:step('not started'),times:step('not started')});
const checkedIn=heat({runners:step('done'),positions:step('in progress'),times:step('not started')});
const allDone=heat({runners:step('done'),positions:step('done'),times:step('done')});
const saved=heat({runners:step('done'),positions:step('done'),times:step('done')},'saved');
const final:RaceSummary={...heat({runners:step('done'),positions:step('in progress')}),kind:'final'};
test('a race stands in one place for each role',()=>{
  expect(raceStanding(empty,'start')).toBe('yours');
  expect(raceStanding(empty,'finish')).toBe('with others');
  expect(raceStanding(checkedIn,'start')).toBe('step done');
  expect(raceStanding(checkedIn,'finish')).toBe('yours');
  expect(raceStanding(checkedIn,'timer')).toBe('yours');
  expect(raceStanding(final,'timer')).toBe('no step');
  expect(raceStanding(checkedIn,'lead')).toBe('in progress');
  expect(raceStanding(allDone,'lead')).toBe('yours');
  for(const role of roles) expect(raceStanding(saved,role)).toBe('in results');
});
test('the chip, its words and Home\'s sections all follow the standing',()=>{
  const chips:Record<RaceStanding,ReturnType<typeof chipState>>={yours:'ready','step done':'done','no step':'done','in results':'done','with others':'waiting','in progress':'waiting'};
  for(const race of [empty,checkedIn,allDone,saved,final]) for(const role of roles) {
    const standing=raceStanding(race,role);
    expect(chipState(race,role)).toBe(chips[standing]);
    expect(/needs|check who is here/.test(chipLabel(race,role))).toBe(standing==='yours');
    if(role!=='lead') expect(raceSections([{event:{code:'e'},races:[race],medalsDecided:false} as unknown as RaceGroup],role).ready.length).toBe(standing==='yours'?1:0);
  }
});
