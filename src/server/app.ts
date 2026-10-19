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
import { thatsMeRoutes } from './access/thats-me.js';
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
import { liveRoutes } from './live/routes.js';
export interface AppSettings {
  databaseUrl: string; ownerPassword: string; resetTestDay?: boolean; trustedProxyHops?: number;
  // Turns on request logging (JSON lines); codes and the owner password only travel in bodies, which Fastify never logs.
  logTo?: NodeJS.WritableStream;
  /** Marks a public test deployment; its commit is shown to testers and carried into bug reports. */
  testBuild?: {commit?: string};
  /** Live streams: how often an idle stream sends a heartbeat (Railway cuts a stream after 5 minutes of silence), and when each stream ends (Railway's hard cap is 15 minutes). */
  streamHeartbeatMs?: number; streamLimitMs?: number;
  /** The web build this server serves, sent on every response and live snapshot; a phone running another build reloads. */
  buildId?: string;
}
const bugReportUrl = 'https://github.com/Zazai840/MSF-Game-Management/issues/new?template=tester-bug.yml';
export async function createApp(settings: AppSettings) {
  if (!settings.ownerPassword || !settings.databaseUrl) throw new Error('DATABASE_URL and OWNER_PASSWORD are required');
  const hops = settings.trustedProxyHops || 0;
  // Trust only the nearest proxy hops, never all: a phone can prepend its own forwarded address. Fastify 5.12 ignores a bare hop count, so it is spelled as a function.
  const app = Fastify({
    logger: settings.logTo ? {stream:settings.logTo, redact:['req.headers.authorization']} : false,
    trustProxy: hops > 0 && ((_address: string, hop: number) => hop < hops)
  });
  const pool = await openDatabase(settings.databaseUrl, settings.resetTestDay);
  app.addHook('onClose', async () => { await pool.end(); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Refusal) return reply.code(error.statusCode).send({...error.details, message:error.message});
    if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({message:'Check what you entered and try again'});
    }
    app.log.error(error);
    return reply.code(500).send({message:'Something went wrong - please try again'});
  });
  // Set on the raw response so hijacked live streams carry it too.
  if (settings.buildId) app.addHook('onRequest', async (_request, reply) => { reply.raw.setHeader('x-build-id', settings.buildId!); });
  const testBuild = settings.testBuild && {commit:settings.testBuild.commit || 'unknown', reportUrl:bugReportUrl};
  app.get('/api/health', () => testBuild ? {ok:true, testBuild} : {ok:true});
  accessRoutes(app, pool, settings.ownerPassword);
  thatsMeRoutes(app, pool);
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
  liveRoutes(app,pool,{heartbeatMs:settings.streamHeartbeatMs ?? 15_000,limitMs:settings.streamLimitMs ?? 600_000,buildId:settings.buildId});
  return app;
}
