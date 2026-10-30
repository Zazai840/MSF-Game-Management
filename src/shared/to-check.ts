import type { DayLeadItem } from './lead-results.js';
import { plainWristbandWarning,type WristbandWarning } from './wristband-checks.js';
import { formatTime } from './time-entry.js';
import { raceLabel } from './races.js';
import { ordinal } from './ordinal.js';
import { capitalised,entryNoun } from './teams.js';
import { raceName } from './race-flow.js';
export interface ToCheckWording { race:string; title:string; explanation:string }
/** "2004", "2004 and 2005", "2004, 2005 and 2006". */
export const listed=(names:readonly string[])=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names[names.length-1]}`;
function wording(item:DayLeadItem):Omit<ToCheckWording,'race'> {
  switch(item.kind) {
    case 'times-out-of-order': {
      const wrong=item.wrongTime;
      return {title:'A time looks wrong',explanation:wrong?`${ordinal(wrong.place)} place (${formatTime(wrong.time)}) is faster than ${ordinal(wrong.earlierPlace)} (${formatTime(wrong.earlierTime)}). The timer kept it as typed.`:item.message};
    }
    case 'warning': {
      // A team's children's warnings are kept in the volunteer's words already.
      if(item.team!==undefined && item.warnings) return {title:'A wristband number needs checking',explanation:`In Team ${item.team}: ${item.warnings.join(' ')} Correct it or mark it checked.`};
      const wristband=item.wristband;
      // A child's warnings are only ever about its wristband.
      const plain=wristband!==undefined && item.warningKinds?.length?item.warningKinds.map(kind=>plainWristbandWarning({kind:kind as WristbandWarning['kind']},wristband,item.event.section)).join(' '):null;
      return {title:'A wristband number needs checking',explanation:plain?`${plain} Correct it or mark it checked.`:item.message};
    }
    case 'two-relays':
      return {title:'A child is in two relays',explanation:item.message};
    case 'ran-short':
      return {title:'A team ran short',explanation:item.message};
    case 'added-at-finish':
      if(item.team!==undefined) return {title:'A team was added at the finish',explanation:`Team ${item.team} crossed the line but was not checked in at the start. Check it ran in this race.`};
      return {title:'A runner was added at the finish',explanation:item.wristband!==undefined?`${item.wristband} crossed the line but was not checked in at the start. Check they ran in this race.`:item.message};
    case 'ran-twice': {
      const name=item.team!==undefined?`Team ${item.team}`:item.wristband;
      return {title:`A ${entryNoun(item.team!==undefined)} ran twice`,explanation:name!==undefined?`${name} has a result in more than one race of this event. Choose which result counts.`:item.message};
    }
    case 'tie':
      return {title:`${capitalised(entryNoun(item.event.relay))}s tied on time`,explanation:item.tie?`${listed(item.tie.names)} ${item.tie.names.length===2?'both':'all'} have ${formatTime(item.tie.time)}. Decide whether a run-off is needed.`:item.message};
  }
}
/** How the To check list words one lead queue item: where it is, what went wrong, and what the lead decides. */
export function toCheckWording(item:DayLeadItem):ToCheckWording {
  const event=`${item.event.code} · ${item.event.name} ${item.event.section}`;
  return {race:item.race?`${event} · ${raceLabel(item.race)}`:event,...wording(item)};
}
/** The To check heading, counting what is waiting. */
export const toCheckHeading=(count:number)=>count===0?'Nothing to check':count===1?'1 thing needs a zone lead':`${count} things need a zone lead`;
const counted=(count:number,one:string,many=`${one}s`)=>`${count} ${count===1?one:many}`;
/** One kind of item, counted for a lead's card: "9 wristbands to check". */
function countedWording(item:DayLeadItem,count:number) {
  const team=item.team!==undefined;
  switch(item.kind) {
    case 'times-out-of-order': return `${counted(count,'time')} to check`;
    case 'warning': return `${counted(count,'wristband')} to check`;
    case 'two-relays': return `${counted(count,'child','children')} in two relays`;
    case 'ran-short': return `${counted(count,'team')} ran short`;
    case 'added-at-finish': return `${counted(count,entryNoun(team))} added at the finish`;
    case 'ran-twice': return `${counted(count,entryNoun(team))} ran twice`;
    case 'tie': return `${counted(count,'tie')} to decide`;
  }
}
/** A lead's card line: its items grouped by race and kind and counted, two groups then how many more ("Heat 2: 9 wristbands to check · 3 more"). */
export function issueLine(items:readonly DayLeadItem[]) {
  const groups=new Map<string,DayLeadItem[]>();
  for(const item of items) {const key=`${item.race?.id??''}:${item.kind}`;groups.set(key,[...groups.get(key)||[],item]);}
  const lines=[...groups.values()].map(group=>`${group[0].race?raceName(group[0].race):'Event'}: ${countedWording(group[0],group.length)}`);
  return lines.slice(0,2).join(' · ')+(lines.length>2?` · ${lines.length-2} more`:'');
}
