import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { dayWorkbook } from './workbook.js';
import type { Phone } from '../../shared/domain.js';
import { actions,Refusal,requireLevel } from '../access/permissions.js';
import { raceChange } from '../races/records.js';
export function exportRoutes(app:FastifyInstance,pool:pg.Pool) {
 actions(app,pool)('POST','/api/day/export','Lead',async(_request,reply,phone)=>{
  const exported=await raceChange(pool,phone,async(client,unchanged)=>{
   unchanged();
   const current=(await client.query('SELECT id,day_id AS "dayId",name,level,profile_id AS "profileId" FROM sign_ins WHERE id=$1',[phone.id])).rows[0] as Phone;
   requireLevel(current,'Lead');
   const day=(await client.query('SELECT revision,year,region,day_number FROM olympics_days WHERE id=$1',[current.dayId])).rows[0];
   if(!day.region || !day.day_number) throw new Refusal(409,'Set the Region and Day under This day first');
   const metadata=(await client.query('UPDATE olympics_days SET exported_at=clock_timestamp(),exported_revision=$2 WHERE id=$1 RETURNING exported_at',[current.dayId,day.revision])).rows[0];
   const at:string=metadata.exported_at.toISOString();
   const buffer=await dayWorkbook(client,current.dayId,[day.year,day.region,`Day ${day.day_number}`,at,current.name]);
   return {buffer,revision:String(day.revision),at,file:`msf-running-${day.region.toLowerCase()}-day-${day.day_number}-${at.slice(0,10)}.xlsx`};
  });
  return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition',`attachment; filename="${exported.file}"`).header('Cache-Control','no-store').header('X-Day-Revision',exported.revision).header('X-Exported-At',exported.at).send(exported.buffer);
 });
}
