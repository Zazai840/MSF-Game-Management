import { hasClash } from './race-clashes.js';
import type { RaceRead,RaceRecording } from './races.js';
import { timesOutOfOrder } from './time-entry.js';
export function raceRecording(race:Pick<RaceRead,'kind'|'parts'>):RaceRecording {
  const finish=race.parts.finish.value,times=race.parts.times.value;
  const count=times?.places.filter(time=>time!==null).length;
  const countMismatch=race.kind!=='final' && finish && times && finish.order.length!==count?`Finish order has ${finish.order.length} finishers, times have ${count} - check the recording`:null;
  return {countMismatch,readyForRanking:!hasClash(race) && finish!==null && (race.kind==='final' || (times!==null && !timesOutOfOrder(times.places) && !countMismatch)),results:(race.parts.runners.value||[]).map(runner=>{
    const index=finish?.order.indexOf(runner.id)??-1;
    return {entryId:runner.id,wristband:runner.wristband,place:index<0?null:index+1,time:race.kind==='final' || index<0?null:times?.places[index]??null};
  })};
}
export const needsTimes=(race:RaceRead)=>race.kind!=='final' && !race.deleted && !race.stageComplete && (race.parts.times.value===null || race.recording.countMismatch!==null);
export const timesWaiting=(races:RaceRead[])=>races.filter(needsTimes).sort((left,right)=>Number(!!right.recording.countMismatch)-Number(!!left.recording.countMismatch));
