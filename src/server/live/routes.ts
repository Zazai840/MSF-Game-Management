import type { FastifyInstance,FastifyReply } from 'fastify';
import type pg from 'pg';
import type { RaceScreenRead } from '../../shared/race-screen.js';
import { actions,Refusal } from '../access/permissions.js';
import { currentRaces } from '../races/current.js';
import type { Database } from '../races/records.js';
import { resultsSnapshot } from '../results/read.js';
import { onDayChange } from './changes.js';
export interface StreamSettings { heartbeatMs:number; limitMs:number; buildId?:string }
async function raceScreenRead(db:Database,dayId:string,code:string):Promise<RaceScreenRead> {
  const event=(await db.query('SELECT id,code,name,section,format,enabled FROM events WHERE day_id=$1 AND code=$2',[dayId,code])).rows[0];
  if(!event) throw new Refusal(404,'Event not found');
  const revision=Number((await db.query('SELECT revision FROM olympics_days WHERE id=$1',[dayId])).rows[0].revision);
  return {revision,event,race:(await currentRaces(db,dayId,[event])).get(event.id)!};
}
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
    let sent=await read();
    reply.hijack();
    const raw=reply.raw,ended=()=>raw.writableEnded || raw.destroyed;
    const write=(text:string)=>{if(!ended()) raw.write(text);};
    const end=()=>{if(!ended()) raw.end();};
    raw.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','x-accel-buffering':'no'});
    // Every snapshot carries the build id, so a phone on another build reloads.
    const send=(snapshot:T)=>write(`data: ${JSON.stringify({...snapshot,build:settings.buildId})}\n\n`);
    send(sent);
    // shortcut: every stream reads its own snapshot per change; share one read per day revision if Postgres load shows it.
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
  }
  action('GET','/api/live/race-screen/:code','Volunteer',(request,reply,phone)=>{
    const code=(request.params as {code:string}).code;
    return stream(reply,phone.dayId,()=>resultsSnapshot(pool,phone.dayId,db=>raceScreenRead(db,phone.dayId,code)));
  });
}
