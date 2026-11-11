import type { DayEvent } from './day.js';
import type { Stage } from './stages.js';
/**
 * An event's phase, stored on the event. `racing`: its heats (a timed event: its races) are still open. `final`: a
 * heats event's heats are complete and its final is made. `medals`: its medals are decided, by Event complete or Final
 * complete. `no final`: a heats event's medals are decided by Results without a final.
 */
export const eventPhases=['racing','final','medals','no final'] as const;
export type EventPhase=typeof eventPhases[number];
type Format=DayEvent['format'];
/** The stages complete in a phase, as the check sheets and the stage lock name them. */
export const stagesOf=(phase:EventPhase,format:Format):Stage[]=>format==='timed'?(phase==='medals'?['event']:[])
  :phase==='final'?['heats']:phase==='medals'?['heats','final']:phase==='no final'?['no-final']:[];
export const medalsDecided=(phase:EventPhase)=>phase==='medals' || phase==='no final';
/** The one table of moves: completing (or reopening) a stage of an event in a phase leads to a phase. */
const moves:Record<Format,Partial<Record<Stage,{complete:Partial<Record<EventPhase,EventPhase>>;reopen:Partial<Record<EventPhase,EventPhase>>}>>>={
  timed:{event:{complete:{racing:'medals'},reopen:{medals:'racing'}}},
  heats:{
    heats:{complete:{racing:'final'},reopen:{final:'racing',medals:'racing'}},
    final:{complete:{final:'medals'},reopen:{medals:'final'}},
    'no-final':{complete:{racing:'no final',final:'no final'},reopen:{'no final':'racing'}}
  }
};
/** The phase completing (or reopening) a stage leads to, or null when the event's phase does not allow it. */
export const nextPhase=(phase:EventPhase,format:Format,stage:Stage,reopening:boolean):EventPhase|null=>moves[format][stage]?.[reopening?'reopen':'complete'][phase]??null;
