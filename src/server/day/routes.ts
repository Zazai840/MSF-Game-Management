import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { actions, Refusal } from '../access/permissions.js';
import { readEvents } from './events.js';
import { changeDay, eventName, eventDetails } from './mutations.js';
export function dayRoutes(app: FastifyInstance, pool: pg.Pool) {
  const action = actions(app,pool);
  action('GET','/api/events','Volunteer',async(_request,_reply,phone)=>({events:await readEvents(pool,true,phone.dayId)}));
  action('GET', '/api/day', 'Scoring team', async (_request,_reply,phone) => {
    const day = (await pool.query('SELECT day_code,lead_code,events_confirmed,revision FROM olympics_days WHERE id=$1',[phone.dayId])).rows[0];
    if(!day) throw new Refusal(401,'Please join the Olympics day');
    return {dayCode: day.day_code, leadCode: day.lead_code, eventsConfirmed:day.events_confirmed, revision:Number(day.revision), events:await readEvents(pool,false,phone.dayId)};
  });
  action('POST','/api/day/confirm-events','Scoring team',async(_request,_reply,phone)=>{
    return changeDay(pool,phone,async()=>{},true);
  });
  action('POST','/api/day/events/:code/rename','Scoring team',async(request,_reply,phone)=>{
    const name = eventName((request.body as {name?:unknown}|null)?.name);
    const {code} = request.params as {code:string};
    return changeDay(pool,phone,async(client,dayId)=>{
      const result = await client.query('UPDATE events SET name=$1 WHERE day_id=$2 AND code=$3',[name,dayId,code]);
      if (!result.rowCount) throw new Refusal(404,'Event not found');
    });
  });
  action('POST','/api/day/events','Scoring team',async(request,_reply,phone)=>{
    const body = eventDetails(request.body);
    return changeDay(pool,phone,async(client,dayId)=>{
      const existing = await client.query('SELECT 1 FROM events WHERE day_id=$1 AND code=$2',[dayId,body.code]);
      if (existing.rowCount) throw new Refusal(409,`An event already uses ${body.code}`);
      await client.query(`INSERT INTO events(id,day_id,code,name,section,format,programme_order)
        VALUES($1,$2,$3,$4,$5,$6,(SELECT COALESCE(MAX(programme_order),-1)+1 FROM events WHERE day_id=$2))`,[randomUUID(),dayId,body.code,body.name,body.section,body.format]);
    });
  });
  action('POST','/api/day/events/:code/enabled','Scoring team',async(request,_reply,phone)=>{
    const enabled = (request.body as {enabled?:unknown}|null)?.enabled;
    if (typeof enabled !== 'boolean') throw new Refusal(400,'Choose whether this event is on or off');
    const {code} = request.params as {code:string};
    return changeDay(pool,phone,async(client,dayId)=>{
      const result = await client.query('UPDATE events SET enabled=$1 WHERE day_id=$2 AND code=$3',[enabled,dayId,code]);
      if (!result.rowCount) throw new Refusal(404,'Event not found');
    });
  });
}
