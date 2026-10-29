import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RelayTeam } from '../../shared/teams.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { racesRead } from '../races/race-flow.js';
import { raceChange } from '../races/records.js';
import { checkedLegs,requestedDone,requestedTeam,requireNotInRace,requireOpen,teamsWriteRead,type TeamsWriteRead } from './teams.js';
/**
 * A Save on the version the phone last saw, or refused as changed ("Aisha Noor changed this a moment ago", or on this
 * person's own other screen, to check and enter it again). Nothing holds a team: two phones change two teams at once.
 */
function requireVersion(team:RelayTeam,phone:Phone,version:number) {
  if(version===team.version) return;
  const by=team.changedBy;
  throw new Refusal(409,by && by!==phone.name?`${by} changed this a moment ago`:'Not saved - check your entries and enter it again',{reason:'changed',by});
}
/**
 * The teams sheet's writes, one team each, whole: New team, Save (an edit) and Remove. Each runs under the day lock,
 * raises the day revision when it changes anything, and answers with the races list as it then stands.
 */
export function teamSheetRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool),params=(request:FastifyRequest)=>request.params as {eventId:string;teamId:string};
  async function write(phone:Phone,eventId:string,change:(client:pg.PoolClient,relay:TeamsWriteRead)=>Promise<void>) {
    await raceChange(pool,phone,async client=>{
      const relay=await teamsWriteRead(client,phone.dayId,{id:eventId});
      requireOpen(relay);
      await change(client,relay);
    });
    return resultsSnapshot(pool,phone.dayId,db=>racesRead(db,phone.dayId));
  }
  // New team: the next number the relay has never used (the day lock serialises two at once, so they never clash).
  action('POST','/api/relays/:eventId/teams','Volunteer',(request,_reply,phone)=>{
    const {wristbands,kept}=requestedDone({...(request.body as object),teamId:undefined});
    return write(phone,params(request).eventId,async(client,relay)=>{
      const legs=checkedLegs(relay,null,wristbands,kept);
      await client.query('INSERT INTO relay_teams(id,event_id,number,legs,changed_by) SELECT $1,$2,COALESCE(MAX(number),0)+1,$3,$4 FROM relay_teams WHERE event_id=$2',[randomUUID(),relay.id,JSON.stringify(legs),phone.name]);
    });
  });
  // Save: a team still to run, its four boxes against the version the phone saw.
  action('POST','/api/relays/:eventId/teams/:teamId','Volunteer',(request,_reply,phone)=>{
    const {eventId,teamId}=params(request),done=requestedDone({...(request.body as object),teamId});
    return write(phone,eventId,async(client,relay)=>{
      const team=requestedTeam(relay,teamId);
      requireNotInRace(team);
      requireVersion(team,phone,done.version!);
      const legs=checkedLegs(relay,team.id,done.wristbands,done.kept);
      await client.query('UPDATE relay_teams SET legs=$2,version=version+1,changed_by=$3,changing_by=NULL,changing_since=NULL WHERE id=$1',[team.id,JSON.stringify(legs),phone.name]);
    });
  });
  // Remove: only a team never in any race, deleted races included. The row stays, removed, so an audit note can still
  // name it and its number is never used again.
  action('POST','/api/relays/:eventId/teams/:teamId/remove','Volunteer',(request,_reply,phone)=>{
    const {eventId,teamId}=params(request),version=((request.body||{}) as {version?:unknown}).version;
    if(!Number.isSafeInteger(version)) throw new Refusal(400,'Open the team again');
    return write(phone,eventId,async(client,relay)=>{
      const team=requestedTeam(relay,teamId);
      requireNotInRace(team);
      requireVersion(team,phone,version as number);
      const ran=await client.query(`SELECT 1 FROM races r JOIN race_parts p ON p.race_id=r.id AND p.part='runners'
        WHERE r.event_id=$1 AND jsonb_typeof(p.value)='array' AND p.value @> jsonb_build_array(jsonb_build_object('team',jsonb_build_object('id',$2::text)))`,[relay.id,team.id]);
      if(team.races.length || ran.rowCount) throw new Refusal(409,`Team ${team.number} has been in a race - it can't be removed`);
      await client.query('UPDATE relay_teams SET removed=true,version=version+1,changed_by=$2,changing_by=NULL,changing_since=NULL WHERE id=$1',[team.id,phone.name]);
    });
  });
}
