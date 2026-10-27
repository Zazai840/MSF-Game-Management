import { afterEach,expect,test } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { frameData,splitFrames } from '../src/shared/live.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
afterEach(async()=>{await app?.close();});
const build='5f0c2a9e-build-under-test';

test('every API response and every live snapshot carries the build id, so a phone on another build reloads',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'build-owner',resetTestDay:true,buildId:build});
  await app.listen({port:0,host:'127.0.0.1'});
  const people=await signInOwner(app,'build-owner','Aisha');
  const volunteer=(await people.volunteer('Sam')).token,headers={authorization:`Bearer ${volunteer}`};
  expect((await app.inject({url:'/api/health'})).headers['x-build-id']).toBe(build);
  expect((await app.inject({url:'/api/home',headers})).headers['x-build-id']).toBe(build);
  // Refusals too: an old phone's write to a path that no longer exists still learns the build.
  expect((await app.inject({method:'POST',url:'/api/no-such-write',headers})).headers['x-build-id']).toBe(build);
  const race=(await app.inject({method:'POST',url:'/api/races',headers,payload:{eventCode:'R4',kind:'heat',number:1}})).json().race;
  const {port}=app.server.address() as AddressInfo;
  const response=await fetch(`http://127.0.0.1:${port}/api/live/races/${race.id}`,{headers});
  expect(response.headers.get('x-build-id')).toBe(build);
  const reader=response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let text='';
  while(!splitFrames(text).frames.length) {
    const {done,value}=await reader.read();
    if(done) throw new Error(`The stream ended before its first snapshot: ${text}`);
    text+=value;
  }
  expect(JSON.parse(frameData(splitFrames(text).frames[0])!)).toMatchObject({build,group:{event:{code:'R4'}}});
  await reader.cancel();
});
