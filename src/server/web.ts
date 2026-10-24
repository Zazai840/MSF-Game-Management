import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
/** Serves the phone app beside the API: the built files in production, Vite's dev server otherwise. */
export async function serveWeb(app:FastifyInstance,production:boolean) {
  if (production) {
    const {default:staticFiles} = await import('@fastify/static');
    await app.register(staticFiles, {root:resolve('dist/web'), wildcard:false});
    app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({message:'Not found'}) : reply.sendFile('index.html'));
  } else {
    const {default:middie} = await import('@fastify/middie');
    const {createServer} = await import('vite');
    const vite = await createServer({server:{middlewareMode:true},appType:'spa'});
    await app.register(middie);
    // Middleware runs before routing, so Vite would answer /api/ itself (its page for a GET, a 404 for a POST).
    app.use((request,response,next) => request.url?.startsWith('/api/') ? next() : vite.middlewares(request,response,next));
    app.addHook('onClose', async () => { await vite.close(); });
  }
}
