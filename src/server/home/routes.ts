import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { readResults,resultsSnapshot } from '../results/read.js';
import { listRaces } from '../races/records.js';
import { timesWaiting } from '../../shared/recording.js';
import { actions } from '../access/permissions.js';
import { readEvents } from '../day/events.js';
import { currentRaces } from '../races/current.js';
import type { HomeEvent } from '../../shared/race-screen.js';
export function homeRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app, pool);
  action('GET', '/api/home', 'Volunteer', (_request, _reply, phone) => resultsSnapshot(pool,phone.dayId,async db=>{
    const allRaces=await listRaces(db,phone.dayId),races=allRaces.filter(race=>!race.stageComplete);
    // Waiting means not counted yet, with the job's part still missing.
    const start=races.filter(race=>!race.recording.readyForRanking && race.parts.finish.value===null && race.kind!=='final').length;
    const finish=races.filter(race=>!race.recording.readyForRanking && race.parts.finish.value===null && (race.kind!=='final'||race.final?.heatsComplete||race.final?.hasRun)).length;
    const events=await readEvents(db,true,phone.dayId),current=await currentRaces(db,phone.dayId,events,allRaces);
    return {phone, events:events.map(({id,code,name,section}):HomeEvent=>{const {kind,number}=current.get(id)!;return {code,name,section,race:{kind,number}};}), waiting: {'Start line':start, 'Finish order':finish, Times:timesWaiting(races).length},
      ...(phone.level === 'Volunteer' ? {} : {needsYou:await readResults(db,phone.dayId,allRaces).then(read=>read.needsYou.length+read.profileRequests.length)})};
  }));
  action('GET', '/api/lead', 'Lead', (_request,_reply,phone)=>resultsSnapshot(pool,phone.dayId,db=>readResults(db,phone.dayId)));
}
