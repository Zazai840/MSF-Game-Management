import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { sections, type DayEvent } from '../../shared/day.js';
export async function seedEvents(client:pg.PoolClient, dayId:string) {
  const programme = [
    ...sections.map((section,index)=>({code:`R${index+1}`,name:'60m',section,format:'heats'})),
    ...sections.map((section,index)=>({code:`R${index+7}`,name:'60m Hurdles',section,format:'timed'})),
    ...sections.map((section,index)=>({code:`R${index+13}`,name:'200m',section,format:'timed'})),
    {code:'R23',name:'400m',section:'Boy Scouts',format:'timed'},
    {code:'R24',name:'400m',section:'Girl Scouts',format:'timed'},
    ...sections.slice(0,4).map((section,index)=>({code:`R${index+19}`,name:'4x50m Relay',section,format:'heats',relay:true})),
    {code:'R27',name:'4x100m Relay',section:'Boy Scouts',format:'heats',relay:true},
    {code:'R28',name:'4x100m Relay',section:'Girl Scouts',format:'heats',relay:true}
  ];
  for (const [order,event] of programme.entries()) {
    await client.query('INSERT INTO events(id,day_id,code,name,section,format,programme_order,relay) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),dayId,event.code,event.name,event.section,event.format,order,event.relay===true]);
  }
}
export async function readEvents(db:pg.Pool | pg.PoolClient, enabledOnly=false,dayId?:string):Promise<DayEvent[]> {
  return (await db.query(`SELECT e.id,e.code,e.name,e.section,e.format,e.enabled,e.relay FROM events e JOIN olympics_days d ON d.id=e.day_id WHERE ${dayId?'e.day_id=$1':'d.active'} ${enabledOnly?'AND e.enabled':''} ORDER BY programme_order,e.code`,dayId?[dayId]:[])).rows;
}
