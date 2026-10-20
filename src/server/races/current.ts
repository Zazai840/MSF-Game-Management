import type { DayEvent } from '../../shared/day.js';
import { currentRaceLabel,type CurrentRace } from '../../shared/race-screen.js';
import { Refusal } from '../access/permissions.js';
import { readCompletedStages } from '../rulings/stages.js';
import { jobRace,listRaces,type Database,type StoredRace } from './records.js';
const emptyParts:CurrentRace['parts']={runners:{version:0,value:null},finish:{version:0,value:null},times:{version:0,value:null}};
/**
 * Each event's current race, by event id: its latest stored race that is not saved (or deleted), one with check-ins
 * first, else the next
 * heat or race by its counter, which is not stored until its first check-in. Once heats are complete it is the final.
 */
export async function currentRaces(db:Database,dayId:string,events:readonly DayEvent[],dayRaces?:StoredRace[]):Promise<Map<string,CurrentRace>> {
  const races=dayRaces||await listRaces(db,dayId),stages=await readCompletedStages(db,dayId);
  const counters=(await db.query('SELECT c.event_id,c.kind,c.last_number FROM race_counters c JOIN events e ON e.id=c.event_id WHERE e.day_id=$1',[dayId])).rows;
  return new Map(events.map((event):[string,CurrentRace]=>{
    const kind=event.format==='timed'?'race':stages.some(stage=>stage.eventId===event.id && stage.stage==='heats')?'final':'heat';
    const own=races.filter(race=>race.event.id===event.id && race.kind===kind).sort((a,b)=>a.number-b.number);
    // A race Restore brings back goes before a later one left with nobody checked in. An event's one final stays current once saved.
    const unsaved=own.filter(race=>race.state!=='saved');
    const stored=unsaved.filter(race=>race.parts.runners.value?.length).at(-1) ?? unsaved.at(-1) ?? (kind==='final'?own.at(-1):undefined);
    if(stored) {const {id,number,state,parts,final}=jobRace(stored);return [event.id,{id,kind,number,state,parts,...(final?{final}:{})}];}
    const last=counters.find(counter=>counter.event_id===event.id && counter.kind===kind)?.last_number??0;
    return [event.id,{id:null,kind,number:last+1,state:'in progress',parts:emptyParts}];
  }));
}
/** Re-run and Restore make a race the event's current race, so they wait while its current race has check-ins. */
export async function requireCurrentUnstarted(db:Database,dayId:string,event:DayEvent,command:'re-run'|'restore') {
  const race=(await currentRaces(db,dayId,[event])).get(event.id)!;
  if(race.state!=='saved' && race.parts.runners.value?.length) throw new Refusal(409,`${currentRaceLabel(race)} is in progress - ${command} after it's saved`);
}
