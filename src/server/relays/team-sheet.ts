import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RelayTeam } from '../../shared/teams.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { changedLine,raceName,type RaceFlowRead,type RacesRead } from '../../shared/race-flow.js';
import { changeTeamEntry,raceFlowRead,racesRead } from '../races/race-flow.js';
import { keepFinalistLegs } from '../races/final-field.js';
import { raceChange } from '../races/records.js';
import { checkedLegs,joiningTeam,requestedDone,requestedTeam,requireNotInRace,requireOpen,teamsWriteRead,type TeamsWriteRead } from './teams.js';
/**
 * A Save on the version the phone last saw, or refused as changed ("Aisha Noor changed this a moment ago", or by this
 * person's own profile on another screen, to check and enter it again). Nothing holds a team: two phones change two teams at once.
 */
function requireVersion(team:RelayTeam,phone:Phone,version:number) {
  if(version===team.version) return;
  const by=team.changedBy;
  throw new Refusal(409,by && by.id!==phone.profileId?changedLine(by.name):'Not saved - check your entries and enter it again',{reason:'changed',by:by?.name??null});
}
/** The race a check-in write names, or none from the teams sheet. */
function requestedRace(raceId:unknown) {
  if(raceId!==undefined && typeof raceId!=='string') throw new Refusal(400,'Choose this race');
  return raceId;
}
/**
 * The teams sheet's writes, one team each, whole: New team, Save (an edit) and Remove. Each runs under the day lock,
 * raises the day revision when it changes anything, and answers with the races list as it then stands.
 */
