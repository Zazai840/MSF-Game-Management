import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { RelayTeam } from '../../shared/teams.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { changedLine,raceName } from '../../shared/race-flow.js';
import { addTeamToFinal,changeTeamEntry,raceFlowRead } from '../races/race-flow.js';
import { saveIfDone } from '../races/steps.js';
import { finalTeam,keepFinalistLegs } from '../races/final-field.js';
import { raceChange } from '../races/records.js';
import { ordinal } from '../../shared/ordinal.js';
import { teamHere } from '../../shared/teams.js';
import { writeChangeNote } from '../rulings/records.js';
import { requireFinalChange } from '../rulings/validation.js';
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
    await raceChange(pool,phone,async client=>{
      await change(client,await teamsWriteRead(client,phone.dayId,{id:eventId}));
      // As every race-flow write ends: the race saves itself once its steps are all done.
      await saveIfDone(client,phone,raceId);
    });
    return resultsSnapshot(pool,phone.dayId,db=>raceFlowRead(db,phone,raceId));
  }
  // A team typed into a heat (`joinRaceId`): the only way a team is made. It takes the next number the relay has never
  // used (the day lock serialises two at once, so they never clash) and joins the heat in the same write, as Add does.
  // At a final it is "+ Team" with a number in no team: added Here while a place is free, its reason kept as an audit note.
  action('POST','/api/relays/:eventId/teams','Volunteer',(request,_reply,phone)=>{
    const {wristbands,kept}=requestedDone({...(request.body as object),teamId:undefined}),joinRaceId=requestedRace((request.body as {joinRaceId?:unknown}).joinRaceId);
    return write(phone,params(request).eventId,joinRaceId,async(client,relay)=>{
      const legs=checkedLegs(relay,null,wristbands,kept,joinRaceId),id=randomUUID();
      await client.query('INSERT INTO relay_teams(id,event_id,number,legs,changed_by,changed_by_profile) SELECT $1,$2,COALESCE(MAX(number),0)+1,$3,$4,$5 FROM relay_teams WHERE event_id=$2',[id,relay.id,JSON.stringify(legs),phone.name,phone.profileId]);
      await changeTeamEntry(client,phone,joinRaceId,id,async({race,team,entries})=>
        [...entries,race.kind==='final'?await addTeamToFinal(client,phone,race,team,(request.body as {reason?:unknown}).reason):joiningTeam(team)]);
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
      const was=team.legs.map(leg=>leg.wristband),leg=legs.findIndex(item=>item.wristband!==null && !was.includes(item.wristband));
      // A final's kept copy of the team (for Here / Absent) takes the new legs too: through its runner list while the
      // team is Here, else straight away.
      let outOfRace=false;
      await changeTeamEntry(client,phone,raceId,team.id,async({race,entries,entry})=>{
        if(race.kind==='final') {
          const finalist=finalTeam(race.final!,team.id),count=(wristbands:ReadonlyArray<number|null>)=>wristbands.filter(wristband=>wristband!==null).length;
          // As an Absent runner has no replace, an Absent team has no leg change; and a child is replaced, never taken off.
          if(!entry && finalist?.absent) throw new Refusal(409,`Team ${team.number} is Absent`);
          if(count(legs.map(item=>item.wristband))<count(was)) throw new Refusal(409,'A leg can\'t be emptied at the Final');
          // A child new to the team is a replace: it needs a reason, kept as an audit note on the team's entry in the
          // final (its Notes carry it) and, as an individual replace's, on the heat entry the old child ran in. A reorder is not.
          if(leg>=0) await writeChangeNote(client,phone,race.event.id,'replace-leg',`changed Team ${team.number}'s ${ordinal(leg+1)} leg from ${was[leg]??'empty'} to ${legs[leg].wristband} (${raceName(race)})`,
            requireFinalChange(race.final!,(request.body as {reason?:unknown}).reason,false),[{raceId,entryId:finalist?.id},...(finalist?.heat?[finalist.heat]:[])]);
          if(!entry) {outOfRace=true;return;}
        }
        if(!entry) throw new Refusal(409,`Team ${team.number} is no longer in ${raceName(race)}`);
        return entries.map(other=>other===entry?teamHere({...entry,legs}):other);
      });
      if(outOfRace && !await keepFinalistLegs(client,raceId,team.id,legs)) throw new Refusal(409,`Team ${team.number} is not in the final`);
    });
  });
}
