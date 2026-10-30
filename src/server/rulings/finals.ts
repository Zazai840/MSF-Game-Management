import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { Phone } from '../../shared/domain.js';
import type { DayEvent } from '../../shared/day.js';
import { resultName,type LeaderboardRow } from '../../shared/results-rules.js';
import type { FinalEntry } from '../../shared/finals.js';
import { entryName,isTeamEntry,type RaceEntry } from '../../shared/races.js';
import type { RelayTeam } from '../../shared/teams.js';
import { readTeamLists } from '../relays/teams.js';
import { actions,Refusal } from '../access/permissions.js';
import { readRace,requireStageOpen,listRaces } from '../races/records.js';
import { publishPart } from '../races/versions.js';
import { originalRunners } from '../races/create.js';
import { readEventResults } from '../results/read.js';
import { rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
/**
 * A qualifier's or call-up's entry in the final: a child by wristband, or a relay team with its four children as its
 * team list has them now (a child swapped since its heat runs the final), none marked here yet.
 */
function finalist(teams:readonly RelayTeam[],row:LeaderboardRow,id:string):RaceEntry {
  if(!row.team) return {id,wristband:row.wristband!};
  const team=teams.find(team=>team.id===row.team!.id);
  if(!team) throw new Refusal(409,`Team ${row.team.number} is missing from the team list - ask a lead to check it`);
  return teamEntry(team,id);
}
/** A relay team joining the final with its four children as its team list has them now, none here yet. */
const teamEntry=(team:RelayTeam,id:string):RaceEntry=>({id,team:{id:team.id,number:team.number},legs:team.legs.map(leg=>({...leg,here:false}))});
/** The relay's team list, or none for an event that is not a relay. */
const relayTeams=async(client:pg.PoolClient,dayId:string,eventId:string)=>(await readTeamLists(client,dayId)).get(eventId)?.teams??[];
/** Reuses the sole active unrun final; fresh entry IDs invalidate obsolete Here / Absent and Finish writes. */
export async function seedFinal(client:pg.PoolClient,phone:Phone,event:DayEvent,qualifiers:readonly LeaderboardRow[]) {
  const races=await listRaces(client,phone.dayId),existing=races.find(race=>race.event.id===event.id && race.kind==='final');
  if(existing?.final?.hasRun) return;
  await client.query("DELETE FROM event_stages WHERE event_id=$1 AND stage='final'",[event.id]);
  const id=existing?.id||randomUUID();
  const entries:FinalEntry[]=qualifiers.map((row,index)=>({finalEntryId:randomUUID(),heatRaceId:row.raceId,heatEntryId:row.entryId,heatWristband:row.wristband,heatRank:row.position!,seed:index+1,kind:'qualifier',absent:false}));
  const teams=await relayTeams(client,phone.dayId,event.id),lineup=entries.map((entry,index)=>finalist(teams,qualifiers[index],entry.finalEntryId));
  // A final starts with nobody Here, children and relay teams alike: each is marked at the start line, and only those Here run it.
  const runners:RaceEntry[]=[];
  if(existing) {
    await publishPart(client,phone,existing,'runners',runners);
    await publishPart(client,phone,existing,'finish',null);
  } else {
    const counter=(await client.query('INSERT INTO race_counters(event_id,kind,last_number) VALUES($1,\'final\',1) ON CONFLICT(event_id,kind) DO UPDATE SET last_number=race_counters.last_number+1 RETURNING last_number',[event.id])).rows[0];
    await client.query('INSERT INTO races(id,day_id,event_id,kind,number,original_runners) VALUES($1,$2,$3,\'final\',$4,$5)',[id,phone.dayId,event.id,counter.last_number,originalRunners(lineup)]);
    for(const part of ['runners','finish','times']) await client.query('INSERT INTO race_parts(race_id,part,version,value,saved_by,saved_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())',[id,part,part==='runners'?1:0,part==='runners'?JSON.stringify(runners):null,phone.id]);
  }
  // Keep each runner's copy for Here / Absent without recording attendance while seeding the line-up.
  await client.query("INSERT INTO race_finals(race_id,entries,generation) VALUES($1,$2,$3) ON CONFLICT(race_id) DO UPDATE SET entries=EXCLUDED.entries,additional_entries='[]',generation=EXCLUDED.generation",[id,JSON.stringify(entries.map((entry,index)=>({...entry,runner:lineup[index]}))),randomUUID()]);
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
      const id=randomUUID(),called=finalist(await relayTeams(client,current.dayId,detail.event.id),next,id);
      const entry:FinalEntry={finalEntryId:id,heatRaceId:next.raceId,heatEntryId:next.entryId,heatWristband:next.wristband,heatRank:next.position!,seed:final.vacancy.seed,kind:'call-up',absent:false,runner:called,replacesEntryId:final.vacancy.finalEntryId};
      // A call-up is not marked yet, like every finalist: it runs once marked Here.
      await client.query('UPDATE race_finals SET entries=$1 WHERE race_id=$2',[JSON.stringify([...final.entries,entry]),race.id]);
      // An absent child is named by the wristband seeded; an absent team by its number, from its copy kept when it left.
      const absent=final.vacancy.heatWristband??(final.vacancy.runner?entryName(final.vacancy.runner):'');
      await writeAuditNote(client,current,detail.event.id,{action:'call-up',comment,message:`${current.name} called up ${resultName(next)} (heat rank ${next.position}) for absent ${absent}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id,entryId:entry.finalEntryId},{raceId:next.raceId,entryId:next.entryId}]});
      return {status:'saved',...await readEventResults(client,current.dayId,detail.event.code)};
    });
  });
  // Adding a team to a relay's Final: picked from its team list, it joins the line-up with its four children as they
  // stand now, not marked yet, and check-in shows it as Added.
  action('POST','/api/lead/events/:code/add-team','Lead',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false);
    if(typeof value.teamId!=='string') throw new Refusal(400,'Choose a team');
    return rulingChange(pool,phone,async(client,current)=>{
      const detail=await readEventResults(client,current.dayId,(request.params as {code:string}).code),final=detail.results.finalResults;
      if(!detail.event.relay) throw new Refusal(400,'Only a relay has teams');
      const team=detail.teams!.find(item=>item.id===value.teamId);
      if(!team) throw new Refusal(404,'Team not found');
      if(!final || !final.heatsComplete || final.hasRun) throw new Refusal(409,'There is no final to add a team to');
      const race=await readRace(client,current.dayId,final.raceId);requireStageOpen(race);
      const lineup=[...race.parts.runners.value||[],...final.entries.flatMap(entry=>entry.runner?[entry.runner]:[]),...(final.additionalEntries||[]).map(entry=>entry.runner)];
      if(lineup.some(entry=>isTeamEntry(entry) && entry.team.id===team.id)) throw new Refusal(409,`Team ${team.number} is already in the Final`);
      // Not marked yet, like every finalist: it runs once marked Here.
      const entry=teamEntry(team,randomUUID());
      await client.query("UPDATE race_finals SET additional_entries=COALESCE(additional_entries,'[]'::jsonb)||$1::jsonb WHERE race_id=$2",[JSON.stringify([{runner:entry,absent:false}]),race.id]);
      await writeAuditNote(client,current,detail.event.id,{action:'add-team',comment,message:`${current.name} added Team ${team.number} to the Final${comment?` - ${comment}`:''}`,touches:[{raceId:race.id,entryId:entry.id}]});
      return {status:'saved',...await readEventResults(client,current.dayId,detail.event.code)};
    });
  });
}
