import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { sections, type DayEvent } from '../../shared/day.js';
export async function seedEvents(client:pg.PoolClient, dayId:string) {
  const programme = [
    ...sections.map((section,index)=>({code:`R${index+1}`,name:'60m',section,format:'heats',type:'races'})),
    ...sections.map((section,index)=>({code:`R${index+7}`,name:'60m Hurdles',section,format:'timed',type:'hurdles'})),
    ...sections.map((section,index)=>({code:`R${index+13}`,name:'200m',section,format:'timed',type:'races'})),
    {code:'R23',name:'400m',section:'Boy Scouts',format:'timed',type:'races'},
    {code:'R24',name:'400m',section:'Girl Scouts',format:'timed',type:'races'},
    ...sections.slice(0,4).map((section,index)=>({code:`R${index+19}`,name:'4x50m Relay',section,format:'heats',type:'relays'})),
    {code:'R27',name:'4x100m Relay',section:'Boy Scouts',format:'heats',type:'relays'},
    {code:'R28',name:'4x100m Relay',section:'Girl Scouts',format:'heats',type:'relays'}
  ];
  for (const [order,event] of programme.entries()) {
    // The relay column is kept in step for an older build still answering during a deploy (storage.ts).
    await client.query("INSERT INTO events(id,day_id,code,name,section,format,programme_order,type,relay) VALUES($1,$2,$3,$4,$5,$6,$7,$8::text,$8::text='relays')",[randomUUID(),dayId,event.code,event.name,event.section,event.format,order,event.type]);
  }
}
export async function readEvents(db:pg.Pool | pg.PoolClient, enabledOnly=false,dayId?:string):Promise<DayEvent[]> {
  return (await db.query(`SELECT e.id,e.code,e.name,e.section,e.format,e.enabled,e.type,(e.type='relays') AS relay FROM events e JOIN olympics_days d ON d.id=e.day_id WHERE ${dayId?'e.day_id=$1':'d.active'} ${enabledOnly?'AND e.enabled':''} ORDER BY programme_order,e.code`,dayId?[dayId]:[])).rows;
}
