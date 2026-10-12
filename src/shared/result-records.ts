import { finalRows,type FinalField } from './finals.js';
import type { EventState,LeaderboardRow,NotRankedReason,RaceReference } from './results-rules.js';
export interface ResultRecord extends LeaderboardRow { deleted:boolean; statuses:string[]; warning:string; note:string }
/** Publication record, including unranked and deleted runners; positions are supplied by eventResults. */
export function resultRecords(state:EventState,rows:readonly LeaderboardRow[],reasons:ReadonlyMap<string,NotRankedReason[]>):ResultRecord[] {
 return rows.map(row=>{
  const race=state.races.find(race=>race.id===row.raceId)!;
  const statuses:string[]=[];
  if(race.deleted) statuses.push('Deleted race');
  if(row.disqualification) statuses.push(`Disqualified: ${row.disqualification.reason}`);
  else if(row.notCounted) statuses.push('Not counted');
  else if(race.finish?.didNotFinish.includes(row.entryId)) statuses.push('Did not finish');
  else if(row.medalPlace!==null) statuses.push(['1st','2nd','3rd'][row.medalPlace-1]);
  else if(row.qualification) statuses.push('Q');
  else if(row.place!==null) statuses.push('Finished');
  else statuses.push('Pending');
  if(row.flags.some(flag=>flag.kind==='tie-settled')) statuses.push('Tie settled');
  if(reasons.get(row.raceId)?.length) statuses.push(...reasons.get(row.raceId)!);
  if(race.times?.acceptedByLead) statuses.push('Times accepted by lead');
  const warning=row.flags.filter(flag=>flag.kind!=='tie-settled').map(flag=>`${flag.checked?'Checked: ':''}${flag.message}`).join('; ');
  const note=(state.auditNotes||[]).filter(note=>note.touches.some(touch=>touch.raceId===row.raceId && (!touch.entryId||touch.entryId===row.entryId))).slice().reverse().map(note=>`${note.at} ${note.actor}: ${note.message}${note.comment && !note.message.includes(note.comment)?` — ${note.comment}`:''}`).join('\n');
  return {...row,deleted:race.deleted,statuses,warning,note};
 });
}

export interface FinalRecord extends FinalField { race:RaceReference; deleted:boolean; leaderboard:LeaderboardRow[] }
/** Retained finals keep their own order even when a re-run decides the event. */
export function finalRecords(state:EventState):FinalRecord[] {
 return state.races.filter(race=>race.kind==='final'&&race.final).map(race=>({...race.final!,race:{id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt},deleted:race.deleted,leaderboard:finalRows(state,race)}));
}
