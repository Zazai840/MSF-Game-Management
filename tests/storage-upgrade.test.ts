import { afterEach,expect,test } from 'vitest';
import { isRunner } from '../src/shared/races.js';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { raceSetup } from './support/races.js';
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
  await old.query('DROP TABLE submit_presses');
  await old.query('DROP TABLE job_holds');
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
    expect(lead.json().history).toContainEqual({part:'runners',version:1,author:null,at:null});
    await setup.order(owner,'R4',[2001,2002]);await setup.times(owner,'R4',[1200,1300]);
    expect(await setup.submit(owner,'R4')).toMatchObject({race:{id:null,number:2},lastSaved:{number:1,by:'Aisha'}});
    const history=(await app.inject({url:`/api/lead/races/${race.id}`,headers:{authorization:`Bearer ${owner}`}})).json().history;
    // Holds are new, so nobody held check-in when the older build's runners went in: the saved row names nobody.
    expect(history.filter((row:{at:string|null})=>row.at).map(({part,author}:{part:string;author:string})=>[part,author])).toEqual([['runners',null],['finish','Aisha'],['times','Aisha']]);
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
test('the boot script adds the relay mark, the team store and the teams job to a day the current build started, leaving its events, holds and races as they were and adding no relays',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  const owner=(await app.inject({method:'POST',url:'/api/owner-sign-in',payload:{password:'upgrade-owner',name:'Aisha',profiles:[]}})).json().token as string;
  const race=await raceSetup(app).checkIn(owner,'R4',[2001,2002]);
  await app.close();
  // The current build: its day has the 20 individual events, no relay mark, no team store and only the race jobs.
  const current=new pg.Client({connectionString:databaseUrl});await current.connect();
  await current.query("DELETE FROM events WHERE code IN ('R19','R20','R21','R22','R27','R28')");
  await current.query('ALTER TABLE events DROP COLUMN relay');
  await current.query('DROP TABLE relay_teams');
  await current.query("ALTER TABLE job_holds DROP CONSTRAINT job_holds_job_check, ADD CONSTRAINT job_holds_job_check CHECK (job IN ('check-in','order','times'))");
  await current.end();
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
  try {
    const day=(await app.inject({url:'/api/day',headers:{authorization:`Bearer ${owner}`}})).json();
    expect(day.events).toHaveLength(20);
    expect(day.events.every((event:{relay:boolean})=>event.relay===false)).toBe(true);
    const screen=await raceSetup(app).screen(owner,'R4');
    expect(screen.race).toMatchObject({id:race.id,state:'in progress'});
    expect(screen.race.parts.runners.value?.filter(isRunner).map(runner=>runner.wristband)).toEqual([2001,2002]);
    expect(screen.holds['check-in']?.name).toBe('Aisha');
    const db=new pg.Client({connectionString:databaseUrl});await db.connect();
    try {
      expect((await db.query("SELECT to_regclass('relay_teams') IS NOT NULL AS teams")).rows).toEqual([{teams:true}]);
      expect((await db.query("SELECT pg_get_constraintdef(oid) AS jobs FROM pg_constraint WHERE conname='job_holds_job_check'")).rows[0].jobs).toContain("'teams'");
    } finally {await db.end();}
  } finally {await app.close();}
});
