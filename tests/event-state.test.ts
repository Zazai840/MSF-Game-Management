import { describe,expect,it } from 'vitest';
import { eventState } from '../src/shared/event-state.js';
describe('Results event card state and status line',()=>{
  it('a complete event is Done with its medals decided, heats or timed',()=>{
    expect(eventState({status:'Complete',raceCount:4,format:'heats'})).toEqual({state:'done',label:'Done',line:'Done · medals decided'});
    expect(eventState({status:'Complete',raceCount:2,format:'timed'})).toEqual({state:'done',label:'Done',line:'Done · medals decided'});
  });
  it('heats done with the final still to run is Running',()=>{
    expect(eventState({status:'Heats complete - final to run',raceCount:3,format:'heats'})).toEqual({state:'running',label:'Running',line:'Heats done · final to run'});
  });
  it('an event with races recorded but not complete is Running, counting its races',()=>{
    expect(eventState({status:'In progress - provisional',raceCount:3,format:'heats'})).toEqual({state:'running',label:'Running',line:'Heats running · 3 races'});
    expect(eventState({status:'In progress - provisional',raceCount:1,format:'heats'})).toEqual({state:'running',label:'Running',line:'Heats running · 1 race'});
    expect(eventState({status:'In progress - provisional',raceCount:2,format:'timed'})).toEqual({state:'running',label:'Running',line:'Running · 2 races'});
    expect(eventState({status:'In progress - provisional',raceCount:1,format:'timed'})).toEqual({state:'running',label:'Running',line:'Running · 1 race'});
  });
  it('an event with no races is Not started',()=>{
    expect(eventState({status:'Not started',raceCount:0,format:'heats'})).toEqual({state:'not-started',label:'Not started',line:'Not started'});
    expect(eventState({status:'Not started',raceCount:0,format:'timed'})).toEqual({state:'not-started',label:'Not started',line:'Not started'});
  });
});
