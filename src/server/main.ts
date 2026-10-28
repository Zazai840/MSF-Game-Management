import { readFile } from 'node:fs/promises';
import { createApp } from './app.js';
import { serveWeb } from './web.js';
const production = process.env.NODE_ENV === 'production';
const app = await createApp({
  buildId:production ? await readFile(new URL('../../web/build-id',import.meta.url),'utf8') : undefined,
  databaseUrl:process.env.DATABASE_URL || '', ownerPassword:process.env.OWNER_PASSWORD || '', resetTestDay:process.env.RESET_TEST_DAY === '1',
  trustedProxyHops:Number(process.env.TRUSTED_PROXY_HOPS || 0),
  logTo:process.env.NODE_ENV === 'production' ? process.stdout : undefined,
  testBuild:process.env.TEST_BUILD === '1' ? {commit:process.env.RAILWAY_GIT_COMMIT_SHA} : undefined
});
await serveWeb(app, production);
await app.listen({host:process.env.HOST || '127.0.0.1',port:Number(process.env.PORT || 3000)});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
