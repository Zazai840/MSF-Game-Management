import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { listRaces,readStepMeta } from '../src/server/races/records.js';
import type { RacesRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance,pool:pg.Pool|undefined;
const call=(token:string,url:string)=>app.inject({url,headers:{authorization:`Bearer ${token}`}});
afterEach(async()=>{await pool?.end();pool=undefined;await app?.close();});
// A race page and an event's results read one event: reading only its rows gives what the whole day's rows filtered give.
test('Races and step details read for one event are the whole day\'s, filtered to that event',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'scoped-owner',resetTestDay:true});
  const people=await signInOwner(app,'scoped-owner'),setup=raceSetup(app),volunteer=(await people.volunteer('Sam')).token;
  await setup.record(volunteer,'R4',[2001,3045],[900,950]);
  await setup.checkIn(volunteer,'R4',[2002]);
  await setup.record(volunteer,'R7',[101],[1000]);
  const dayId=(await call(volunteer,'/api/home')).json().phone.dayId as string;
  const event=((await call(volunteer,'/api/races')).json() as RacesRead).groups.find(group=>group.event.code==='R4')!.event;
  pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  const all=await listRaces(pool,dayId),one=await listRaces(pool,dayId,event.id);
  expect(one.length).toBe(2);
  expect(one).toEqual(all.filter(race=>race.event.id===event.id));
  const allMeta=await readStepMeta(pool,dayId),oneMeta=await readStepMeta(pool,dayId,event.id);
  expect([...oneMeta.keys()].sort()).toEqual(one.map(race=>race.id).sort());
  for(const race of one) expect(oneMeta.get(race.id)).toEqual(allMeta.get(race.id));
});
