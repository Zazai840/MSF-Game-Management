import { afterEach,expect,test } from 'vitest';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { eventPhases,medalsDecided,nextPhase,stagesOf,type EventPhase } from '../src/shared/event-phase.js';
import type { Stage } from '../src/shared/stages.js';
test('an event is in one phase, and each phase says which stages are complete',()=>{
  expect(eventPhases.map(phase=>stagesOf(phase,'heats'))).toEqual([[],['heats'],['heats','final'],['no-final']]);
  expect(stagesOf('racing','timed')).toEqual([]);
  expect(stagesOf('medals','timed')).toEqual(['event']);
  expect(eventPhases.filter(medalsDecided)).toEqual(['medals','no final']);
});
test('one table says where completing or reopening a stage leads, and refuses every other move',()=>{
  const moves:Array<['heats'|'timed',EventPhase,Stage,boolean,EventPhase]>=[
    ['timed','racing','event',false,'medals'],['timed','medals','event',true,'racing'],
    ['heats','racing','heats',false,'final'],['heats','final','heats',true,'racing'],['heats','medals','heats',true,'racing'],
    ['heats','final','final',false,'medals'],['heats','medals','final',true,'final'],
    ['heats','racing','no-final',false,'no final'],['heats','final','no-final',false,'no final'],['heats','no final','no-final',true,'racing']
  ];
  for(const format of ['heats','timed'] as const) for(const phase of eventPhases) for(const stage of ['event','heats','final','no-final'] as const) for(const reopening of [false,true]) {
    const move=moves.find(move=>move[0]===format && move[1]===phase && move[2]===stage && move[3]===reopening);
    expect([format,phase,stage,reopening,nextPhase(phase,format,stage,reopening)]).toEqual([format,phase,stage,reopening,move?.[4]??null]);
  }
});
const adminUrl=process.env.PG_ADMIN_URL || `postgresql://${process.env.USER}@localhost:5432/postgres`;
// The name a test database must have to be reset; the process id keeps it apart from the other upgrade test.
const name=`msf_spec22_${Date.now()}${process.pid}_test`;
const databaseUrl=Object.assign(new URL(adminUrl),{pathname:`/${name}`}).href;
const admin=async(sql:string)=>{const client=new pg.Client({connectionString:adminUrl});await client.connect();try {await client.query(sql);} finally {await client.end();}};
afterEach(()=>admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
test('the boot script turns the stage rows an older build left into each event\'s phase, once, and keeps the old rows aside',async()=>{
  await admin(`CREATE DATABASE "${name}"`);
  let app=await createApp({databaseUrl,ownerPassword:'upgrade-owner',resetTestDay:true});
  await app.inject({method:'POST',url:'/api/owner-sign-in',payload:{password:'upgrade-owner',name:'Aisha',profiles:[]}});
  await app.close();
  const db=new pg.Client({connectionString:databaseUrl});await db.connect();
  const heats=(await db.query("SELECT id FROM events WHERE format='heats' ORDER BY code LIMIT 4")).rows.map(row=>row.id as string);
  const timed=(await db.query("SELECT id FROM events WHERE format='timed' ORDER BY code LIMIT 2")).rows.map(row=>row.id as string);
  expect([heats.length,timed.length]).toEqual([4,2]);
  // The older build: no phase, and a row per complete stage.
  await db.query('ALTER TABLE events DROP COLUMN phase');
  await db.query('CREATE TABLE event_stages (event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, stage text NOT NULL, PRIMARY KEY(event_id,stage))');
  await db.query("INSERT INTO event_stages(event_id,stage) VALUES($1,'heats'),($2,'heats'),($2,'final'),($3,'no-final'),($4,'event')",[heats[0],heats[1],heats[2],timed[0]]);
  const phases=async()=>Object.fromEntries((await db.query('SELECT id,phase FROM events WHERE id=ANY($1::uuid[])',[[...heats,...timed]])).rows.map(row=>[row.id,row.phase]));
  const expected={[heats[0]]:'final',[heats[1]]:'medals',[heats[2]]:'no final',[heats[3]]:'racing',[timed[0]]:'medals',[timed[1]]:'racing'};
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});await app.close();
  expect(await phases()).toEqual(expected);
  const tables=async()=>(await db.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'event_stages%' ORDER BY 1")).rows.map(row=>row.table_name);
  expect(await tables()).toEqual(['event_stages_before_phase']);
  // A later boot leaves a phase a lead has since changed alone.
  await db.query("UPDATE events SET phase='racing' WHERE id=$1",[heats[1]]);
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});await app.close();
  expect(await phases()).toEqual({...expected,[heats[1]]:'racing'});
  await db.end();
});
