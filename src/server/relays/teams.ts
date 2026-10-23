import { randomUUID } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import type { Holder } from '../../shared/race-screen.js';
import type { RelayTeam } from '../../shared/teams.js';
import { actions,Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { homeRead } from '../races/race-screen.js';
import { raceChange,type Database } from '../races/records.js';
import { writeAuditNote } from '../rulings/records.js';
/** Each relay's team list (teams not removed, by number) and its teams holder, by event id. */
export async function readTeamLists(db:Database,dayId:string):Promise<Map<string,{teams:RelayTeam[];holder:Holder|null}>> {
  const lists=new Map<string,{teams:RelayTeam[];holder:Holder|null}>();
  const relays=(await db.query('SELECT id FROM events WHERE day_id=$1 AND relay',[dayId])).rows;
  for(const relay of relays) lists.set(relay.id,{teams:[],holder:null});
  const teams=(await db.query('SELECT t.id,t.event_id,t.number,t.legs,t.version FROM relay_teams t JOIN events e ON e.id=t.event_id WHERE e.day_id=$1 AND NOT t.removed ORDER BY t.number',[dayId])).rows;
  for(const team of teams) lists.get(team.event_id)!.teams.push({id:team.id,number:team.number,legs:team.legs,version:team.version});
  const holders=(await db.query("SELECT h.event_id,s.id,s.name FROM job_holds h JOIN events e ON e.id=h.event_id JOIN sign_ins s ON s.id=h.sign_in_id WHERE e.day_id=$1 AND h.job='teams'",[dayId])).rows;
  for(const holder of holders) lists.get(holder.event_id)!.holder={id:holder.id,name:holder.name};
  return lists;
}
/** One relay as a teams write sees it: the event, whether its heats are complete, its teams holder and team list. */
async function relayRead(db:Database,dayId:string,code:string) {
  const event=(await db.query("SELECT e.id,e.code,e.name,e.section,e.enabled,e.relay,EXISTS(SELECT 1 FROM event_stages s WHERE s.event_id=e.id AND s.stage='heats') AS heats_complete FROM events e WHERE e.day_id=$1 AND e.code=$2",[dayId,code])).rows[0];
  if(!event) throw new Refusal(404,'Event not found');
  if(!event.relay) throw new Refusal(400,'Only a relay has teams');
  if(!event.enabled) throw new Refusal(409,'This event is switched off');
  return {...event,...(await readTeamLists(db,dayId)).get(event.id)!} as {id:string;code:string;name:string;section:string;heats_complete:boolean;teams:RelayTeam[];holder:Holder|null};
}
type Relay=Awaited<ReturnType<typeof relayRead>>;
function requireOpen(relay:Relay) {
  if(relay.heats_complete) throw new Refusal(409,'Stage complete - ask a lead');
}
const takeHold=(client:pg.PoolClient,relay:Relay,phone:Phone)=>client.query("INSERT INTO job_holds(event_id,job,sign_in_id) VALUES($1,'teams',$2) ON CONFLICT(event_id,job) DO UPDATE SET sign_in_id=EXCLUDED.sign_in_id",[relay.id,phone.id]);
/** A team write is the teams holder's: refused once someone took over, and taking the hold when nobody has it. */
async function requireHolder(client:pg.PoolClient,relay:Relay,phone:Phone) {
  if(relay.holder && relay.holder.id!==phone.id) throw new Refusal(409,`${relay.holder.name} took over the teams`);
  if(!relay.holder) await takeHold(client,relay,phone);
}
/**
 * The Teams screen's writes, one relay each. Each runs under the day lock, raises the day revision when it changes
 * anything, and answers with Home as it then stands: the Teams screen reads Home's day-wide stream.
 */
export function teamRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool),code=(request:FastifyRequest)=>(request.params as {code:string}).code;
  async function write(phone:Phone,code:string,change:(client:pg.PoolClient,relay:Relay,unchanged:()=>void)=>Promise<void>) {
    await raceChange(pool,phone,async(client,unchanged)=>change(client,await relayRead(client,phone.dayId,code),unchanged));
    return resultsSnapshot(pool,phone.dayId,db=>homeRead(db,phone.dayId));
  }
  // Opening a relay's card takes its teams hold when nobody has it; otherwise nothing changes and the phone watches.
  action('POST','/api/teams/:code/hold','Volunteer',(request,_reply,phone)=>write(phone,code(request),async(client,relay,unchanged)=>{
    requireOpen(relay);
    if(relay.holder) unchanged();
    else await takeHold(client,relay,phone);
  }));
  // Take over: the relay's teams hold passes to this phone (after its confirm), with an audit note naming who had it.
  action('POST','/api/teams/:code/take-over','Volunteer',(request,_reply,phone)=>write(phone,code(request),async(client,relay,unchanged)=>{
    requireOpen(relay);
    const from=relay.holder;
    if(from?.id===phone.id) {unchanged();return;}
    await takeHold(client,relay,phone);
    if(from) await writeAuditNote(client,phone,relay.id,{action:'take-over',message:`${phone.name} took over the teams from ${from.name} on ${relay.name} ${relay.section}`,comment:null,touches:[]});
  }));
  // Done: the team's four boxes in one write, a new team (no id) taking one more than the highest number the relay has
  // ever used. The day lock serialises Dones, so two new teams never clash.
  action('POST','/api/teams/:code/done','Volunteer',(request,_reply,phone)=>{
    const body=(request.body||{}) as {teamId?:unknown;legs?:unknown};
    if(body.teamId!==undefined && typeof body.teamId!=='string') throw new Refusal(400,'Choose a team');
    if(!Array.isArray(body.legs) || body.legs.length!==4 || body.legs.some(leg=>leg!==null && (!Number.isSafeInteger(leg) || leg<0))) throw new Refusal(400,'Enter the four wristband boxes');
    const wristbands=body.legs as Array<number|null>,teamId=body.teamId as string|undefined;
    if(wristbands.every(wristband=>wristband===null)) throw new Refusal(400,'Enter at least one wristband number');
    return write(phone,code(request),async(client,relay)=>{
      requireOpen(relay);
      await requireHolder(client,relay,phone);
      const team=teamId===undefined?null:relay.teams.find(item=>item.id===teamId);
      if(team===undefined) throw new Refusal(404,'Team not found');
      const legs=JSON.stringify(wristbands.map(wristband=>({wristband,warnings:[]})));
      if(team) await client.query('UPDATE relay_teams SET legs=$2,version=version+1 WHERE id=$1',[team.id,legs]);
      else await client.query('INSERT INTO relay_teams(id,event_id,number,legs) SELECT $1,$2,COALESCE(MAX(number),0)+1,$3 FROM relay_teams WHERE event_id=$2',[randomUUID(),relay.id,legs]);
    });
  });
}
