import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Phone } from '../../shared/domain.js';
import { raceName,teamsFinishedLine } from '../../shared/race-flow.js';
import { changerOf,legRefusal,legWarnings,stillToRun,unsavedRace,type RelayTeam,type TeamLeg,type TeamList } from '../../shared/teams.js';
import { Refusal } from '../access/permissions.js';
import type { Database } from '../races/records.js';
import type { TeamEntry } from '../../shared/races.js';
import { stageDoneSql } from '../../shared/stage-lock.js';
/** A relay's team list as it stands: the relay and its teams not removed (by number). */
export type TeamListRead=TeamList & {id:string;enabled:boolean;teams:RelayTeam[];nextTeam:number};
/**
 * Every relay of the day with its team list, by event id. Each team carries the races holding it, worked out from the
 * race entries and a final's line-up (a finalist not marked Here yet, but not Absent): a team is still to run when no
 * race of its relay holds it, apart from deleted races.
 */
export async function readTeamLists(db:Database,dayId:string):Promise<Map<string,TeamListRead>> {
  const lists=new Map<string,TeamListRead>();
  for(const relay of (await db.query("SELECT id,code,name,section,enabled FROM events WHERE day_id=$1 AND type='relays'",[dayId])).rows) lists.set(relay.id,{...relay,teams:[],nextTeam:1});
  // A removed team keeps its number: the next team takes one more than the highest the relay has ever used.
  for(const row of (await db.query('SELECT t.event_id,MAX(t.number) AS last FROM relay_teams t JOIN events e ON e.id=t.event_id WHERE e.day_id=$1 GROUP BY t.event_id',[dayId])).rows) lists.get(row.event_id)!.nextTeam=row.last+1;
  const teams=(await db.query('SELECT t.id,t.event_id,t.number,t.legs,t.version,t.changed_by,t.changed_by_profile,t.changing_since,s.id AS changing_id,s.name AS changing_name FROM relay_teams t JOIN events e ON e.id=t.event_id LEFT JOIN sign_ins s ON s.id=t.changing_by WHERE e.day_id=$1 AND NOT t.removed ORDER BY t.number',[dayId])).rows;
  const held=(await db.query(`SELECT DISTINCT r.id,r.kind,r.number,r.state,r.checked_in_at,held.team_id FROM races r JOIN events e ON e.id=r.event_id CROSS JOIN LATERAL (
      SELECT entry->'team'->>'id' AS team_id FROM race_parts p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.value)='array' THEN p.value ELSE '[]' END) entry
        WHERE p.race_id=r.id AND p.part='runners' AND entry ? 'team'
      UNION SELECT entry->'runner'->'team'->>'id' FROM race_finals f CROSS JOIN LATERAL jsonb_array_elements(f.entries||f.additional_entries) entry
        WHERE f.race_id=r.id AND entry->'runner' ? 'team' AND NOT COALESCE((entry->>'absent')::boolean,false)) held
    WHERE e.day_id=$1 AND e.type='relays' AND NOT r.deleted ORDER BY r.checked_in_at,r.id`,[dayId])).rows;
  for(const team of teams) lists.get(team.event_id)!.teams.push({id:team.id,number:team.number,legs:team.legs,version:team.version,changedBy:team.changed_by===null?null:{id:team.changed_by_profile,name:team.changed_by},
    changing:team.changing_id?{id:team.changing_id,name:team.changing_name,since:team.changing_since.toISOString()}:null,
    races:held.filter(race=>race.team_id===team.id).map(({id,kind,number,state})=>({id,kind,number,state}))});
  return lists;
}
/** The day's switched-on relays' team lists: a child on two of them is in two relays. */
export const switchedOn=(lists:Map<string,TeamListRead>)=>[...lists.values()].filter(list=>list.enabled);
/** A relay race's read and lead race page carry its team list, and every switched-on relay's, which a team's warnings and Correct teams look through. */
export async function relayLists(db:Database,dayId:string,eventId:string) {
  const lists=await readTeamLists(db,dayId);
  return {teams:lists.get(eventId)!.teams,relays:switchedOn(lists).map(({code,name,section,teams})=>({code,name,section,teams}))};
}
/** One relay (by event code or id) as a teams write sees it: its team list, whether its heats are complete, and the day's switched-on relays, which its warnings look through. */
export async function teamsWriteRead(db:Database,dayId:string,relay:{code:string}|{id:string}) {
  const [column,value]='id' in relay?['e.id::text',relay.id]:['e.code',relay.code];
  const event=(await db.query(`SELECT e.id,(e.type='relays') AS relay,${stageDoneSql('e.id',"'heats'")} AS heats_complete FROM events e WHERE e.day_id=$1 AND ${column}=$2`,[dayId,value])).rows[0];
  if(!event) throw new Refusal(404,'Event not found');
  if(!event.relay) throw new Refusal(400,'Only a relay has teams');
  const lists=await readTeamLists(db,dayId),list=lists.get(event.id)!;
  if(!list.enabled) throw new Refusal(409,'This event is switched off');
  return {...list,heatsComplete:event.heats_complete as boolean,relays:switchedOn(lists)};
}
export type TeamsWriteRead=Awaited<ReturnType<typeof teamsWriteRead>>;
/** The list is frozen once the relay's heats are complete. */
export function requireOpen(relay:TeamsWriteRead) {
  if(relay.heatsComplete) throw new Refusal(409,teamsFinishedLine(relay));
}
export function requestedTeam(relay:TeamsWriteRead,teamId:string) {
  const team=relay.teams.find(item=>item.id===teamId);
  if(!team) throw new Refusal(404,'Team not found');
  return team;
}
/** From the teams sheet, a team in an unsaved race is not changed: a check-in Edit changes it with its race entry. */
export function requireNotInRace(team:RelayTeam) {
  const race=unsavedRace(team);
  if(race) throw new Refusal(409,`Team ${team.number} is in ${raceName(race)} - change it at check-in`);
}
/** A signed-out phone is changing no team. Run inside the sign-out's change, so the day revision rises with it. */
export async function clearTeamMarks(client:pg.PoolClient,signInId:string) {
  await client.query('UPDATE relay_teams SET changing_by=NULL,changing_since=NULL WHERE changing_by=$1',[signInId]);
}
/**
 * A team joining a race from its team list (added at check-in or at the finish, or by a lead's Correct teams): only a
 * team still to run, and one nobody else (`me`, the phone adding it) is changing unless `evenIfChanging`. The race takes a copy of its four
 * children and their kept warnings, each child on the list marked here: a team in a race is checked in whole.
 */
