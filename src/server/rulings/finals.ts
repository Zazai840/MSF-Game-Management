import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { Phone } from '../../shared/domain.js';
import type { DayEvent } from '../../shared/day.js';
import { resultName,type LeaderboardRow } from '../../shared/results-rules.js';
import { openCallUp,type FinalEntry } from '../../shared/finals.js';
import { entryName,isTeamEntry,type RaceEntry } from '../../shared/races.js';
import type { RelayTeam } from '../../shared/teams.js';
import { readTeamLists } from '../relays/teams.js';
import { actions,Refusal,requireLevel } from '../access/permissions.js';
import { readRace,requireStageOpen,listRaces } from '../races/records.js';
import { publishPart } from '../races/versions.js';
import { nextNumber,originalRunners } from '../races/create.js';
import { readEventResults } from '../results/read.js';
import { rulingChange,writeAuditNote } from './records.js';
import { rulingDetails } from './validation.js';
/**
 * A qualifier's or call-up's entry in the final: a child by wristband, or a relay team with its four children as its
 * team has them now (a child swapped since its heat runs the final), none marked here yet.
 */
function finalist(teams:readonly RelayTeam[],row:LeaderboardRow,id:string):RaceEntry {
  if(!row.team) return {id,wristband:row.wristband!};
  const team=teams.find(team=>team.id===row.team!.id);
  if(!team) throw new Refusal(409,`Team ${row.team.number} is missing - ask a lead to check it`);
  return teamEntry(team,id);
}
/** A relay team joining the final with its four children as the team has them now, none here yet. */
const teamEntry=(team:RelayTeam,id:string):RaceEntry=>({id,team:{id:team.id,number:team.number},legs:team.legs.map(leg=>({...leg,here:false}))});
/** The relay's teams, or none for an event that is not a relay. */
const relayTeams=async(client:pg.PoolClient,dayId:string,eventId:string)=>(await readTeamLists(client,dayId)).get(eventId)?.teams??[];
/** Whether a final's added entry (a child or a relay team) is the one this heat row names. */
const sameHolder=(runner:RaceEntry,row:LeaderboardRow)=>isTeamEntry(runner)?runner.team.id===row.team?.id:runner.wristband===row.wristband;
/**
 * The final's line-up from the fastest 6. It reuses the sole live final that has not run and has no finishing order;
 * a final with either is left as it is. A finalist who stays (the same heat entry) keeps its entry id, and with it its
 * Here or Absent mark; a new finalist has a fresh id and no mark; one who leaves loses its place and its mark. Added
 * entries stay, unless they are now among the fastest 6.
 */
