import { resolve } from 'node:path';
import { createApp } from './app.js';
const app = await createApp({databaseUrl:process.env.DATABASE_URL || '', ownerPassword:process.env.OWNER_PASSWORD || '', resetTestDay:process.env.RESET_TEST_DAY === '1', trustedProxyHops:Number(process.env.TRUSTED_PROXY_HOPS || 0)});
app.get('/api/health', () => ({ok:true}));
if (process.env.NODE_ENV === 'production') {
  const {default:staticFiles} = await import('@fastify/static');
  await app.register(staticFiles, {root:resolve('dist/web'), wildcard:false});
  app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({message:'Not found'}) : reply.sendFile('index.html'));
} else {
  const {default:middie} = await import('@fastify/middie');
  const {createServer} = await import('vite');
  const vite = await createServer({server:{middlewareMode:true},appType:'spa'});
  await app.register(middie);
  app.use(vite.middlewares);
  app.addHook('onClose', async () => { await vite.close(); });
}
await app.listen({host:process.env.HOST || '127.0.0.1',port:Number(process.env.PORT || 3000)});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
