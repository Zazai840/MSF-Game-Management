import { isTeamEntry,type RaceEntry } from './races.js';
import type { AuditNote,RunnerRuling } from './rulings.js';
import type { EventState,LeaderboardRow,ResultEntry,ResultsRace } from './results-rules.js';
import { runnerWarningFlags,teamWarningFlags } from './runner-rulings.js';
/** Whose result a race entry is: a child by wristband, or a relay team with the four children who ran in that race. */
export const resultEntry=(race:Pick<ResultsRace,'id'>,entry:RaceEntry):ResultEntry=>isTeamEntry(entry)
  ?{raceId:race.id,entryId:entry.id,wristband:null,team:{id:entry.team.id,number:entry.team.number,wristbands:entry.legs.map(leg=>leg.wristband)}}
  :{raceId:race.id,entryId:entry.id,wristband:entry.wristband};
/**
 * A result's Notes, beside its flags: the audit notes on that child or relay team, or on their whole race, oldest first.
 * The note badge, the actions sheet's Notes and the Day export's Note column all read this list. Notes follow the
 * entry, so a corrected number keeps them.
 */
export const resultNotes=(state:Pick<EventState,'auditNotes'>,raceId:string,entryId:string):AuditNote[]=>(state.auditNotes||[]).filter(note=>note.touches.some(touch=>touch.raceId===raceId && (!touch.entryId || touch.entryId===entryId))).reverse();
/** What a note says, with the lead's comment when the message does not already carry it. */
export const noteText=(note:Pick<AuditNote,'message'|'comment'>)=>`${note.message}${note.comment && !note.message.includes(note.comment)?` - ${note.comment}`:''}`;
/** Shared identity and ruling facts; each ranking keeps its own places and status. */
export function leaderboardRowFacts(state:EventState,race:ResultsRace,runner:RaceEntry,ruling:RunnerRuling|undefined,repeated=false):Omit<LeaderboardRow,'place'|'time'|'status'> {
  const flags=isTeamEntry(runner)?teamWarningFlags(state,race,runner,ruling):runnerWarningFlags(runner,ruling,repeated);
  if(repeated) flags.push({kind:'ran-twice',message:'Ran twice in this event'});
  const notes=resultNotes(state,race.id,runner.id);
  if(runner.addedAtFinish) flags.push({kind:'added-at-finish',message:'Added at the finish',...(ruling?.addedAtFinishChecked?{checked:true,...(ruling.addedAtFinishCheckedBy?{checkedBy:ruling.addedAtFinishCheckedBy}:{})}:{})});
  return {...resultEntry(race,runner),race:{id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt},position:null,disqualification:ruling?.disqualification??null,notCounted:ruling?.notCounted??false,notes,hasNote:notes.length>0,highlighted:false,qualification:null,medalPlace:null,flags};
}
