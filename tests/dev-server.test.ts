import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { serveWeb } from '../src/server/web.js';
let app:FastifyInstance;
afterEach(async()=>{await app?.close();});

test('npm run dev leaves /api/ to the API, so a phone can sign in, and serves the app page from Vite',async()=>{
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'dev-owner',resetTestDay:true});
  await serveWeb(app,false);
  const health=await app.inject({url:'/api/health'});
  expect(health.headers['content-type']).toMatch(/application\/json/);
  const password=await app.inject({method:'POST',url:'/api/password',payload:{password:'dev-owner'}});
  expect(password.statusCode).toBe(200);
  expect(password.json()).toMatchObject({kind:'owner'});
  expect((await app.inject({url:'/'})).body).toContain('/@vite/client');
},30000);
