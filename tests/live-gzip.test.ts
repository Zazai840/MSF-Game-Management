import { afterEach,expect,test } from 'vitest';
import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { dayListeners } from '../src/server/live/changes.js';
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
  expect(live.open()).toBe(true);
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
test.each([['gzipped','gzip'],['plain',undefined]])('phones that drop the live stream while the server still reads it, %s, leave nothing behind: no day listener, and the server closes',async(_name,encoding)=>{
  const {sam}=await start();
  const {port}=app.server.address() as AddressInfo,headers={authorization:`Bearer ${sam}`,...(encoding?{'accept-encoding':encoding}:{})};
  const {dayId}=(await app.inject({url:'/api/me',headers})).json() as {dayId:string};
  // 20 phones each ask and give up 1-5 ms later, mostly while the server is still in its first read.
  await Promise.all(Array.from({length:20},(_,i)=>new Promise<void>(resolve=>{
    const request=get({host:'127.0.0.1',port,path:'/api/live/races?changes=1',headers}).on('error',()=>resolve()).on('close',()=>resolve());
    setTimeout(()=>request.destroy(),1+i%5);
  })));
  await new Promise(resolve=>setTimeout(resolve,1000));
  expect(dayListeners(dayId)).toBe(0);
  const closing=app.close().then(()=>'closed');
  expect(await Promise.race([closing,new Promise(resolve=>setTimeout(()=>resolve('still closing after 4 s'),4000))])).toBe('closed');
});