export function joiningTeam(team:RelayTeam,{addedAtFinish=false,evenIfChanging=false,me=null as string|null}={}):TeamEntry {
  // A team in a race not saved yet hasn't run: say which race holds it.
  const holding=unsavedRace(team);
  if(holding) throw new Refusal(409,`Team ${team.number} is already in ${raceName(holding)}`);
  if(!stillToRun(team)) throw new Refusal(409,`Team ${team.number} has already run`);
  const changer=evenIfChanging?null:changerOf(team,me);
  if(changer) throw new Refusal(409,`${changer} is changing Team ${team.number}`);
  return {id:randomUUID(),team:{id:team.id,number:team.number},legs:team.legs.map(leg=>({...leg,here:leg.wristband!==null})),...(addedAtFinish?{addedAtFinish:true}:{})};
}
/** Four wristband boxes in leg order, each a wristband number or null for an empty box. */
export const fourBoxes=(legs:unknown):legs is Array<number|null>=>Array.isArray(legs) && legs.length===4 && legs.every(leg=>leg===null || (Number.isSafeInteger(leg) && leg>=0));
/** What a Save sends: the team (none for a new one) and the version it saw, the four boxes in leg order and the wristbands whose warnings were kept. */
export interface TeamDone { teamId?:string; version?:number; wristbands:Array<number|null>; kept:unknown[] }
export function requestedDone(body:unknown):TeamDone {
  const {teamId,version,legs,keptWarnings}=(body||{}) as {teamId?:unknown;version?:unknown;legs?:unknown;keptWarnings?:unknown};
  if(teamId!==undefined && typeof teamId!=='string') throw new Refusal(400,'Choose a team');
  if(teamId!==undefined && !Number.isSafeInteger(version)) throw new Refusal(400,'Open the team again');
  if(!fourBoxes(legs)) throw new Refusal(400,'Enter the four wristband boxes');
  const wristbands=legs,kept=keptWarnings??[];
  if(wristbands.every(wristband=>wristband===null)) throw new Refusal(400,'Enter at least one wristband number');
  if(!Array.isArray(kept) || kept.some(number=>number===null || !wristbands.includes(number))) throw new Refusal(400,'Choose Keep for a wristband number in this team');
  return {teamId,version:version as number|undefined,wristbands,kept};
}
/** A team's four boxes as every team write checks them: no wristband twice in the relay, and each warning kept. Answers the legs to store. */
export function checkedLegs(relay:TeamList & {relays:readonly TeamList[]},teamId:string|null,wristbands:Array<number|null>,kept:unknown[]):TeamLeg[] {
  const refusal=wristbands.map((_,index)=>legRefusal(relay.teams,teamId,wristbands,index)).find(Boolean);
  if(refusal) throw new Refusal(409,refusal);
  // A warning is stored only once kept: each one needs Fix number or Keep.
  const legs=wristbands.map(wristband=>({wristband,warnings:wristband===null?[]:legWarnings(wristband,relay,relay.relays).map(warning=>({...warning,kept:true}))}));
  const unkept=legs.find(leg=>leg.warnings.length && !kept.includes(leg.wristband));
  if(unkept) throw new Refusal(409,`${unkept.wristband} needs Fix number or Keep`);
  return legs;
}
/**
 * A lead's correction of a team's four children in a saved race ("Correct number", "Correct teams"): checked as a team
 * write is. On the team's latest race the team list takes the corrected children in the same write, so a typo doesn't
 * come back at the Final; its version rises, so a Save on the version before is refused. On an earlier race only the race
 * changes. Answers the race entry as corrected: a child still in the team keeps their here mark, wherever they moved,
 * and a child put in place of one no longer in it takes theirs.
 */
export async function correctTeam(client:pg.PoolClient,lead:Phone,race:{id:string;event:{id:string}},entry:TeamEntry,wristbands:Array<number|null>,kept:unknown[]):Promise<TeamEntry> {
  const lists=await readTeamLists(client,lead.dayId),relay={...lists.get(race.event.id)!,relays:switchedOn(lists)};
  const legs=checkedLegs(relay,entry.team.id,wristbands,kept),team=relay.teams.find(item=>item.id===entry.team.id);
  if(team?.races.at(-1)?.id===race.id) await client.query('UPDATE relay_teams SET legs=$2,version=version+1,changed_by=$3,changed_by_profile=$4 WHERE id=$1',[team.id,JSON.stringify(legs),lead.name,lead.profileId]);
  const stays=(wristband:number|null)=>legs.some(leg=>leg.wristband===wristband);
  return {...entry,legs:legs.map((leg,index)=>{
    const was=entry.legs.find(old=>old.wristband!==null && old.wristband===leg.wristband)??(stays(entry.legs[index].wristband)?undefined:entry.legs[index]);
    return {...leg,here:leg.wristband!==null && !!was?.here};
  })};
}
