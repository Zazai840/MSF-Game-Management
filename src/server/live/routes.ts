import type { FastifyInstance,FastifyReply } from 'fastify';
import type pg from 'pg';
import { actions,Refusal,signedOut } from '../access/permissions.js';
import type { Phone } from '../../shared/domain.js';
import type { RacesRead } from '../../shared/race-flow.js';
import { raceFlowRead,racesRead } from '../races/race-flow.js';
import { resultsSnapshot } from '../results/read.js';
import { changesSoFar,onDayChange } from './changes.js';
export interface StreamSettings { heartbeatMs:number; limitMs:number; buildId?:string }
/**
 * Live streams (Server-Sent Events). Each frame is a whole snapshot versioned by the day revision, sent first on
 * every connect and again after each change of the day that raises the revision. A heartbeat comment keeps idle
 * streams open through Railway, and each stream ends at its limit so the phone reconnects to a fresh one.
 */
export function liveRoutes(app:FastifyInstance,pool:pg.Pool,settings:StreamSettings) {
  const action=actions(app,pool),open=new Set<()=>void>();
  // An open stream would hold app.close() until its planned end.
  app.addHook('preClose',async()=>{for(const end of open) end();});
  async function stream<T extends {revision:number}>(reply:FastifyReply,dayId:string,read:()=>Promise<T>) {
    // A refusal on the first read (a new day, an unknown event) answers as an ordinary error, before the stream starts.
    const before=changesSoFar();
    let sent=await read();
    reply.hijack();
    const raw=reply.raw,ended=()=>raw.writableEnded || raw.destroyed;
    const write=(text:string)=>{if(!ended()) raw.write(text);};
    const end=()=>{if(!ended()) raw.end();};
    raw.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','x-accel-buffering':'no'});
    // Every snapshot carries the build id, so a phone on another build reloads.
    const send=(snapshot:T)=>write(`data: ${JSON.stringify({...snapshot,build:settings.buildId})}\n\n`);
    send(sent);
    // shortcut: every race's stream reads its own snapshot per change (the races list's share one); share those too if Postgres load shows it.
    let reading=false,again=false;
    async function changed() {
      if(reading) {again=true;return;}
      reading=true;
      try {
        do {again=false;const next=await read();if(next.revision>sent.revision) {sent=next;send(next);}} while(again && !ended());
      } catch(error) {
        // The phone reconnects and is told why (a new day, a removed event).
        if(!(error instanceof Refusal)) app.log.error(error);
        end();
      } finally {reading=false;}
    }
    const heartbeat=setInterval(()=>write(': hb\n\n'),settings.heartbeatMs),limit=setTimeout(end,settings.limitMs);
    const stop=onDayChange(dayId,()=>void changed());
    open.add(end);
    raw.on('close',()=>{clearInterval(heartbeat);clearTimeout(limit);stop();open.delete(end);});
    // A change told while the first read ran found no listener yet: read again so it is not lost.
    if(changesSoFar()!==before) void changed();
  }
  // The races list is the same for every phone of the day, so its streams share one read per change: the read begun since the latest change.
  function sharedReads<T>(readDay:(db:pg.PoolClient,dayId:string)=>Promise<T>) {
    const reads=new Map<string,{at:number;read:Promise<T>}>();
    return (dayId:string)=>{
      const at=changesSoFar();let held=reads.get(dayId);
      if(held?.at!==at) {
        const read=resultsSnapshot(pool,dayId,db=>readDay(db,dayId));
        reads.set(dayId,held={at,read});
        read.catch(()=>{if(reads.get(dayId)?.read===read) reads.delete(dayId);});
      }
      return held.read;
    };
  }
  const sharedRacesRead=sharedReads<RacesRead>(racesRead);
  const signedIn=async(phone:Phone)=>{if(!(await pool.query('SELECT 1 FROM sign_ins WHERE id=$1 AND NOT signed_out',[phone.id])).rowCount) throw signedOut();};
  action('GET','/api/live/races','Volunteer',(_request,reply,phone)=>stream(reply,phone.dayId,async()=>{
    await signedIn(phone);
    return sharedRacesRead(phone.dayId);
  }));
  action('GET','/api/live/races/:raceId','Volunteer',(request,reply,phone)=>{
    const raceId=(request.params as {raceId:string}).raceId;
    // A sign-out wakes the streams, so a signed-out phone's stream ends and its reconnect is told why.
    return stream(reply,phone.dayId,()=>resultsSnapshot(pool,phone.dayId,async db=>{
      if(!(await db.query('SELECT 1 FROM sign_ins WHERE id=$1 AND NOT signed_out',[phone.id])).rowCount) throw signedOut();
      return raceFlowRead(db,phone.dayId,raceId);
    }));
  });
}
