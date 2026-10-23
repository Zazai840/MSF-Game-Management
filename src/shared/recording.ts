import { notCountedReasons } from './race-counts.js';
import { isTeamEntry,type RaceRead,type RaceRecording } from './races.js';
export function raceRecording(race:Pick<RaceRead,'kind'|'state'|'parts'>):RaceRecording {
  const finish=race.parts.finish.value,times=race.parts.times.value;
  const reasons=notCountedReasons({kind:race.kind,saved:race.state==='saved',finish,times});
  // Worked out apart from the saved mark, so a lead's correction shows it before the race counts.
  const timed=times?.places.filter(time=>time!==null).length;
  const countMismatch=finish && times && race.kind!=='final' && finish.order.length!==timed?`Finish order has ${finish.order.length} finishers, times have ${timed} - check the recording`:null;
  return {countMismatch,readyForRanking:reasons.length===0,results:(race.parts.runners.value||[]).map(runner=>{
    const index=finish?.order.indexOf(runner.id)??-1;
    return {entryId:runner.id,wristband:isTeamEntry(runner)?null:runner.wristband,place:index<0?null:index+1,time:race.kind==='final' || index<0?null:times?.places[index]??null};
  })};
}
