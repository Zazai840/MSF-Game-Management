import { isTeamEntry,type RaceEntry } from './races.js';
import type { RunnerRuling } from './rulings.js';
import type { EventState,LeaderboardRow,ResultEntry,ResultsRace } from './results-rules.js';
import { runnerWarningFlags } from './runner-rulings.js';
/** Whose result a race entry is: a child by wristband, or a relay team with the four children who ran in that race. */
export const resultEntry=(race:Pick<ResultsRace,'id'>,entry:RaceEntry):ResultEntry=>isTeamEntry(entry)
  ?{raceId:race.id,entryId:entry.id,wristband:null,team:{id:entry.team.id,number:entry.team.number,wristbands:entry.legs.map(leg=>leg.wristband)}}
  :{raceId:race.id,entryId:entry.id,wristband:entry.wristband};
/** Shared identity and ruling facts; each ranking keeps its own places and status. */
export function leaderboardRowFacts(state:EventState,race:ResultsRace,runner:RaceEntry,ruling:RunnerRuling|undefined,repeated=false):Omit<LeaderboardRow,'place'|'time'|'status'> {
  // shortcut: a relay team's kept warnings stay off its row until To check names teams (#148).
  const flags=isTeamEntry(runner)?[]:runnerWarningFlags(runner,ruling,repeated);
  if(repeated) flags.push({kind:'ran-twice',message:'Ran twice in this event'});
  if(runner.addedAtFinish) flags.push({kind:'added-at-finish',message:'Added at the finish',...(ruling?.addedAtFinishChecked?{checked:true}:{})});
  return {...resultEntry(race,runner),race:{id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt},position:null,disqualification:ruling?.disqualification??null,notCounted:ruling?.notCounted??false,hasNote:!!state.auditNotes?.some(note=>note.touches.some(touch=>touch.raceId===race.id && (!touch.entryId || touch.entryId===runner.id))),highlighted:false,qualification:null,medalPlace:null,flags};
}
