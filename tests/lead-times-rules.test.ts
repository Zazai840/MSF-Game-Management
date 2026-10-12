import { expect,test } from 'vitest';
import { eventResults,type ResultsRace } from '../src/shared/results-rules.js';
import { raceRecording } from '../src/shared/recording.js';
import type { RaceTimes } from '../src/shared/time-entry.js';
test('only explicit lead acceptance lets out-of-order times rank, while a count mismatch still waits',()=>{
  const runners=[{id:'one',wristband:2001},{id:'two',wristband:2002}];
  const times:RaceTimes={places:[1300,1200],outOfOrder:true,acceptedByLead:true};
  const race:ResultsRace={id:'race',number:1,kind:'race',checkedInAt:'2026-10-12T12:00:00Z',deleted:false,runners,finish:{order:['one','two'],didNotFinish:[]},times};
  const event={code:'R10',name:'60m Hurdles',section:'Girl Cubs' as const,format:'timed' as const};
  expect(eventResults({event,races:[race]}).leaderboard.map(row=>[row.wristband,row.time])).toEqual([[2002,1200],[2001,1300]]);
  expect(raceRecording({kind:'race',parts:{runners:{version:1,value:runners},finish:{version:1,value:race.finish},times:{version:1,value:times}}}).readyForRanking).toBe(true);
  expect(eventResults({event,races:[{...race,times:{...times,acceptedByLead:false}}]}).notRankedYet[0].reasons).toEqual(['times out of order']);
  expect(eventResults({event,races:[{...race,finish:{order:['one'],didNotFinish:['two']}}]}).notRankedYet[0].reasons).toEqual(["finishers and times don't agree"]);
});
