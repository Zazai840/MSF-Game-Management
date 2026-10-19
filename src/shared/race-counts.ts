import type { NotRankedReason,ResultsRace } from './results-rules.js';
import { timesOutOfOrder } from './time-entry.js';
export type CountingRace=Pick<ResultsRace,'kind'|'clash'|'finish'|'times'>;
/**
 * The one rule for whether a race's results count: why it does not count yet, in the order
 * Results shows them. A final needs only its finishing order. The race counts when there is none.
 */
export function notCountedReasons(race:CountingRace):NotRankedReason[] {
  const reasons:NotRankedReason[]=[];
  if(race.clash) reasons.push('two versions, lead to check');
  if(!race.finish) reasons.push(race.times?'awaiting finishing order':'checked in');
  if(race.kind==='final') return reasons;
  if(race.finish && !race.times) reasons.push('awaiting times');
  if(race.times && timesOutOfOrder(race.times.places) && race.times.acceptedByLead!==true) reasons.push('times out of order');
  if(race.finish && race.times && race.finish.order.length!==race.times.places.filter(time=>time!==null).length) reasons.push("finishers and times don't agree");
  return reasons;
}
export const raceCounts=(race:CountingRace)=>notCountedReasons(race).length===0;
