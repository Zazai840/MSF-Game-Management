import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { afterFrame,type Changes } from '../src/shared/live.js';
import type { RaceGroup,RacesRead } from '../src/shared/race-flow.js';
import { frames,openRaces } from './support/live.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
afterEach(async()=>{await app?.close();});
type Frame=RacesRead|Changes<RaceGroup>;

test.each([['gzipped','gzip'],['plain',undefined]])('the races list stream, %s: the whole list first, then only each changed event group, and the whole list again on a new connection or an event switched off',async(_name,encoding)=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'changes-owner',resetTestDay:true});
  await app.listen({port:0,host:'127.0.0.1'});
  const {owner,volunteer}=await signInOwner(app,'changes-owner','Aisha');
  const sam=(await volunteer('Sam')).token;
  const post=(token:string,url:string,payload:object)=>app.inject({method:'POST',url,headers:{authorization:`Bearer ${token}`},payload});
  const list=async()=>(await app.inject({url:'/api/races',headers:{authorization:`Bearer ${sam}`}})).json() as RacesRead;
  const sizes=(text:string)=>text.split('\n\n').filter(frame=>frame.startsWith('data: ')).map(frame=>frame.length);
  const live=await openRaces(app,sam,encoding);
  expect(live.headers['content-encoding']).toBe(encoding);
  await live.until(text=>frames(text).length===1);
  const [first]=frames<Frame>(live.text());
  expect(first).not.toHaveProperty('from');
  expect(first).toMatchObject(await list());

  expect((await post(sam,'/api/races',{eventCode:'R4',kind:'heat',number:1})).statusCode).toBe(200);
  await live.until(text=>frames(text).length===2);
  const changes=frames<Frame>(live.text())[1] as Changes<RaceGroup>;
  expect(changes).toMatchObject({revision:first.revision+1,from:first.revision});
  expect(changes.groups.map(group=>group.event.code)).toEqual(['R4']);
  // The phone's list after it is the server's list now; the frame is a small part of the whole one (26 events with no races yet).
  expect(afterFrame(first,changes)).toMatchObject(await list());
  const [whole,small]=sizes(live.text());
  expect(small*5).toBeLessThan(whole);

  // A new connection starts with the whole list.
  const second=await openRaces(app,sam,encoding);
  await second.until(text=>frames(text).length===1);
  expect(frames<Frame>(second.text())[0]).not.toHaveProperty('from');
  expect(frames<Frame>(second.text())[0]).toMatchObject(await list());

  // An event switched off sends the whole list, without it.
  expect((await post(owner.token,'/api/day/events/R4/enabled',{enabled:false})).statusCode).toBe(200);
  await live.until(text=>frames(text).length===3);
  const off=frames<Frame>(live.text())[2];
  expect(off).not.toHaveProperty('from');
  expect(off.groups.some(group=>group.event.code==='R4')).toBe(false);
  expect(off).toMatchObject(await list());
});
