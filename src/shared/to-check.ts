import type { DayLeadItem,ResultsTarget } from './lead-results.js';
import { plainWristbandWarning,type WristbandWarning } from './wristband-checks.js';
import { formatTime } from './time-entry.js';
import { openRaceLabel,raceLabel,type RaceRead } from './races.js';
import { ordinal } from './ordinal.js';
import { capitalised,entryNoun } from './teams.js';
import { raceName } from './race-flow.js';
import { teamLine,type EventResults,type ResultEntry } from './results-rules.js';
export interface ToCheckWording { race:string; title:string; explanation:string }
/**
 * An event's open To check items as the To check wording takes them, in the event read's order: each with its event
 * and its race. The day's To check list, the event's screen and a race page all take their items from here.
 */
export function eventItems({event,results}:{event:DayLeadItem['event'];results:Pick<EventResults,'needsYou'|'races'>}):DayLeadItem[] {
  return results.needsYou.map(item=>{const race=results.races.find(({race})=>race.id===item.raceId)?.race;return {...item,event,...(race?{race}:{})};});
}
/** A race's open To check items: its own, and each tie it is in. */
export const raceItems=(items:readonly DayLeadItem[],raceId:string)=>items.filter(item=>item.raceId===raceId || item.tie?.raceIds.includes(raceId));
/**
 * On a relay, each team an item is about with its four children, "Team 5 · 2101 · 2134 · 2187 · –": both tied teams, or
 * the team whose result the item names (looked up in the event's result `rows`). Nothing for a child's item.
 */
export function itemTeams(item:Pick<DayLeadItem,'raceId'|'entryId'|'tie'>,rows:readonly ResultEntry[]):string[] {
  if(item.tie?.teams) return item.tie.teams.map(teamLine);
  const team=rows.find(row=>row.raceId===item.raceId && row.entryId===item.entryId)?.team;
  return team?[teamLine(team)]:[];
}
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
/** One kind of item as a count and its noun: "9 wristbands", "1 team". */
function countedNoun(item:DayLeadItem,count:number) {
  switch(item.kind) {
    case 'times-out-of-order': return counted(count,'time');
    case 'warning': return counted(count,'wristband');
    case 'two-relays': return counted(count,'child','children');
    case 'ran-short': return counted(count,'team');
    case 'added-at-finish': case 'ran-twice': return counted(count,entryNoun(item.team!==undefined));
    case 'tie': return counted(count,'tie');
  }
}
const kindWords:Record<DayLeadItem['kind'],string>={'times-out-of-order':'to check',warning:'to check','two-relays':'in two relays','ran-short':'ran short','added-at-finish':'added at the finish','ran-twice':'ran twice',tie:'to decide'};
/** A card's open items grouped by race and kind, in the items' order. An event's ties have no race: they are one group. */
function issueGroups(items:readonly DayLeadItem[]) {
  const groups=new Map<string,DayLeadItem[]>();
  for(const item of items) {const key=`${item.race?.id??''}:${item.kind}`;groups.set(key,[...groups.get(key)||[],item]);}
  return [...groups.values()];
}
/** A lead's card line: its items grouped by race and kind and counted, two groups then how many more ("Heat 2: 9 wristbands to check · 3 more"). */
export function issueLine(items:readonly DayLeadItem[]) {
  const lines=issueGroups(items).map(group=>`${group[0].race?raceName(group[0].race):'Event'}: ${countedNoun(group[0],group.length)} ${kindWords[group[0].kind]}`);
  return lines.slice(0,2).join(' · ')+(lines.length>2?` · ${lines.length-2} more`:'');
}
/** The kinds "It's right" accepts. A child who ran twice and a tie are settled on their own screens. */
export const acceptable=({kind}:Pick<DayLeadItem,'kind'>)=>kind!=='ran-twice' && kind!=='tie';
/** The correction that fixes a place: a final's places are in its finishing order, any other race's in its times. */
export const placesCorrection=(final:boolean)=>final?'correct-finishing-order':'correct-times';
const decideTheTie='Decide the tie';
/**
 * A problem's one button: its words and the screen it opens. On the race page (`on`, the race) each problem opens the
 * correction that fits it; on the event (no `on`) it opens the problem's race page. A tie opens the tie on both.
 */
export function problemFix(item:Pick<DayLeadItem,'kind'|'race'>,on?:{kind:RaceRead['kind'];relay:boolean}) {
  if(item.kind==='tie') return {label:decideTheTie,opens:'tie'} as const;
  if(!on) return {label:item.race?openRaceLabel(item.race):'Open race',opens:'race-page'} as const;
  if(item.kind==='ran-twice') return {label:'Fix',opens:'choose-result'} as const;
  if(item.kind==='times-out-of-order') return {label:'Fix time',opens:placesCorrection(on.kind==='final')} as const;
  return {label:'Fix',opens:on.relay?'correct-teams':'correct-runner-list'} as const;
}
export interface ProblemButton { label:string; target:ResultsTarget }
/**
 * A lead's card problem buttons, one per group of the card line: "Decide the tie" opens the tie (the event in Results
 * when there is more than one), "Check Heat 1 · 1 time" opens that race's page.
 */
export function problemButtons(items:readonly DayLeadItem[]):ProblemButton[] {
  return issueGroups(items).map(group=>{
    const [first]=group,{event,race}=first;
    if(first.kind==='tie') return {label:decideTheTie,target:group.length===1?{event,tieId:first.tieId}:{event}};
    return {label:`Check ${race?raceName(race):'event'} · ${countedNoun(first,group.length)}`,target:race?{event,raceId:first.raceId}:{event}};
  });
}
