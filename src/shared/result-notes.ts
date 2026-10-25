import { clock } from './clock.js';
import type { AuditNote } from './rulings.js';
import type { EventState,LeaderboardRow } from './results-rules.js';
import { signOffText } from './runner-rulings.js';
/** One line of a result's Notes: what happened, and who settled it or when. `open` is a warning nobody has settled yet. */
export interface NoteLine { id:string; text:string; detail:string; at?:string; open:boolean }
/**
 * The audit notes on a child or relay team in one race, or on their whole race, oldest first. Notes follow the entry,
 * so a corrected number keeps them. The row carries them for its Notes, its note badge and the Day export's Note column.
 */
export const resultAuditNotes=(state:Pick<EventState,'auditNotes'>,raceId:string,entryId:string):AuditNote[]=>(state.auditNotes||[]).filter(note=>note.touches.some(touch=>touch.raceId===raceId && (!touch.entryId || touch.entryId===entryId))).reverse();
/** What a note says, with the lead's comment when the message does not already carry it. */
export const noteText=(note:Pick<AuditNote,'message'|'comment'>)=>`${note.message}${note.comment && !note.message.includes(note.comment)?` - ${note.comment}`:''}`;
/**
 * A result's Notes, as the lead's actions sheet lists them: its warnings and addition at the finish with who settled
 * them, then its audit notes, leaving out a check's audit note already on its warning's line.
 */
export function resultNotes(row:Pick<LeaderboardRow,'flags'|'notes'>):NoteLine[] {
  const flags=row.flags.filter(flag=>flag.kind==='warning' || flag.kind==='added-at-finish');
  return [
    ...flags.map((flag,index)=>({id:`${flag.kind}:${index}`,text:flag.message,detail:signOffText(flag),open:!flag.checked})),
    ...row.notes.filter(note=>!checkFor(row,note)).map(note=>({id:note.id,text:noteText(note),detail:clock(note.at),at:note.at,open:false}))
  ];
}
/**
 * The row's note badge: whether its Notes say more than the flags beside its name, that is any audit note but a plain
 * check (one with no lead's note), whose line in Notes only repeats its flag.
 */
export function hasNotes(row:Pick<LeaderboardRow,'flags'|'notes'>):boolean {
  return row.notes.some(note=>{const check=checkFor(row,note);return !check || Boolean(check.note);});
}
/** The check a note was written for, when it is on one of the row's flags. */
const checkFor=(row:Pick<LeaderboardRow,'flags'>,note:AuditNote)=>row.flags.find(flag=>flag.checkedBy?.noteId===note.id)?.checkedBy;
