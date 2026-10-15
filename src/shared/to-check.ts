import type { DayLeadItem } from './lead-results.js';
import type { ClashSaver } from './results-rules.js';
import { plainWristbandWarning } from './wristband-checks.js';
import { formatTime } from './time-entry.js';
import { raceLabel } from './races.js';
import { ordinal } from './ordinal.js';
export interface ToCheckWording { race:string; title:string; explanation:string }
const counted=['Two','Three','Four','Five'];
const listed=(names:readonly string[])=>names.length<2?names.join(''):`${names.slice(0,-1).join(', ')} and ${names[names.length-1]}`;
const partWords={runners:'runner lists',finish:'finishing orders',times:'sets of times'} as const;
function apart(savers:readonly ClashSaver[]) {
  const times=savers.map(saver=>Date.parse(saver.at)).filter(Number.isFinite);
  const minutes=times.length?Math.floor((Math.max(...times)-Math.min(...times))/60000):0;
  if(minutes<1) return 'less than a minute apart';
  if(minutes===1) return 'a minute apart';
  if(minutes<60) return `${minutes} minutes apart`;
  const hours=Math.floor(minutes/60);
  return hours===1?'over an hour apart':`${hours} hours apart`;
}
function wording(item:DayLeadItem):Omit<ToCheckWording,'race'> {
  switch(item.kind) {
    case 'clash': {
      const clash=item.clash?.length===1?item.clash[0]:null;
      if(!clash) return {title:'Two different versions were saved',explanation:'Open the race and choose which one stands.'};
      const named=clash.savers.map((saver,index)=>saver.name || (index===0?'someone':'someone else'));
      const one=clash.savers[0].name && clash.savers.every(saver=>saver.name===clash.savers[0].name)?clash.savers[0].name:null;
      const by=one?`Saved ${named.length===2?'twice':`${named.length} times`} by ${one}`:`Saved by ${listed(named)}`;
      return {title:`${counted[clash.savers.length-2]||clash.savers.length} different ${partWords[clash.part]} were saved`,explanation:`${by} ${apart(clash.savers)}. Choose which one stands.`};
    }
    case 'times-out-of-order': {
      const wrong=item.wrongTime;
      return {title:'A time looks wrong',explanation:wrong?`${ordinal(wrong.place)} place (${formatTime(wrong.time)}) is faster than ${ordinal(wrong.earlierPlace)} (${formatTime(wrong.earlierTime)}). The timer kept it as typed.`:item.message};
    }
    case 'warning': {
      const wristband=item.wristband;
      const plain=wristband!==undefined && item.warningKinds?.length?item.warningKinds.map(kind=>plainWristbandWarning({kind},wristband,item.event.section)).join(' '):null;
      return {title:'A wristband number needs checking',explanation:plain?`${plain} Correct it or mark it checked.`:item.message};
    }
    case 'added-at-finish':
      return {title:'A runner was added at the finish',explanation:item.wristband!==undefined?`${item.wristband} crossed the line but was not checked in at the start. Check they ran in this race.`:item.message};
    case 'ran-twice':
      return {title:'A runner ran twice',explanation:item.wristband!==undefined?`${item.wristband} has a result in more than one race of this event. Choose which result counts.`:item.message};
    case 'tie':
      return {title:'Runners tied on time',explanation:item.tie?`${listed(item.tie.wristbands.map(String))} ${item.tie.wristbands.length===2?'both':'all'} have ${formatTime(item.tie.time)}. Decide whether a run-off is needed.`:item.message};
  }
}
/** How the To check list words one lead queue item: where it is, what went wrong, and what the lead decides. */
export function toCheckWording(item:DayLeadItem):ToCheckWording {
  const event=`${item.event.code} · ${item.event.name} ${item.event.section}`;
  return {race:item.race?`${event} · ${raceLabel(item.race)}`:event,...wording(item)};
}
/** The To check heading, counting what is waiting. */
export const toCheckHeading=(count:number)=>count===0?'Nothing to check':count===1?'1 thing needs a zone lead':`${count} things need a zone lead`;
