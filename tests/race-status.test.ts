import { expect,test } from 'vitest';
import { raceActions,raceRefusal,raceStatus,raceStatuses,type RaceAction,type RaceStatus } from '../src/shared/race-status.js';
const race=(status:RaceStatus,stageComplete=false)=>({kind:'heat' as const,number:2,event:{section:'Girl Cubs' as const},stageComplete,
  state:status==='in progress'?'in progress' as const:'saved' as const,deleted:status==='deleted' || status==='replaced',deleteReason:status==='replaced'?'re-run':status==='deleted'?'lead-delete':null});
test('a race is in one of four states, read from what is stored',()=>{
  for(const status of raceStatuses) expect(raceStatus(race(status))).toBe(status);
  // A race in progress when it was deleted is deleted, not in progress.
  expect(raceStatus({state:'in progress',deleted:true,deleteReason:'lead-delete'})).toBe('deleted');
});
test('one table says what may happen to a race in each state, and each refusal in its one wording',()=>{
  const deleted='A lead deleted Heat 2',inDeleted='This race is in Deleted races',inProgress='Heat 2 is in progress - finish its steps on Races';
  const table:Record<RaceAction,Record<RaceStatus,string|null>>={
    open:{'in progress':null,saved:null,deleted,replaced:deleted},
    step:{'in progress':null,saved:'Heat 2 is saved - ask a lead to change it',deleted,replaced:deleted},
    undo:{'in progress':null,saved:null,deleted,replaced:deleted},
    rule:{'in progress':null,saved:null,deleted:inDeleted,replaced:inDeleted},
    correct:{'in progress':inProgress,saved:null,deleted:inDeleted,replaced:inDeleted},
    're-run':{'in progress':inProgress,saved:null,deleted:inDeleted,replaced:inDeleted},
    delete:{'in progress':null,saved:null,deleted:'This race is already in Deleted races',replaced:'This race is already in Deleted races'},
    restore:{'in progress':'This race is already in the event',saved:'This race is already in the event',deleted:null,replaced:'This race was replaced by a re-run and cannot be restored'},
    'delete for good':{'in progress':null,saved:null,deleted:null,replaced:null}
  };
  for(const action of raceActions) for(const status of raceStatuses) expect([action,status,raceRefusal(race(status),action)]).toEqual([action,status,table[action][status]]);
});
test('a complete stage closes a race to its steps and their undo, before its saved state is named; a lead still works on it',()=>{
  const finished='Girl Cubs heats are finished. Ask a lead to change this race.';
  for(const action of ['step','undo'] as const) for(const status of ['in progress','saved'] as const) expect(raceRefusal(race(status,true),action)).toBe(finished);
  expect(raceRefusal(race('deleted',true),'step')).toBe('A lead deleted Heat 2');
  for(const action of ['open','rule','correct','re-run','delete'] as const) expect(raceRefusal(race('saved',true),action)).toBeNull();
});
