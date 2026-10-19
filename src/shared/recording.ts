import { hasClash } from './race-clashes.js';
import { notCountedReasons } from './race-counts.js';
import type { RaceRead,RaceRecording } from './races.js';
export function raceRecording(race:Pick<RaceRead,'kind'|'parts'>):RaceRecording {
  const finish=race.parts.finish.value,times=race.parts.times.value;
  const reasons=notCountedReasons({kind:race.kind,clash:hasClash(race),finish,times});
  const countMismatch=finish && times && reasons.includes("finishers and times don't agree")?`Finish order has ${finish.order.length} finishers, times have ${times.places.filter(time=>time!==null).length} - check the recording`:null;
  return {countMismatch,readyForRanking:reasons.length===0,results:(race.parts.runners.value||[]).map(runner=>{
    const index=finish?.order.indexOf(runner.id)??-1;
    return {entryId:runner.id,wristband:runner.wristband,place:index<0?null:index+1,time:race.kind==='final' || index<0?null:times?.places[index]??null};
  })};
}
type RecordingRace=Pick<RaceRead,'kind'|'deleted'|'stageComplete'|'parts'|'recording'>;
/** Waiting for times means not counted yet, with times still missing or disagreeing with the finishers. */
export const needsTimes=(race:RecordingRace)=>race.kind!=='final' && !race.deleted && !race.stageComplete && !race.recording.readyForRanking && (race.parts.times.value===null || race.recording.countMismatch!==null);
export const timesWaiting=<T extends RecordingRace>(races:T[])=>races.filter(needsTimes).sort((left,right)=>Number(!!right.recording.countMismatch)-Number(!!left.recording.countMismatch));
