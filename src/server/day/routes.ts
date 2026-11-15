import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { actions, newDay, Refusal } from '../access/permissions.js';
import { resultsSnapshot } from '../results/read.js';
import { readEvents } from './events.js';
import { changeDay, eventName, eventDetails, eventFormat, thisDayChange } from './mutations.js';
import { formats,type FormatLock,type SetupEvent } from '../../shared/day.js';
import { medalsDecided,type EventPhase } from '../../shared/event-phase.js';
/** The day's events with what the format switch needs: the live final or decided medals that lock it, and the races run. */
async function setupEvents(client:pg.PoolClient,dayId:string):Promise<SetupEvent[]> {
  const details=new Map((await client.query(`SELECT e.id,e.phase,
      EXISTS(SELECT 1 FROM races r WHERE r.event_id=e.id AND r.kind='final' AND NOT r.deleted) AS final,
      COALESCE((SELECT array_agg(r.number ORDER BY r.number) FROM races r WHERE r.event_id=e.id AND r.kind<>'final' AND NOT r.deleted),'{}') AS races
    FROM events e WHERE e.day_id=$1`,[dayId])).rows.map(row=>[row.id,row]));
  return (await readEvents(client,false,dayId)).map(event=>{
    const row=details.get(event.id);
    return {...event,formatLock:formatLock(row.phase,row.final),races:row.races};
  });
}
const formatLock=(phase:EventPhase,final:boolean):FormatLock=>medalsDecided(phase)?'medals':final || phase==='final'?'final':null;
export function dayRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app,pool);
  action('GET','/api/events','Volunteer',async(_request,_reply,phone)=>({events:await readEvents(pool,true,phone.dayId)}));
  action('GET', '/api/day', 'Lead', (_request,_reply,phone) => resultsSnapshot(pool,phone.dayId,async client=>{
    const day = (await client.query('SELECT lead_code,revision,exported_at,exported_revision,year,region,day_number,(SELECT password FROM olympics_settings) AS olympics_password FROM olympics_days WHERE id=$1',[phone.dayId])).rows[0];
    if(!day) throw newDay();
    return {olympicsPassword: day.olympics_password, leadCode: day.lead_code, revision:Number(day.revision), exportedAt:day.exported_at?.toISOString()??null, exportedRevision:day.exported_revision===null?null:Number(day.exported_revision), year:day.year, region:day.region, dayNumber:day.day_number, events:await setupEvents(client,phone.dayId)};
  }));
  action('POST','/api/day/this-day','Lead',async(request,_reply,phone)=>{
    const {column,value}=thisDayChange(request.body);
    return changeDay(pool,phone,(client,dayId)=>client.query(`UPDATE olympics_days SET ${column}=$1 WHERE id=$2`,[value,dayId]));
  });
  action('POST','/api/day/events/:code/rename','Lead',async(request,_reply,phone)=>{
    const name = eventName((request.body as {name?:unknown}|null)?.name);
    const {code} = request.params as {code:string};
    return changeDay(pool,phone,async(client,dayId)=>{
      const result = await client.query('UPDATE events SET name=$1 WHERE day_id=$2 AND code=$3',[name,dayId,code]);
      if (!result.rowCount) throw new Refusal(404,'Event not found');
    });
  });
  action('POST','/api/day/events','Lead',async(request,_reply,phone)=>{
    const body = eventDetails(request.body);
    return changeDay(pool,phone,async(client,dayId)=>{
      const existing = await client.query('SELECT 1 FROM events WHERE day_id=$1 AND code=$2',[dayId,body.code]);
      if (existing.rowCount) throw new Refusal(409,`An event already uses ${body.code}`);
      await client.query(`INSERT INTO events(id,day_id,code,name,section,format,type,programme_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(programme_order),-1)+1 FROM events WHERE day_id=$2))`,[randomUUID(),dayId,body.code,body.name,body.section,body.format,body.type]);
    });
  });
  action('POST','/api/day/events/:code/format','Lead',async(request,_reply,phone)=>{
    const format=eventFormat((request.body as {format?:unknown}|null)?.format);
    const {code}=request.params as {code:string};
    return changeDay(pool,phone,async(client,dayId)=>{
      const event=(await client.query(`SELECT e.id,e.format,e.phase,EXISTS(SELECT 1 FROM races r WHERE r.event_id=e.id AND r.kind='final' AND NOT r.deleted) AS final
        FROM events e WHERE e.day_id=$1 AND e.code=$2 FOR UPDATE`,[dayId,code])).rows[0];
      if(!event) throw new Refusal(404,'Event not found');
      if(event.format===format) throw new Refusal(409,`${code} is already ${formats[format]}`);
      const lock=formatLock(event.phase,event.final);
      if(lock==='final') throw new Refusal(409,'The final is made - reopen the heats in Results to change it');
      if(lock==='medals') throw new Refusal(409,'Medals are decided - reopen them in Results to change it');
      // A heats event's runs are heats, a timed event's are races: the runs already made keep their numbers and times.
      await client.query("UPDATE races SET kind=$1 WHERE event_id=$2 AND kind=$3",format==='timed'?['race',event.id,'heat']:['heat',event.id,'race']);
      await client.query('UPDATE events SET format=$1 WHERE id=$2',[format,event.id]);
    });
  });
  action('POST','/api/day/events/:code/enabled','Lead',async(request,_reply,phone)=>{
    const enabled = (request.body as {enabled?:unknown}|null)?.enabled;
    if (typeof enabled !== 'boolean') throw new Refusal(400,'Choose whether this event is on or off');
    const {code} = request.params as {code:string};
    return changeDay(pool,phone,async(client,dayId)=>{
      const result = await client.query('UPDATE events SET enabled=$1 WHERE day_id=$2 AND code=$3',[enabled,dayId,code]);
      if (!result.rowCount) throw new Refusal(404,'Event not found');
    });
  });
}
