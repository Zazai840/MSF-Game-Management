import { afterEach,expect,test } from 'vitest';
import { isRunner,isTeamEntry } from '../src/shared/races.js';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { raceSetup } from './support/races.js';
import { relayFlowSetup } from './support/relays.js';
import type { ResultsRead } from '../src/shared/lead-results.js';
import { toCheckWording } from '../src/shared/to-check.js';
import { signInOwner } from './support/sign-in.js';
const adminUrl=process.env.PG_ADMIN_URL || `postgresql://${process.env.USER}@localhost:5432/postgres`;
const name=`msf_spec22_${Date.now()}_test`;
const databaseUrl=Object.assign(new URL(adminUrl),{pathname:`/${name}`}).href;
const admin=async(sql:string)=>{const client=new pg.Client({connectionString:adminUrl});await client.connect();try {await client.query(sql);} finally {await client.end();}};
afterEach(()=>admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
test('the boot script starts on a database an older build left, competing saves and all, and its races carry on as in progress',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/owner-sign-in',payload:{password:'upgrade-owner',name:'Aisha',profiles:[]}})).json().token as string;
  const race=await raceSetup(app).checkIn(owner,'R4',[2001,2002]);
  await app.close();
  // The older build: no holds, race state, saved mark, Submit presses or holders in history, a final's presence
  // confirm, and a competing Times save.
  const old=new pg.Client({connectionString:databaseUrl});await old.connect();
  await old.query('DROP TABLE IF EXISTS submit_presses');
  await old.query('DROP TABLE IF EXISTS job_holds');
  await old.query('ALTER TABLE race_finals ADD COLUMN presence_confirmed boolean NOT NULL DEFAULT false');
  await old.query('ALTER TABLE races DROP COLUMN state, DROP COLUMN saved_at, DROP COLUMN saved_by');
  await old.query('ALTER TABLE race_part_history DROP COLUMN held_by, DROP COLUMN IF EXISTS saved_at, DROP COLUMN IF EXISTS corrected_by');
  await old.query(`CREATE TABLE IF NOT EXISTS race_part_saves (
    id uuid PRIMARY KEY, sequence_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE, part text NOT NULL,
    base_version integer NOT NULL, version integer NOT NULL, author_name text, saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    value jsonb, runners jsonb NOT NULL, before_runners jsonb NOT NULL, active boolean NOT NULL DEFAULT true)`);
  await old.query('CREATE INDEX race_part_candidates ON race_part_saves(race_id,part) WHERE active');
  // Before event types were stored: only the relay mark said what an event was, and a lead had named one 60m hurdles.
  await old.query('ALTER TABLE events DROP CONSTRAINT events_relay_is_type, DROP COLUMN type');
  await old.query("UPDATE events SET name='Low hurdles' WHERE code='R8'");
  await old.query(`INSERT INTO race_part_history(race_id,part,version,value,runners) SELECT race_id,part,version,value,'[]' FROM race_parts WHERE race_id=$1 ON CONFLICT DO NOTHING`,[race.id]);
  await old.query(`INSERT INTO race_part_saves(id,race_id,part,base_version,version,author_name,value,runners,before_runners) VALUES(gen_random_uuid(),$1,'times',0,1,'Jo','{"places":[1200,1300],"outOfOrder":false}','[]','[]'),(gen_random_uuid(),$1,'times',0,1,'Ali','{"places":[1250,1300],"outOfOrder":false}','[]','[]')`,[race.id]);
  await old.end();
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
  try {
    const setup=raceSetup(app),screen=await setup.screen(owner,'R4');
    expect(screen.race).toMatchObject({id:race.id,state:'in progress'});
    // The competing saves are gone with their table; the older build's history rows stay, with no time or author.
    const db=new pg.Client({connectionString:databaseUrl});await db.connect();
    // The final's presence confirm is gone too: attendance is the live Here / Absent list.
    try {
      expect((await db.query("SELECT to_regclass('race_part_saves') AS saves")).rows).toEqual([{saves:null}]);
      expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='race_finals' AND column_name='presence_confirmed'")).rows).toEqual([]);
      // Each event gets its type once, from the relay mark or a Hurdles name.
      const types=Object.fromEntries((await db.query("SELECT code,type FROM events WHERE code IN ('R4','R7','R8','R19')")).rows.map(row=>[row.code,row.type]));
      expect(types).toEqual({R4:'races',R7:'hurdles',R8:'hurdles',R19:'relays'});
      await expect(db.query("UPDATE events SET type='races' WHERE code='R19'")).rejects.toThrow(/events_relay_is_type/);
    } finally {await db.end();}
    const lead=await app.inject({url:`/api/lead/races/${race.id}`,headers:{authorization:`Bearer ${owner}`}});
    expect(lead.statusCode).toBe(200);expect(lead.json()).not.toHaveProperty('clashes');
    expect(lead.json().history).toContainEqual({part:'runners',version:2,author:null,at:null});
    await setup.order(owner,'R4',[2001,2002]);await setup.times(owner,'R4',[1200,1300]);
    expect((await setup.submit(owner,'R4')).race).toMatchObject({id:race.id,state:'saved'});
    const history=(await app.inject({url:`/api/lead/races/${race.id}`,headers:{authorization:`Bearer ${owner}`}})).json().history;
    // The saved rows name who marked each step done (ADR 0003), so the older build's runners are named too.
    expect(history.filter((row:{at:string|null})=>row.at).map(({part,author}:{part:string;author:string})=>[part,author])).toEqual([['runners','Aisha'],['finish','Aisha'],['times','Aisha']]);
  } finally {await app.close();}
});
test('starting up turns an older build\'s Scoring team sign-ins into leads, allows only Volunteer or Lead, and runs twice cleanly',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  const signedIn=(await app.inject({method:'POST',url:'/api/owner-sign-in',payload:{password:'upgrade-owner',name:'Aisha',profiles:[]}})).json();
  const yusuf=(await app.inject({method:'POST',url:'/api/profiles',payload:{pass:signedIn.pass,name:'Yusuf'}})).json();
  await app.close();
  // The older build allowed a third role and stored the owner and the scoring team under it.
  const old=new pg.Client({connectionString:databaseUrl});await old.connect();
  await old.query('ALTER TABLE sign_ins DROP CONSTRAINT sign_ins_level_check');
  await old.query("ALTER TABLE sign_ins ADD CONSTRAINT sign_ins_level_check CHECK (level IN ('Volunteer','Lead','Scoring team'))");
  await old.query("UPDATE sign_ins SET level='Scoring team'");
  await old.end();
  for(let start=0;start<2;start++) {
    app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
    try {
      const me=async(token:string)=>(await app.inject({url:'/api/me',headers:{authorization:`Bearer ${token}`}})).json();
      expect(await me(signedIn.token)).toMatchObject({name:'Aisha',level:'Lead'});
      expect(await me(yusuf.token)).toMatchObject({name:'Yusuf',level:'Lead'});
      expect((await app.inject({url:'/api/day/phones',headers:{authorization:`Bearer ${signedIn.token}`}})).json().phones.find((phone:{name:string})=>phone.name==='Aisha')).toMatchObject({level:'Lead',owner:true});
    } finally {await app.close();}
  }
  const db=new pg.Client({connectionString:databaseUrl});await db.connect();
  try {
    await expect(db.query("UPDATE sign_ins SET level='Scoring team'")).rejects.toThrow(/sign_ins_level_check/);
  } finally {await db.end();}
});
test('the boot script adds the relay mark and the team store to a day the current build started, leaving its events and races as they were and adding no relays',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/owner-sign-in',payload:{password:'upgrade-owner',name:'Aisha',profiles:[]}})).json().token as string;
  const race=await raceSetup(app).checkIn(owner,'R4',[2001,2002]);
  await app.close();
  // The current build: its day has the 20 individual events, no relay mark and no team store.
  const current=new pg.Client({connectionString:databaseUrl});await current.connect();
  await current.query("DELETE FROM events WHERE code IN ('R19','R20','R21','R22','R27','R28')");
  await current.query('ALTER TABLE events DROP COLUMN relay');
  await current.query('DROP TABLE relay_teams');
  await current.end();
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
  try {
    const day=(await app.inject({url:'/api/day',headers:{authorization:`Bearer ${owner}`}})).json();
    expect(day.events).toHaveLength(20);
    expect(day.events.every((event:{relay:boolean})=>event.relay===false)).toBe(true);
    const screen=await raceSetup(app).screen(owner,'R4');
    expect(screen.race).toMatchObject({id:race.id,state:'in progress'});
    expect(screen.race.parts.runners.value?.filter(isRunner).map(runner=>runner.wristband)).toEqual([2001,2002]);
    const db=new pg.Client({connectionString:databaseUrl});await db.connect();
    try {
      expect((await db.query("SELECT to_regclass('relay_teams') IS NOT NULL AS teams")).rows).toEqual([{teams:true}]);
    } finally {await db.end();}
  } finally {await app.close();}
});
test('a day under way on the old relay path upgrades without retyping: a relay race waiting on Submit presses carries on in progress with its entries and no step done, and the holds, presses and team-changing marks are gone',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  const people=await signInOwner(app,'upgrade-owner','Aisha'),owner=people.owner,sam=await people.volunteer('Sam Patel');
  await app.inject({method:'POST',url:'/api/day/confirm-events',headers:{authorization:`Bearer ${owner.token}`}});
  const relays=relayFlowSetup(app);
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204],[2301,2302,2303,2304]]) await relays.team(sam.token,'R22',legs);
  // Heat 1 saved in the race flow, with a lead's audit note on the day; Heat 2 with two teams added.
  await relays.tick(sam.token,'R22',1);
  const saved=(await relays.save(sam.token,'R22',[1],[1500])).race;
  await relays.tick(sam.token,'R22',2);await relays.tick(sam.token,'R22',3);
  const waiting=(await relays.worked(sam.token,'R22')).race;
  await app.close();
  const untouched=async(db:pg.Client)=>({
    teams:(await db.query('SELECT id,number,legs,removed,version,changed_by FROM relay_teams ORDER BY event_id,number')).rows,
    saved:(await db.query('SELECT r.state,r.saved_at,r.saved_by,p.part,p.version,p.value,p.done_at FROM races r JOIN race_parts p ON p.race_id=r.id WHERE r.id=$1 ORDER BY p.part',[saved.id])).rows,
    history:(await db.query('SELECT part,version,value,held_by,saved_at FROM race_part_history WHERE race_id=$1 ORDER BY part,version',[saved.id])).rows,
    notes:(await db.query('SELECT id,message FROM audit_notes ORDER BY sequence_number')).rows,
  });
  // The old build: Heat 2 waiting on Submit presses (Sam has pressed), job holds on the relay including its teams
  // hold, and Team 3 open on Sam's phone.
  const old=new pg.Client({connectionString:databaseUrl});await old.connect();
  let before;
  try {
    await old.query(`CREATE TABLE IF NOT EXISTS job_holds (event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      job text NOT NULL CHECK (job IN ('check-in','order','times','teams')), sign_in_id uuid NOT NULL REFERENCES sign_ins(id) ON DELETE CASCADE, PRIMARY KEY(event_id,job))`);
    await old.query(`CREATE TABLE IF NOT EXISTS submit_presses (race_id uuid NOT NULL REFERENCES races(id) ON DELETE CASCADE,
      sign_in_id uuid NOT NULL REFERENCES sign_ins(id) ON DELETE CASCADE, pressed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(race_id,sign_in_id))`);
    await old.query('ALTER TABLE races DROP CONSTRAINT races_state_check');
    await old.query("ALTER TABLE races ADD CONSTRAINT races_state_check CHECK (state IN ('in progress','submitted','saved'))");
    await old.query("UPDATE races SET state='submitted' WHERE id=$1",[waiting.id]);
    await old.query('INSERT INTO submit_presses(race_id,sign_in_id) VALUES($1,$2)',[waiting.id,sam.phone.id]);
    const relay=(await old.query("SELECT id FROM events WHERE code='R22'")).rows[0].id;
    await old.query("INSERT INTO job_holds(event_id,job,sign_in_id) VALUES($1,'check-in',$2),($1,'teams',$2),($1,'order',$3)",[relay,sam.phone.id,owner.phone.id]);
    await old.query('UPDATE relay_teams SET changing_by=$1,changing_since=now() WHERE number=3',[sam.phone.id]);
    // The old build named who last set a team, with no profile.
    await old.query('ALTER TABLE relay_teams DROP COLUMN changed_by_profile');
    before=await untouched(old);
  } finally {await old.end();}
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
  try {
    const read=(await app.inject({url:`/api/races/${waiting.id}`,headers:{authorization:`Bearer ${sam.token}`}})).json() as RaceFlowRead;
    expect(read.race).toMatchObject({id:waiting.id,state:'in progress'});
    expect(read.race.parts.runners.value!.filter(isTeamEntry).map(entry=>[entry.team.number,entry.legs.map(leg=>leg.here)])).toEqual([[2,[true,true,true,true]],[3,[true,true,true,true]]]);
    expect(Object.values(read.steps).map(step=>step!.state)).not.toContain('done');
    expect(read.teams!.map(team=>team.changing)).toEqual([null,null,null]);
    // Who last set each team is known by profile, so Change anyway asks only another profile.
    expect(read.teams!.map(team=>team.changedBy)).toEqual(Array(3).fill({id:sam.profile.id,name:'Sam Patel'}));
    const db=new pg.Client({connectionString:databaseUrl});await db.connect();
    try {
      expect((await db.query("SELECT to_regclass('job_holds') AS holds,to_regclass('submit_presses') AS presses")).rows).toEqual([{holds:null,presses:null}]);
      expect((await db.query('SELECT count(*)::int AS marked FROM relay_teams WHERE changing_by IS NOT NULL OR changing_since IS NOT NULL')).rows).toEqual([{marked:0}]);
      await expect(db.query("UPDATE races SET state='submitted' WHERE id=$1",[waiting.id])).rejects.toThrow(/races_state_check/);
      expect(await untouched(db)).toEqual(before);
    } finally {await db.end();}
    // The people on it carry on in the race flow, and it saves itself.
    expect((await relayFlowSetup(app).save(sam.token,'R22',[2,3],[1500,1600])).race).toMatchObject({id:waiting.id,state:'saved'});
  } finally {await app.close();}
});
test('a relay heat under way on the old build has every filled leg of its teams marked here; a saved heat keeps its marks and its To check',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  const people=await signInOwner(app,'upgrade-owner','Aisha'),owner=people.owner,sam=await people.volunteer('Sam Patel');
  await app.inject({method:'POST',url:'/api/day/confirm-events',headers:{authorization:`Bearer ${owner.token}`}});
  const relays=relayFlowSetup(app);
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204],[2301,null,2303,2304]]) await relays.team(sam.token,'R22',legs);
  await relays.tick(sam.token,'R22',1);
  const saved=(await relays.save(sam.token,'R22',[1],[1500])).race;
  await relays.tick(sam.token,'R22',2);await relays.tick(sam.token,'R22',3);
  const underWay=(await relays.worked(sam.token,'R22')).race;
  await app.close();
  // The old build marked each child here by a tap: Heat 1 saved with Team 1's 2nd child not marked (it ran short);
  // Heat 2 under way with one child of Team 2 marked and none of Team 3.
  const marks=(db:pg.Client,raceId:string,here:boolean[][])=>db.query(`UPDATE race_parts SET value=(SELECT jsonb_agg(jsonb_set(entry,'{legs}',
      (SELECT jsonb_agg(jsonb_set(leg,'{here}',to_jsonb(($2::jsonb->(n::int-1)->(i::int-1))::boolean)) ORDER BY i) FROM jsonb_array_elements(entry->'legs') WITH ORDINALITY AS l(leg,i))) ORDER BY n)
    FROM jsonb_array_elements(value) WITH ORDINALITY AS e(entry,n)) WHERE race_id=$1 AND part='runners'`,[raceId,JSON.stringify(here)]);
  const old=new pg.Client({connectionString:databaseUrl});await old.connect();
  try {
    await marks(old,saved.id,[[true,false,true,true]]);
    await marks(old,underWay.id,[[true,false,false,false],[false,false,false,false]]);
  } finally {await old.end();}
  for(let start=0;start<2;start++) {
    app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
    try {
      const legs=async(raceId:string)=>((await app.inject({url:`/api/races/${raceId}`,headers:{authorization:`Bearer ${sam.token}`}})).json() as RaceFlowRead)
        .race.parts.runners.value!.filter(isTeamEntry).map(entry=>[entry.team.number,entry.legs.map(leg=>leg.here)]);
      // An empty leg has no child to be here.
      expect(await legs(underWay.id)).toEqual([[2,[true,true,true,true]],[3,[true,false,true,true]]]);
      expect(await legs(saved.id)).toEqual([[1,[true,false,true,true]]]);
      const items=((await app.inject({url:'/api/lead/results',headers:{authorization:`Bearer ${owner.token}`}})).json() as ResultsRead).needsYou.filter(item=>item.event.code==='R22');
      expect(items.map(item=>toCheckWording(item))).toMatchObject([{title:'A team ran short',explanation:'Team 1 ran with 3 of 4 children marked here.'}]);
    } finally {await app.close();}
  }
});
test('a day an older build numbered from its counter keeps every race; numbers are unique among live races only, and the next heat follows the live heats',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/owner-sign-in',payload:{password:'upgrade-owner',name:'Aisha',profiles:[]}})).json().token as string;
  const heat1=await raceSetup(app).record(owner,'R4',[2001],[1200]),heat2=await raceSetup(app).checkIn(owner,'R4',[2002]);
  expect((await app.inject({method:'POST',url:`/api/lead/races/${heat2.id}/delete`,headers:{authorization:`Bearer ${owner}`},payload:{permanent:false}})).statusCode).toBe(200);
  await app.close();
  // The older build: every row's number unique, taken from a per-event counter that only went up (here at Heat 2).
  const races=async(db:pg.Client)=>(await db.query('SELECT id,kind,number,deleted FROM races ORDER BY number')).rows;
  const old=new pg.Client({connectionString:databaseUrl});await old.connect();
  try {
    await old.query('DROP INDEX live_race_number');
    await old.query('ALTER TABLE races ADD CONSTRAINT races_event_id_kind_number_key UNIQUE(event_id,kind,number)');
    await old.query('CREATE TABLE race_counters (event_id uuid NOT NULL REFERENCES events(id), kind text NOT NULL, last_number integer NOT NULL, PRIMARY KEY(event_id,kind))');
    await old.query("INSERT INTO race_counters(event_id,kind,last_number) SELECT id,'heat',2 FROM events WHERE code='R4'");
    expect(await races(old)).toEqual([{id:heat1.id,kind:'heat',number:1,deleted:false},{id:heat2.id,kind:'heat',number:2,deleted:true}]);
  } finally {await old.end();}
  // Started twice: the upgrade runs on every start.
  await (await createApp({databaseUrl,ownerPassword:'upgrade-owner'})).close();
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
  try {
    expect((await raceSetup(app).screen(owner,'R4')).race).toMatchObject({id:null,number:2});
    const db=new pg.Client({connectionString:databaseUrl});await db.connect();
    try {
      expect(await races(db)).toEqual([{id:heat1.id,kind:'heat',number:1,deleted:false},{id:heat2.id,kind:'heat',number:2,deleted:true}]);
      expect((await db.query("SELECT to_regclass('race_counters') AS counters")).rows).toEqual([{counters:null}]);
      // A deleted race may share its number with a live race or another deleted race; two live races never do.
      const copy=(number:number,deleted:boolean)=>db.query('INSERT INTO races(id,day_id,event_id,kind,number,deleted) SELECT gen_random_uuid(),day_id,event_id,kind,$2,$3 FROM races WHERE id=$1',[heat1.id,number,deleted]);
      await copy(1,true);await copy(2,true);
      await expect(copy(1,false)).rejects.toThrow(/live_race_number/);
    } finally {await db.end();}
  } finally {await app.close();}
});
