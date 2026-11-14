import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import type { RacesRead } from '../src/shared/race-flow.js';
import { frames,openRaces as open } from './support/live.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
afterEach(async()=>{await app?.close();});
const snapshots=(text:string)=>frames<RacesRead>(text),openRaces=(token:string,acceptEncoding?:string)=>open(app,token,acceptEncoding);
async function start(streamSettings:{streamHeartbeatMs?:number;streamLimitMs?:number}={}) {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'gzip-owner',resetTestDay:true,...streamSettings});
  await app.listen({port:0,host:'127.0.0.1'});
  const sam=(await (await signInOwner(app,'gzip-owner','Aisha')).volunteer('Sam')).token;
  const newHeat=()=>app.inject({method:'POST',url:'/api/races',headers:{authorization:`Bearer ${sam}`},payload:{eventCode:'R4',kind:'heat',number:1}});
  return {sam,newHeat};
}
const r4Races=(read:RacesRead)=>read.groups.find(group=>group.event.code==='R4')!.races;

test('a phone that accepts gzip gets the live stream gzipped, each snapshot and heartbeat at once, and the planned end closes it cleanly',async()=>{
  const {sam,newHeat}=await start({streamHeartbeatMs:200,streamLimitMs:3000});
  const live=await openRaces(sam,'gzip, deflate, br');
  expect(live.headers).toMatchObject({'content-type':'text/event-stream','cache-control':'no-cache, no-transform','x-accel-buffering':'no','content-encoding':'gzip',vary:'accept-encoding'});
  await live.until(text=>snapshots(text).length===1);
  expect(live.text()).toMatch(/^data: \{.*\}\n\n/);
  await newHeat();
  await live.until(text=>snapshots(text).length===2);
  expect(r4Races(snapshots(live.text())[1])).toHaveLength(1);
  await live.until(text=>text.includes(': hb\n\n'));
  await live.ended;
});
test('a phone that does not accept gzip gets the live stream as plain text',async()=>{
  const {sam,newHeat}=await start();
  const live=await openRaces(sam);
  expect(live.headers['content-encoding']).toBeUndefined();
  expect(live.headers.vary).toBeUndefined();
  await live.until(text=>snapshots(text).length===1);
  expect(live.text()).toMatch(/^data: \{.*\}\n\n$/);
  await newHeat();
  await live.until(text=>snapshots(text).length===2);
  expect(r4Races(snapshots(live.text())[1])).toHaveLength(1);
});
