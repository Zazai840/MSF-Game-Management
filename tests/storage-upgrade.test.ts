import { afterEach,expect,test } from 'vitest';
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
  // The older build: no race state, saved mark, Submit presses or holders in history, and a competing Times save.
  const old=new pg.Client({connectionString:databaseUrl});await old.connect();
  await old.query('DROP TABLE submit_presses');
  await old.query('ALTER TABLE races DROP COLUMN state, DROP COLUMN saved_at, DROP COLUMN saved_by');
  await old.query('ALTER TABLE race_part_history DROP COLUMN held_by');
  await old.query(`INSERT INTO race_part_saves(id,race_id,part,base_version,version,author_name,value,runners,before_runners) VALUES(gen_random_uuid(),$1,'times',0,1,'Jo','{"places":[1200,1300],"outOfOrder":false}','[]','[]'),(gen_random_uuid(),$1,'times',0,1,'Ali','{"places":[1250,1300],"outOfOrder":false}','[]','[]')`,[race.id]);
  await old.end();
  app=await createApp({databaseUrl,ownerPassword:'upgrade-owner'});
  try {
    const setup=raceSetup(app),screen=await setup.screen(owner,'R4');
    expect(screen.race).toMatchObject({id:race.id,state:'in progress'});
    await setup.order(owner,'R4',[2001,2002]);await setup.times(owner,'R4',[1200,1300]);
    expect(await setup.submit(owner,'R4')).toMatchObject({race:{id:null,number:2},lastSaved:{number:1,by:'Aisha'}});
  } finally {await app.close();}
});
