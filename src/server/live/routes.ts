import type { FastifyInstance,FastifyReply } from 'fastify';
import type pg from 'pg';
import { pipeline } from 'node:stream';
import { constants,createGzip } from 'node:zlib';
import { actions,Refusal,signedOut } from '../access/permissions.js';
import type { Phone } from '../../shared/domain.js';
import { changesFrame } from '../../shared/live.js';
import type { RacesRead } from '../../shared/race-flow.js';
import { raceFlowRead,racesRead } from '../races/race-flow.js';
import { resultsSnapshot } from '../results/read.js';
import { changesSoFar,onDayChange } from './changes.js';
export interface StreamSettings { heartbeatMs:number; limitMs:number; buildId?:string }
// A snapshot that differs at the same revision is sent too: a reported role is no change of the day (ADR 0007).
const whole=<T extends {revision:number}>(sent:T,next:T)=>next.revision>sent.revision || (next.revision===sent.revision && JSON.stringify(next)!==JSON.stringify(sent))?next:null;
/**
 * Live streams (Server-Sent Events). Each frame is a snapshot versioned by the day revision, sent whole first on
 * every connect and again after each change of the day that raises the revision; the races list sends only its changed
 * event groups after the first (`changesFrame`) to a phone that asks (`?changes=1`). A heartbeat comment keeps idle
 * streams open through Railway, and each stream ends at its limit so the phone reconnects to a fresh one.
 */
export function liveRoutes(app:FastifyInstance,pool:pg.Pool,settings:StreamSettings) {
  const action=actions(app,pool),open=new Set<()=>Promise<unknown>>();
  // An open stream would hold app.close() until its planned end. A gzipped one ends a moment after end(), so wait for it.
  app.addHook('preClose',async()=>{await Promise.all([...open].map(close=>close()));});
  async function stream<T extends {revision:number}>(reply:FastifyReply,dayId:string,read:()=>Promise<T>,frame:(sent:T,next:T)=>object|null=whole) {
    // A refusal on the first read (a new day, an unknown event) answers as an ordinary error, before the stream starts.
    const before=changesSoFar();
    let sent=await read();
    reply.hijack();
    // A phone that gave up during that read has closed already, so the close listener below would never run: nothing to stream.
    if(reply.raw.destroyed) return;
    // Railway's edge does not compress an event stream, so a phone that accepts gzip gets it gzipped here. Each write is
    // flushed at once (nothing waits in the compressor), and level 3 costs a tenth of level 6's CPU for a few KB more per frame.
    // shortcut: `gzip;q=0` would count as accepted; no browser sends it.
    const raw=reply.raw,gzip=/\bgzip\b/.test(reply.request.headers['accept-encoding'] ?? '')?createGzip({level:3,flush:constants.Z_SYNC_FLUSH}):null;
    const out=gzip ?? raw;
    const ended=()=>out.writableEnded || out.destroyed || raw.destroyed;
    const write=(text:string)=>{if(!ended()) out.write(text);};
    const end=()=>{if(!ended()) out.end();};
    raw.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','x-accel-buffering':'no',...(gzip?{'content-encoding':'gzip',vary:'accept-encoding'}:{})});
    // A dropped phone destroys the gzip stream too.
    if(gzip) pipeline(gzip,raw,()=>{});
    // Every snapshot carries the build id, so a phone on another build reloads.
    const send=(snapshot:object)=>write(`data: ${JSON.stringify({...snapshot,build:settings.buildId})}\n\n`);
    send(sent);
    // shortcut: every race's stream reads its own snapshot per change (the races list's share one); share those too if Postgres load shows it.
    let reading=false,again=false;
    async function changed() {
      if(reading) {again=true;return;}
      reading=true;
      try {
        do {again=false;const next=await read(),changes=frame(sent,next);if(changes) {sent=next;send(changes);}} while(again && !ended());
      } catch(error) {
        // The phone reconnects and is told why (a new day, a removed event).
        if(!(error instanceof Refusal)) app.log.error(error);
        end();
      } finally {reading=false;}
    }
    const heartbeat=setInterval(()=>write(': hb\n\n'),settings.heartbeatMs),limit=setTimeout(end,settings.limitMs);
    const stop=onDayChange(dayId,()=>void changed());
    const close=()=>{end();return new Promise(resolve=>raw.once('close',resolve));};
    open.add(close);
    raw.on('close',()=>{clearInterval(heartbeat);clearTimeout(limit);stop();open.delete(close);});
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
  // Only a phone that asks gets changes frames: a page still on an older build would take one for the whole list.
  action('GET','/api/live/races','Volunteer',(request,reply,phone)=>stream(reply,phone.dayId,async()=>{
    await signedIn(phone);
    return sharedRacesRead(phone.dayId);
  },(request.query as {changes?:string}).changes==='1'?changesFrame:whole));
  action('GET','/api/live/races/:raceId','Volunteer',(request,reply,phone)=>{
    const raceId=(request.params as {raceId:string}).raceId;
    // A sign-out wakes the streams, so a signed-out phone's stream ends and its reconnect is told why.
    return stream(reply,phone.dayId,()=>resultsSnapshot(pool,phone.dayId,async db=>{
      if(!(await db.query('SELECT 1 FROM sign_ins WHERE id=$1 AND NOT signed_out',[phone.id])).rowCount) throw signedOut();
      return raceFlowRead(db,phone,raceId);
    }));
  });
}
