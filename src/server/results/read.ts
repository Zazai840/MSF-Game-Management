import type { Database } from '../races/records.js';
import { listRaces } from '../races/records.js';
import type { EventState } from '../../shared/results-rules.js';
import { eventResults } from '../../shared/results-rules.js';
import type { EventSummary,ResultsRead,EventResultsRead } from '../../shared/lead-results.js';
import type { DayEvent } from '../../shared/day.js';
import type { RaceRead } from '../../shared/races.js';
import { Refusal } from '../access/permissions.js';
async function eventsForDay(db:Database,dayId:string):Promise<DayEvent[]> {
  return (await db.query('SELECT id,code,name,section,format,enabled FROM events WHERE day_id=$1 ORDER BY programme_order,code',[dayId])).rows;
}
/** Storage adapter: the pure module receives facts, never pre-ranked rows. */
export function eventState(event:DayEvent,races:readonly RaceRead[]):EventState {
  return {event,races:races.filter(race=>race.event.id===event.id).map(race=>({id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt,deleted:race.deleted,runners:race.parts.runners.value||[],finish:race.parts.finish.value,times:race.parts.times.value}))};
}
export async function readResults(db:Database,dayId:string):Promise<ResultsRead> {
  const events=await eventsForDay(db,dayId),races=await listRaces(db,dayId);
  const day=(await db.query('SELECT events_confirmed FROM olympics_days WHERE id=$1',[dayId])).rows[0];
  const groups=new Map<string,EventSummary[]>();
  for(const event of events) {
    const results=eventResults(eventState(event,races));
    const rows=groups.get(event.name)||[];rows.push({event,status:results.status,raceCount:results.raceCount,provisional:results.provisional});groups.set(event.name,rows);
  }
  return {eventsConfirmed:day.events_confirmed,groups:[...groups].map(([name,events])=>({name,events}))};
}
export async function readEventResults(db:Database,dayId:string,code:string):Promise<EventResultsRead> {
  const event=(await eventsForDay(db,dayId)).find(event=>event.code===code);
  if(!event) throw new Refusal(404,'Event not found');
  return {event,results:eventResults(eventState(event,await listRaces(db,dayId)))};
}
