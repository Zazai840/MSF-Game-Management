import type { Runner } from './races.js';
import type { RunnerRuling } from './rulings.js';
import type { EventState,LeaderboardRow,ResultsRace } from './results-rules.js';
import { runnerWarningFlags } from './runner-rulings.js';
/** Shared identity and ruling facts; each ranking keeps its own places and status. */
export function leaderboardRowFacts(state:EventState,race:ResultsRace,runner:Runner,ruling:RunnerRuling|undefined,repeated=false):Omit<LeaderboardRow,'place'|'time'|'status'> {
  const flags=runnerWarningFlags(runner,ruling,repeated);
  if(repeated) flags.push({kind:'ran-twice',message:'Ran twice in this event'});
  if(runner.addedAtFinish) flags.push({kind:'added-at-finish',message:'Added at the finish',...(ruling?.addedAtFinishChecked?{checked:true}:{})});
  return {raceId:race.id,entryId:runner.id,wristband:runner.wristband,race:{id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt},position:null,disqualification:ruling?.disqualification??null,notCounted:ruling?.notCounted??false,hasNote:!!state.auditNotes?.some(note=>note.touches.some(touch=>touch.raceId===race.id && (!touch.entryId || touch.entryId===runner.id))),highlighted:false,qualification:null,medalPlace:null,flags};
}