export function teamSheetRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool),params=(request:FastifyRequest)=>request.params as {eventId:string;teamId:string};
  /**
   * From check-in (`raceId`), the race's own checks stand in for the list's: a final's teams are still changed at its
   * check-in once the heats are complete. The answer is what the phone is reading: that race, or the races list.
   */
  async function write(phone:Phone,eventId:string,raceId:string|undefined,change:(client:pg.PoolClient,relay:TeamsWriteRead,unchanged:()=>void)=>Promise<void>) {
    await raceChange(pool,phone,async(client,unchanged)=>{
      const relay=await teamsWriteRead(client,phone.dayId,{id:eventId});
      if(raceId===undefined) requireOpen(relay);
      await change(client,relay,unchanged);
    });
    return resultsSnapshot<RacesRead|RaceFlowRead>(pool,phone.dayId,db=>raceId===undefined?racesRead(db,phone.dayId):raceFlowRead(db,phone.dayId,raceId));
  }
  // New team: the next number the relay has never used (the day lock serialises two at once, so they never clash).
  // From check-in (`joinRaceId`) it joins that heat in the same write, as Add does.
  action('POST','/api/relays/:eventId/teams','Volunteer',(request,_reply,phone)=>{
    const {wristbands,kept}=requestedDone({...(request.body as object),teamId:undefined}),joinRaceId=requestedRace((request.body as {joinRaceId?:unknown}).joinRaceId);
    return write(phone,params(request).eventId,joinRaceId,async(client,relay)=>{
      const legs=checkedLegs(relay,null,wristbands,kept),id=randomUUID();
      await client.query('INSERT INTO relay_teams(id,event_id,number,legs,changed_by,changed_by_profile) SELECT $1,$2,COALESCE(MAX(number),0)+1,$3,$4,$5 FROM relay_teams WHERE event_id=$2',[id,relay.id,JSON.stringify(legs),phone.name,phone.profileId]);
      if(joinRaceId!==undefined) await changeTeamEntry(client,phone,joinRaceId,id,({race,team,entries})=>{
        if(race.kind==='final') throw new Refusal(409,'A new team can\'t join the final');
        return [...entries,joiningTeam(team)];
      });
    });
  });
  // Save: a team still to run, its four boxes against the version the phone saw. From check-in (`raceId`) it also
  // writes the team's entry in that race, every child in it checked in: a team in a race is here whole.
  action('POST','/api/relays/:eventId/teams/:teamId','Volunteer',(request,_reply,phone)=>{
    const {eventId,teamId}=params(request),done=requestedDone({...(request.body as object),teamId}),raceId=requestedRace((request.body as {raceId?:unknown}).raceId);
    return write(phone,eventId,raceId,async(client,relay)=>{
      const team=requestedTeam(relay,teamId);
      if(raceId===undefined) requireNotInRace(team);
      requireVersion(team,phone,done.version!);
      const legs=checkedLegs(relay,team.id,done.wristbands,done.kept);
      await client.query('UPDATE relay_teams SET legs=$2,version=version+1,changed_by=$3,changed_by_profile=$4,changing_by=NULL,changing_since=NULL WHERE id=$1',[team.id,JSON.stringify(legs),phone.name,phone.profileId]);
      if(raceId===undefined) return;
      // A final's kept copy of the team (for Here / Absent) takes the new legs too: through its runner list while the
      // team is Here, else straight away.
      let outOfRace=false;
      await changeTeamEntry(client,phone,raceId,team.id,({race,entries,entry})=>{
        if(!entry && race.kind==='final') {outOfRace=true;return;}
        if(!entry) throw new Refusal(409,`Team ${team.number} is no longer in ${raceName(race)}`);
        return entries.map(other=>other===entry?{...entry,legs:legs.map(leg=>({...leg,here:leg.wristband!==null}))}:other);
      });
      if(outOfRace && !await keepFinalistLegs(client,raceId,team.id,legs)) throw new Refusal(409,`Team ${team.number} is not in the final`);
    });
  });
  // Open / close: who has the team's leg boxes open, for "Aisha Noor is changing this team" on other phones. Nothing
  // locks: opening takes the mark from anyone, and a close clears only this phone's own. A Save or sign-out clears it too.
  // Not refused once the heats are complete: a final's teams are still changed at its check-in.
  function mark(open:boolean) {
    return (request:FastifyRequest,_reply:unknown,phone:Phone)=>{
      const {eventId,teamId}=params(request);
      return raceChange(pool,phone,async(client,unchanged)=>{
        const team=requestedTeam(await teamsWriteRead(client,phone.dayId,{id:eventId}),teamId);
        if((team.changing?.id===phone.id)===open) {unchanged();return;}
        await client.query('UPDATE relay_teams SET changing_by=$2,changing_since=CASE WHEN $2::uuid IS NULL THEN NULL ELSE clock_timestamp() END WHERE id=$1',[team.id,open?phone.id:null]);
      }).then(()=>resultsSnapshot(pool,phone.dayId,db=>racesRead(db,phone.dayId)));
    };
  }
  action('POST','/api/relays/:eventId/teams/:teamId/open','Volunteer',mark(true));
  action('POST','/api/relays/:eventId/teams/:teamId/close','Volunteer',mark(false));
  // Remove: only a team never in any race, deleted races included. The row stays, removed, so an audit note can still
  // name it and its number is never used again.
  action('POST','/api/relays/:eventId/teams/:teamId/remove','Volunteer',(request,_reply,phone)=>{
    const {eventId,teamId}=params(request),version=((request.body||{}) as {version?:unknown}).version;
    if(!Number.isSafeInteger(version)) throw new Refusal(400,'Open the team again');
    return write(phone,eventId,undefined,async(client,relay)=>{
      const team=requestedTeam(relay,teamId);
      requireNotInRace(team);
      requireVersion(team,phone,version as number);
      const ran=await client.query(`SELECT 1 FROM races r JOIN race_parts p ON p.race_id=r.id AND p.part='runners'
        WHERE r.event_id=$1 AND jsonb_typeof(p.value)='array' AND p.value @> jsonb_build_array(jsonb_build_object('team',jsonb_build_object('id',$2::text)))`,[relay.id,team.id]);
      if(team.races.length || ran.rowCount) throw new Refusal(409,`Team ${team.number} has been in a race - it can't be removed`);
      await client.query('UPDATE relay_teams SET removed=true,version=version+1,changed_by=$2,changed_by_profile=$3,changing_by=NULL,changing_since=NULL WHERE id=$1',[team.id,phone.name,phone.profileId]);
    });
  });
}
