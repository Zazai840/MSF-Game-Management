import type { EventState,LeaderboardRow,ResultTie,LeadItem,ResultsRace } from './results-rules.js';
import { isOpenEligibilityWarning } from './runner-rulings.js';
import { formatTime } from './time-entry.js';
import { notCountedReasons } from './race-counts.js';
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
/** Canonical lead queue, shared by live counts and stage check sheets, including unfinished races. */
export function eventLeadItems(state:EventState,rows:readonly LeaderboardRow[],ties:readonly ResultTie[]):LeadItem[] {
  const active=state.races.filter(race=>!race.deleted);
  const changed=(race:ResultsRace,part:'runners'|'finish'|'times'|'clash',entryId?:string,actions:readonly string[]=[],introducedAt?:string)=>latest([introducedAt||race.leadTimes?.[part]||race.checkedInAt,...(state.auditNotes||[]).filter(note=>['restore-race',...actions].includes(note.action) && note.touches.some(touch=>touch.raceId===race.id && (!entryId || !touch.entryId || touch.entryId===entryId))).map(note=>note.at)]);
  const items:LeadItem[]=[];
  for(const race of active) {
    const reasons=notCountedReasons(race);
    if(reasons.includes('two versions, lead to check')) items.push({id:`clash:${race.id}`,kind:'clash',raceId:race.id,at:changed(race,'clash'),message:'Two versions - zone lead to check'});
    if(reasons.includes('times out of order')) items.push({id:`times:${race.id}`,kind:'times-out-of-order',raceId:race.id,at:changed(race,'times'),message:'Times out of order',wrongTime:firstWrongTime(race.times!.places)});
  }
  for(const row of rows) {
    const race=active.find(race=>race.id===row.raceId);if(!race) continue;
    const warnings=row.flags.filter(isOpenEligibilityWarning);
    if(warnings.length) items.push({id:`warning:${row.raceId}:${row.entryId}`,kind:'warning',raceId:row.raceId,entryId:row.entryId,at:changed(race,'runners',row.entryId,['correct-number','correct-runners','lift-disqualification'],race.leadTimes?.[`warning:${row.entryId}`]),message:`${row.wristband}: ${warnings.map(flag=>flag.message).join('; ')}`,wristband:row.wristband,warningKinds:warnings.flatMap(flag=>flag.warningKind?[flag.warningKind]:[])});
    if(row.flags.some(flag=>flag.kind==='added-at-finish' && !flag.checked)) items.push({id:`added:${row.raceId}:${row.entryId}`,kind:'added-at-finish',raceId:row.raceId,entryId:row.entryId,at:changed(race,'finish',row.entryId,[],race.leadTimes?.[`added:${row.entryId}`]),message:`${row.wristband}: Added at the finish`,wristband:row.wristband});
    if(row.flags.some(flag=>flag.kind==='ran-twice')) {
      const copies=rows.filter(other=>other.wristband===row.wristband && other.flags.some(flag=>flag.kind==='ran-twice'));
      items.push({id:`ran-twice:${row.raceId}:${row.entryId}`,kind:'ran-twice',raceId:row.raceId,entryId:row.entryId,at:latest(copies.map(other=>changed(active.find(race=>race.id===other.raceId)!,'runners',other.entryId,['correct-number','correct-runners','count-result','disqualify','lift-disqualification']))),message:`${row.wristband}: Ran twice in this event`,wristband:row.wristband});
    }
  }
  for(const tie of ties) items.push({id:`tie:${tie.id}`,kind:'tie',tieId:tie.id,at:latest([...tie.entries.flatMap(entry=>{const race=active.find(race=>race.id===entry.raceId)!;return [changed(race,'finish'),changed(race,'times')];}),...(state.auditNotes||[]).filter(note=>['disqualify','lift-disqualification','correct-number','count-result','correct-times','accept-times','correct-runners','restore-race','delete-race','delete-race-permanently','re-run'].includes(note.action) || note.action.startsWith('Chose ')).map(note=>note.at)]),message:`Tie at ${formatTime(tie.time)}: ${tie.entries.map(entry=>entry.wristband).join(', ')}`,tie:{time:tie.time,wristbands:tie.entries.map(entry=>entry.wristband)}});
  return items.sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
}
