import { expect,test } from 'vitest';
import { raceRecording } from '../src/shared/recording.js';
import type { RaceRead } from '../src/shared/races.js';
test('a saved final needs its finishing order alone',()=>{
  const race:RaceRead={id:'final-race',event:{id:'event',code:'R4',name:'60m',section:'Girl Cubs',format:'heats',enabled:true},kind:'final',number:1,checkedInAt:'2026-10-12T10:00:00Z',deleted:false,state:'saved',
    parts:{runners:{version:1,value:[{id:'child',wristband:2001}]},finish:{version:1,value:{order:['child'],didNotFinish:[]}},times:{version:0,value:null}},recording:{countMismatch:null,readyForRanking:false,results:[]}};
  expect(raceRecording(race)).toEqual({countMismatch:null,readyForRanking:true,results:[{entryId:'child',wristband:2001,place:1,time:null}]});
  expect(raceRecording({...race,state:'submitted'}).readyForRanking).toBe(false);
});