export async function seedFinal(client:pg.PoolClient,phone:Phone,event:DayEvent,qualifiers:readonly LeaderboardRow[]) {
  const races=await listRaces(client,phone.dayId),existing=races.find(race=>race.event.id===event.id && race.kind==='final');
  const placed=existing?.parts.finish.value;
  if(existing?.final?.hasRun || placed?.order.length || placed?.didNotFinish.length) return;
  const id=existing?.id||randomUUID(),teams=await relayTeams(client,phone.dayId,event.id);
  const entries:FinalEntry[]=qualifiers.map((row,index)=>{
    const stays=existing?.final?.entries.find(entry=>entry.heatRaceId===row.raceId && entry.heatEntryId===row.entryId),finalEntryId=stays?.finalEntryId??randomUUID();
    // Each runner's copy is kept for Here / Absent without recording attendance while seeding the line-up.
    return {finalEntryId,heatRaceId:row.raceId,heatEntryId:row.entryId,heatWristband:row.wristband,heatRank:row.position!,seed:index+1,kind:'qualifier',absent:stays?.absent??false,...(stays?.wasHere?{wasHere:true}:{}),runner:stays?.runner??finalist(teams,row,finalEntryId)};
  });
  const additions=(existing?.final?.additionalEntries||[]).filter(entry=>!qualifiers.some(row=>sameHolder(entry.runner,row)));
  if(existing) {
    // Those Here who are still in the line-up stay Here.
    const ids=new Set([...entries.map(entry=>entry.finalEntryId),...additions.map(entry=>entry.runner.id)]);
    await publishPart(client,phone,existing,'runners',(existing.parts.runners.value||[]).filter(runner=>ids.has(runner.id)));
    await publishPart(client,phone,existing,'finish',null);
  } else {
    // A new final starts with nobody Here, children and relay teams alike: each is marked at the start line, and only those Here run it.
    await client.query('INSERT INTO races(id,day_id,event_id,kind,number,original_runners) VALUES($1,$2,$3,\'final\',$4,$5)',[id,phone.dayId,event.id,await nextNumber(client,event.id,'final'),originalRunners(entries.map(entry=>entry.runner!))]);
    for(const part of ['runners','finish','times']) await client.query('INSERT INTO race_parts(race_id,part,version,value,saved_by,saved_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())',[id,part,part==='runners'?1:0,part==='runners'?'[]':null,phone.id]);
  }
  await client.query('INSERT INTO race_finals(race_id,entries,additional_entries,generation) VALUES($1,$2,$3,$4) ON CONFLICT(race_id) DO UPDATE SET entries=EXCLUDED.entries,additional_entries=EXCLUDED.additional_entries,generation=EXCLUDED.generation',[id,JSON.stringify(entries),JSON.stringify(additions),randomUUID()]);
}
/** A heat deleted or restored after the final is made: the event's live final, if it has one, gets the fastest 6 again (`seedFinal`). */
export async function remakeLineUp(client:pg.PoolClient,phone:Phone,code:string) {
  const {event,results}=await readEventResults(client,phone.dayId,code);
  if(results.finalResults) await seedFinal(client,phone,event,results.qualifiers);
}
export function finalRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  // Anyone signed in calls up (ADR 0003): the Start line at the final's check-in, or a lead there or on the Final tab.
  action('POST','/api/lead/events/:code/call-up','Volunteer',async(request,_reply,phone)=>{
    const {value,comment}=rulingDetails(request.body,false);
    if(typeof value.expectedHeatEntryId!=='string') throw new Refusal(400,'Choose the suggested next-ranked runner');
    return rulingChange(pool,phone,async(client,current)=>{
      // The Start line's call-up has no comment box: free text reaches the audit note from a lead only.
      if(comment) requireLevel(current,'Lead');
      const detail=await readEventResults(client,current.dayId,(request.params as {code:string}).code),final=detail.results.finalResults,next=openCallUp(final);
      if(!final || !next) throw new Refusal(409,'There is no open place to call up a runner');
      const vacancy=final.vacancy!,race=await readRace(client,current.dayId,final.raceId);requireStageOpen(race);
      if(next.entryId!==value.expectedHeatEntryId) throw new Refusal(409,'The next-ranked runner has changed - check the suggestion again');
      const id=randomUUID(),called=finalist(await relayTeams(client,current.dayId,detail.event.id),next,id);
      const entry:FinalEntry={finalEntryId:id,heatRaceId:next.raceId,heatEntryId:next.entryId,heatWristband:next.wristband,heatRank:next.position!,seed:vacancy.seed,kind:'call-up',absent:false,runner:called,replacesEntryId:vacancy.finalEntryId};
      await client.query('UPDATE race_finals SET entries=$1 WHERE race_id=$2',[JSON.stringify([...final.entries,entry]),race.id]);
      // A call-up is Here at once, with no second tap: it joins the final's runners, a team with each of its children here.
      const here:RaceEntry=isTeamEntry(called)?{...called,legs:called.legs.map(leg=>({...leg,here:leg.wristband!==null}))}:called;
      await publishPart(client,current,race,'runners',[...race.parts.runners.value||[],here]);
      // An absent child is named by the wristband seeded; an absent team by its number, from its copy kept when it left.
      const absent=vacancy.heatWristband??(vacancy.runner?entryName(vacancy.runner):'');
      await writeAuditNote(client,current,detail.event.id,{action:'call-up',comment,message:`${current.name} called up ${resultName(next)} (heat rank ${next.position}) for absent ${absent}${comment?` - ${comment}`:''}`,touches:[{raceId:race.id,entryId:entry.finalEntryId},{raceId:next.raceId,entryId:next.entryId}]});
      // Heat ranking and audit notes stay within Lead reads: a volunteer's phone reads the race again.
      return {status:'saved',...(current.level==='Lead'?await readEventResults(client,current.dayId,detail.event.code):{})};
    },'Volunteer');
  });
}
