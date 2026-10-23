import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { Phone } from '../../shared/domain.js';
import type { DayEvent } from '../../shared/day.js';
import { resultName,type LeaderboardRow } from '../../shared/results-rules.js';
import type { FinalEntry } from '../../shared/finals.js';
import { isTeamEntry,type RaceEntry } from '../../shared/races.js';
import { actions,Refusal } from '../access/permissions.js';
import { readRace,requireStageOpen,listRaces,type StoredRace } from '../races/records.js';
import { publishPart } from '../races/versions.js';
import { readEventResults } from '../results/read.js';
import { rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
/**
 * A qualifier's or call-up's entry in the final: a child by wristband, or a relay team with the four children who ran
 * its heat, none marked here yet.
 */
function finalist(races:readonly StoredRace[],row:LeaderboardRow,id:string):RaceEntry {
  if(!row.team) return {id,wristband:row.wristband!};
  // shortcut: a relay final copies each team's children from its heat entry; #145 copies them from the team list as it stands when the final is stored.
  const heat=races.find(race=>race.id===row.raceId)?.parts.runners.value?.find(entry=>entry.id===row.entryId);
  return {id,team:{id:row.team.id,number:row.team.number},legs:heat && isTeamEntry(heat)?heat.legs.map(leg=>({...leg,here:false})):row.team.wristbands.map(wristband=>({wristband,warnings:[],here:false}))};
}
/** Reuses the sole active unrun final; fresh entry IDs invalidate obsolete Here / Absent and Finish writes. */
export async function seedFinal(client:pg.PoolClient,phone:Phone,event:DayEvent,qualifiers:readonly LeaderboardRow[]) {
  const races=await listRaces(client,phone.dayId),existing=races.find(race=>race.event.id===event.id && race.kind==='final');
  if(existing?.final?.hasRun) return;
  await client.query("DELETE FROM event_stages WHERE event_id=$1 AND stage='final'",[event.id]);
  // Holds carry over from heat to heat, but the final starts with nobody holding anything.
  await client.query('DELETE FROM job_holds WHERE event_id=$1',[event.id]);
  const id=existing?.id||randomUUID();
  const entries:FinalEntry[]=qualifiers.map((row,index)=>({finalEntryId:randomUUID(),heatRaceId:row.raceId,heatEntryId:row.entryId,heatWristband:row.wristband,heatRank:row.position!,seed:index+1,kind:'qualifier',absent:false}));
  const runners=entries.map((entry,index)=>finalist(races,qualifiers[index],entry.finalEntryId));
  if(existing) {
    await publishPart(client,phone,existing,'runners',runners);
    await publishPart(client,phone,existing,'finish',null);
  } else {
    const counter=(await client.query('INSERT INTO race_counters(event_id,kind,last_number) VALUES($1,\'final\',1) ON CONFLICT(event_id,kind) DO UPDATE SET last_number=race_counters.last_number+1 RETURNING last_number',[event.id])).rows[0];
    await client.query('INSERT INTO races(id,day_id,event_id,kind,number,original_runners) VALUES($1,$2,$3,\'final\',$4,$5)',[id,phone.dayId,event.id,counter.last_number,JSON.stringify(runners.map(runner=>isTeamEntry(runner)?runner.legs.map(leg=>leg.wristband):runner.wristband))]);
    for(const part of ['runners','finish','times']) await client.query('INSERT INTO race_parts(race_id,part,version,value,saved_by,saved_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())',[id,part,part==='runners'?1:0,part==='runners'?JSON.stringify(runners):null,phone.id]);
  }
  await client.query("INSERT INTO race_finals(race_id,entries,generation) VALUES($1,$2,$3) ON CONFLICT(race_id) DO UPDATE SET entries=EXCLUDED.entries,additional_entries='[]',generation=EXCLUDED.generation",[id,JSON.stringify(entries),randomUUID()]);
}
export function finalRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('POST','/api/lead/events/:code/call-up','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false);
    if(typeof value.expectedHeatEntryId!=='string') throw new Refusal(400,'Choose the suggested next-ranked runner');
    return rulingChange(pool,phone,async(client,current)=>{
      const detail=await readEventResults(client,current.dayId,(request.params as {code:string}).code),final=detail.results.finalResults;
      if(!final || !final.heatsComplete || final.hasRun || !final.vacancy || !final.nextCallUp) throw new Refusal(409,'There is no open place to call up a runner');
      const race=await readRace(client,current.dayId,final.raceId);requireStageOpen(race);
      const next=final.nextCallUp;if(next.entryId!==value.expectedHeatEntryId) throw new Refusal(409,'The next-ranked runner has changed - check the suggestion again');
      const entry:FinalEntry={finalEntryId:randomUUID(),heatRaceId:next.raceId,heatEntryId:next.entryId,heatWristband:next.wristband,heatRank:next.position!,seed:final.vacancy.seed,kind:'call-up',absent:false,replacesEntryId:final.vacancy.finalEntryId};
      const runners=[...(race.parts.runners.value||[]),finalist(await listRaces(client,current.dayId),next,entry.finalEntryId)];
      await client.query('UPDATE race_finals SET entries=$1 WHERE race_id=$2',[JSON.stringify([...final.entries,entry]),race.id]);
      await publishPart(client,current,race,'runners',runners);
      // shortcut: the absent finalist is named by wristband, so on a relay it reads "null"; #145 names the absent team.
      await writeAuditNote(client,current,detail.event.id,{action:'call-up',comment,message:`${current.name} called up ${resultName(next)} (heat rank ${next.position}) for absent ${final.vacancy.heatWristband}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id,entryId:entry.finalEntryId},{raceId:next.raceId,entryId:next.entryId}]});
      return {status:'saved',...await readEventResults(client,current.dayId,detail.event.code)};
    });
  });
}
