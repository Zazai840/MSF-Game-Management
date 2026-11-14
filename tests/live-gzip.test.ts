import { afterEach,expect,test } from 'vitest';
import { get,type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGunzip } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { frameData,splitFrames } from '../src/shared/live.js';
import type { RacesRead } from '../src/shared/race-flow.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
afterEach(async()=>{await app?.close();});
const snapshots=(text:string)=>splitFrames(text).frames.map(frameData).filter(data=>data!==null).map(data=>JSON.parse(data) as RacesRead);
/** The races list stream as that phone, read as raw HTTP so the test sees the wire: the text it decodes to so far, and a wait for more. */
async function openRaces(token:string,acceptEncoding?:string) {
  const {port}=app.server.address() as AddressInfo;
  const response=await new Promise<IncomingMessage>((resolve,reject)=>get({host:'127.0.0.1',port,path:'/api/live/races',headers:{authorization:`Bearer ${token}`,...(acceptEncoding?{'accept-encoding':acceptEncoding}:{})}},resolve).on('error',reject));
  const body=response.headers['content-encoding']==='gzip'?response.pipe(createGunzip()):response;
  let text='';
  body.setEncoding('utf8').on('data',(chunk:string)=>{text+=chunk;});
  const ended=new Promise(resolve=>body.on('end',resolve));
  // Prompt means nothing waits in a compressor: each frame decodes as soon as it is sent.
  const until=async(seen:(text:string)=>boolean)=>{
    for(const start=Date.now();!seen(text);await new Promise(resolve=>setTimeout(resolve,10))) if(Date.now()-start>2000) throw new Error(`Waited 2 s for the stream, got: ${text}`);
  };
  return {headers:response.headers,text:()=>text,until,ended};
}
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
