import { readCompletedStages } from '../rulings/stages.js';
import type { Stage } from '../../shared/stages.js';
import { hasClash } from '../../shared/race-clashes.js';
import type { AuditNote,RunnerRuling } from '../../shared/rulings.js';
import { readAuditNotes,readRulings } from '../rulings/records.js';
import type { Database } from '../races/records.js';
import { listRaces } from '../races/records.js';
import type { EventState } from '../../shared/results-rules.js';
import { eventResults } from '../../shared/results-rules.js';
import type { EventSummary,ResultsRead,EventResultsRead } from '../../shared/lead-results.js';
import type { DayEvent } from '../../shared/day.js';
import type { RaceRead } from '../../shared/races.js';
import { Refusal } from '../access/permissions.js';
import type { TieSettlement } from '../../shared/ties.js';
import { readTieSettlements } from '../rulings/ties.js';
async function eventsForDay(db:Database,dayId:string):Promise<DayEvent[]> {
  return (await db.query('SELECT id,code,name,section,format,enabled FROM events WHERE day_id=$1 ORDER BY programme_order,code',[dayId])).rows;
}
/** Storage adapter: the pure module receives facts, never pre-ranked rows. */
export function eventState(event:DayEvent,races:readonly RaceRead[],rulings:readonly RunnerRuling[]=[],auditNotes:readonly AuditNote[]=[],tieSettlements:readonly TieSettlement[]=[],completedStages:readonly Stage[]=[]):EventState {
  return {event,rulings,auditNotes,tieSettlements,completedStages,races:races.filter(race=>race.event.id===event.id).map(race=>({id:race.id,kind:race.kind,number:race.number,checkedInAt:race.checkedInAt,deleted:race.deleted,clash:hasClash(race),runners:race.parts.runners.value||[],finish:race.parts.finish.value,times:race.parts.times.value}))};

}
export async function readResults(db:Database,dayId:string):Promise<ResultsRead> {
  const events=await eventsForDay(db,dayId),races=await listRaces(db,dayId);
  const rulings=await readRulings(db,dayId),notes=await readAuditNotes(db,dayId);
  const tieSettlements=await readTieSettlements(db,dayId);
  const stages=await readCompletedStages(db,dayId);
  const day=(await db.query('SELECT events_confirmed FROM olympics_days WHERE id=$1',[dayId])).rows[0];
  const groups=new Map<string,EventSummary[]>();
  for(const event of events) {
    const results=eventResults(eventState(event,races,rulings,notes,tieSettlements.filter(settlement=>settlement.eventId===event.id),stages.filter(stage=>stage.eventId===event.id).map(stage=>stage.stage)));
    const rows=groups.get(event.name)||[];rows.push({event,status:results.status,raceCount:results.raceCount,provisional:results.provisional,latestNoteAt:notes.find(note=>note.eventId===event.id)?.at??null});groups.set(event.name,rows);
  }
  return {eventsConfirmed:day.events_confirmed,groups:[...groups].map(([name,events])=>({name,events}))};
}
export async function readEventResults(db:Database,dayId:string,code:string):Promise<EventResultsRead> {
  const event=(await eventsForDay(db,dayId)).find(event=>event.code===code);
  if(!event) throw new Refusal(404,'Event not found');
  const auditNotes=(await readAuditNotes(db,dayId)).filter(note=>note.eventId===event.id);
  const tieSettlements=(await readTieSettlements(db,dayId)).filter(settlement=>settlement.eventId===event.id);
  const stages=(await readCompletedStages(db,dayId)).filter(stage=>stage.eventId===event.id).map(stage=>stage.stage);
  return {event,auditNotes,results:eventResults(eventState(event,await listRaces(db,dayId),await readRulings(db,dayId),auditNotes,tieSettlements,stages))};
}
