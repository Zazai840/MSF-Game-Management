import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RelayTeam } from '../../shared/teams.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { changedLine,raceName } from '../../shared/race-flow.js';
import { changeTeamEntry,raceFlowRead } from '../races/race-flow.js';
import { keepFinalistLegs } from '../races/final-field.js';
import { raceChange } from '../races/records.js';
import { checkedLegs,joiningTeam,requestedDone,requestedTeam,teamsWriteRead,type TeamsWriteRead } from './teams.js';
/**
 * A Save on the version the phone last saw, or refused as changed ("Aisha Noor changed this a moment ago", or by this
 * person's own profile on another screen, to check and enter it again). Nothing holds a team: two phones change two teams at once.
 */
function requireVersion(team:RelayTeam,phone:Phone,version:number) {
  if(version===team.version) return;
  const by=team.changedBy;
  throw new Refusal(409,by && by.id!==phone.profileId?changedLine(by.name):'Not saved - check your entries and enter it again',{reason:'changed',by:by?.name??null});
}
/** The race a team write is made in: a team is only ever typed or changed in a race. */
function requestedRace(raceId:unknown) {
  if(typeof raceId!=='string') throw new Refusal(400,'Choose this race');
  return raceId;
}
/**
 * A relay team's writes from a race's start line, one team each, whole: a team typed into a heat, and a change to a
 * team's children (a leg chip, a leg drag). Each runs under the day lock, raises the day revision when it changes
 * anything, and answers with the race as it then stands.
 */
export function teamRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool),params=(request:FastifyRequest)=>request.params as {eventId:string;teamId:string};
  async function write(phone:Phone,eventId:string,raceId:string,change:(client:pg.PoolClient,relay:TeamsWriteRead)=>Promise<void>) {
    await raceChange(pool,phone,async client=>change(client,await teamsWriteRead(client,phone.dayId,{id:eventId})));
    return resultsSnapshot(pool,phone.dayId,db=>raceFlowRead(db,phone,raceId));
  }
  // A team typed into a heat (`joinRaceId`): the only way a team is made. It takes the next number the relay has never
  // used (the day lock serialises two at once, so they never clash) and joins the heat in the same write, as Add does.
  action('POST','/api/relays/:eventId/teams','Volunteer',(request,_reply,phone)=>{
    const {wristbands,kept}=requestedDone({...(request.body as object),teamId:undefined}),joinRaceId=requestedRace((request.body as {joinRaceId?:unknown}).joinRaceId);
    return write(phone,params(request).eventId,joinRaceId,async(client,relay)=>{
      const legs=checkedLegs(relay,null,wristbands,kept,joinRaceId),id=randomUUID();
      await client.query('INSERT INTO relay_teams(id,event_id,number,legs,changed_by,changed_by_profile) SELECT $1,$2,COALESCE(MAX(number),0)+1,$3,$4,$5 FROM relay_teams WHERE event_id=$2',[id,relay.id,JSON.stringify(legs),phone.name,phone.profileId]);
      await changeTeamEntry(client,phone,joinRaceId,id,({race,team,entries})=>{
        if(race.kind==='final') throw new Refusal(409,'A new team can\'t join the final');
        return [...entries,joiningTeam(team)];
      });
    });
  });
  // Save: a team's four boxes against the version the phone saw, in race `raceId`, whose entry for the team takes them
  // too, every child in it checked in: a team in a race is here whole.
  action('POST','/api/relays/:eventId/teams/:teamId','Volunteer',(request,_reply,phone)=>{
    const {eventId,teamId}=params(request),done=requestedDone({...(request.body as object),teamId}),raceId=requestedRace((request.body as {raceId?:unknown}).raceId);
    return write(phone,eventId,raceId,async(client,relay)=>{
      const team=requestedTeam(relay,teamId);
      requireVersion(team,phone,done.version!);
      const legs=checkedLegs(relay,team.id,done.wristbands,done.kept,raceId);
      await client.query('UPDATE relay_teams SET legs=$2,version=version+1,changed_by=$3,changed_by_profile=$4 WHERE id=$1',[team.id,JSON.stringify(legs),phone.name,phone.profileId]);
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
}
