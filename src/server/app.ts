import Fastify from 'fastify';
import { openDatabase } from './storage.js';
import { accessRoutes } from './access/routes.js';
import { dayRoutes } from './day/routes.js';
import { homeRoutes } from './home/routes.js';
import { Refusal } from './access/permissions.js';
export interface AppSettings { databaseUrl: string; ownerPassword: string; resetTestDay?: boolean }
export async function createApp(settings: AppSettings) {
  if (!settings.ownerPassword || !settings.databaseUrl) throw new Error('DATABASE_URL and OWNER_PASSWORD are required');
  const app = Fastify({logger: false});
  const pool = await openDatabase(settings.databaseUrl, settings.resetTestDay);
  app.addHook('onClose', async () => { await pool.end(); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Refusal) return reply.code(error.statusCode).send({message:error.message});
    if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({message:'Check what you entered and try again'});
    }
    app.log.error(error);
    return reply.code(500).send({message:'Something went wrong - please try again'});
  });
  accessRoutes(app, pool, settings.ownerPassword);
  dayRoutes(app, pool);
  homeRoutes(app, pool);
  return app;
}
