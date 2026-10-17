import { exportRoutes } from './day/export.js';
import { finalRoutes } from './rulings/finals.js';
import { resetRoutes } from './day/reset.js';
import { stageRoutes } from './rulings/stages.js';
import { raceRulingRoutes } from './rulings/races.js';
import { clashRoutes } from './rulings/clashes.js';
import Fastify from 'fastify';
import { phoneManagementRoutes } from './access/management.js';
import { openDatabase } from './storage.js';
import { accessRoutes } from './access/routes.js';
import { dayRoutes } from './day/routes.js';
import { homeRoutes } from './home/routes.js';
import { Refusal } from './access/permissions.js';
import { runnerRulingRoutes } from './rulings/runners.js';
import { rulingRoutes } from './rulings/routes.js';
import { tieRoutes } from './rulings/ties.js';
import { resultsRoutes } from './results/routes.js';
import { timesRoutes } from './races/times.js';
import { finishOrderRoutes } from './races/finish.js';
import { raceRoutes } from './races/routes.js';
// logTo turns on request logging (JSON lines); codes and the owner password only travel in bodies, which Fastify never logs
export interface AppSettings { databaseUrl: string; ownerPassword: string; resetTestDay?: boolean; trustedProxyHops?: number; logTo?: NodeJS.WritableStream }
export async function createApp(settings: AppSettings) {
  if (!settings.ownerPassword || !settings.databaseUrl) throw new Error('DATABASE_URL and OWNER_PASSWORD are required');
  const hops = settings.trustedProxyHops || 0;
  // Trust only the nearest proxy hops, never all: a phone can prepend its own forwarded address. Fastify 5.12 ignores a bare hop count, so it is spelled as a function.
  const app = Fastify({logger: settings.logTo ? {stream:settings.logTo, redact:['req.headers.authorization']} : false, trustProxy: hops > 0 && ((_address: string, hop: number) => hop < hops)});
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
  phoneManagementRoutes(app,pool);
  dayRoutes(app, pool);
  resetRoutes(app,pool);
  exportRoutes(app,pool);
  homeRoutes(app, pool);
  raceRoutes(app,pool);
  finishOrderRoutes(app,pool);
  timesRoutes(app,pool);
  resultsRoutes(app,pool);
  rulingRoutes(app,pool);
  clashRoutes(app,pool);
  runnerRulingRoutes(app,pool);
  raceRulingRoutes(app,pool);
  tieRoutes(app,pool);
  stageRoutes(app,pool);
  finalRoutes(app,pool);
  return app;
}
