import { resultHolder,resultName,type EventState,type LeaderboardRow,type ResultTie,type LeadItem,type ResultsRace,type WarningKind } from './results-rules.js';
import { isOpenEligibilityWarning } from './runner-rulings.js';
import { formatTime } from './time-entry.js';
import { notCountedReasons } from './race-counts.js';
const teamItems:Partial<Record<WarningKind,'two-relays'|'ran-short'>>={'other-relay':'two-relays','ran-short':'ran-short'};
const latest=(dates:readonly string[])=>dates.reduce((a,b)=>a>b?a:b,'');
/** The first place whose time is faster than an earlier place's, and that earlier place. */
function firstWrongTime(places:readonly(number|null)[]):LeadItem['wrongTime'] {
  let earlier:{place:number;time:number}|null=null;
  for(const [index,time] of places.entries()) {
    if(time===null) continue;
    if(earlier && time<earlier.time) return {place:index+1,time,earlierPlace:earlier.place,earlierTime:earlier.time};
    earlier={place:index+1,time};
  }
  return undefined;
}
/** On a relay, the team an item is about, for To check to name it. */
const teamOf=(row:LeaderboardRow):Pick<LeadItem,'team'>=>row.team?{team:row.team.number}:{};
/** Canonical lead queue, shared by live counts and stage check sheets. A race joins it once saved. */
export function eventLeadItems(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[]):LeadItem[] {
  const active=state.races.filter(race=>!race.deleted && race.saved);
  const changed=(race:ResultsRace,part:'runners'|'finish'|'times',entryId?:string,actions:readonly string[]=[],introducedAt?:string)=>latest([introducedAt||race.leadTimes?.[part]||race.checkedInAt,...(state.auditNotes||[]).filter(note=>['restore-race',...actions].includes(note.action) && note.touches.some(touch=>touch.raceId===race.id && (!entryId || !touch.entryId || touch.entryId===entryId))).map(note=>note.at)]);
  const items:LeadItem[]=[];
  for(const race of active) {
    const reasons=notCountedReasons(race);
    if(reasons.includes('times out of order')) items.push({id:`times:${race.id}`,kind:'times-out-of-order',raceId:race.id,at:changed(race,'times'),message:'Times out of order',wrongTime:firstWrongTime(race.times!.places)});
  }
  for(const row of rows) {
    const race=active.find(race=>race.id===row.raceId);if(!race) continue;
    const open=row.flags.filter(isOpenEligibilityWarning),warnings=open.filter(flag=>!teamItems[flag.warningKind!]);
    const warned=changed(race,'runners',row.entryId,['correct-number','correct-runners','lift-disqualification'],race.leadTimes?.[`warning:${row.entryId}`]);
    // A relay team's own questions are items of their own: a child in two relays, a team that ran short.
    for(const [warningKind,kind] of Object.entries(teamItems)) {
      const flags=open.filter(flag=>flag.warningKind===warningKind);
      if(flags.length) items.push({id:`${kind}:${row.raceId}:${row.entryId}`,kind,raceId:row.raceId,entryId:row.entryId,at:warned,message:flags.map(flag=>flag.message).join(' '),...teamOf(row)});
    }
    if(warnings.length) items.push({id:`warning:${row.raceId}:${row.entryId}`,kind:'warning',raceId:row.raceId,entryId:row.entryId,at:warned,message:`${resultName(row)}: ${warnings.map(flag=>flag.message).join('; ')}`,wristband:row.wristband??undefined,warningKinds:warnings.flatMap(flag=>flag.warningKind?[flag.warningKind]:[]),
      ...(row.team?{...teamOf(row),warnings:warnings.map(flag=>flag.message)}:{})});
    if(row.flags.some(flag=>flag.kind==='added-at-finish' && !flag.checked)) items.push({id:`added:${row.raceId}:${row.entryId}`,kind:'added-at-finish',raceId:row.raceId,entryId:row.entryId,at:changed(race,'finish',row.entryId,[],race.leadTimes?.[`added:${row.entryId}`]),message:`${resultName(row)}: Added at the finish`,wristband:row.wristband??undefined,...teamOf(row)});
    if(row.flags.some(flag=>flag.kind==='ran-twice')) {
      const copies=rows.filter(other=>resultHolder(other)===resultHolder(row) && other.flags.some(flag=>flag.kind==='ran-twice') && active.some(race=>race.id===other.raceId));
      items.push({id:`ran-twice:${row.raceId}:${row.entryId}`,kind:'ran-twice',raceId:row.raceId,entryId:row.entryId,at:latest(copies.map(other=>changed(active.find(race=>race.id===other.raceId)!,'runners',other.entryId,['correct-number','correct-runners','correct-finish-order','count-result','disqualify','lift-disqualification']))),message:`${resultName(row)}: Ran twice in this event`,wristband:row.wristband??undefined,...teamOf(row)});
    }
  }
  for(const tie of ties) items.push({id:`tie:${tie.id}`,kind:'tie',tieId:tie.id,at:latest([...tie.entries.flatMap(entry=>{const race=active.find(race=>race.id===entry.raceId)!;return [changed(race,'finish'),changed(race,'times')];}),...(state.auditNotes||[]).filter(note=>['disqualify','lift-disqualification','correct-number','count-result','correct-times','accept-times','correct-runners','correct-finish-order','restore-race','delete-race','delete-race-permanently','re-run'].includes(note.action)).map(note=>note.at)]),message:`Tie at ${formatTime(tie.time)}: ${tie.entries.map(resultName).join(', ')}`,tie:{time:tie.time,names:tie.entries.map(resultName),...(tie.entries.some(entry=>entry.team)?{teams:tie.entries.flatMap(entry=>entry.team?[entry.team]:[])}:{})}});
  return items.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
}
