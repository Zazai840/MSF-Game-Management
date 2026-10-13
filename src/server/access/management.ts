import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { newDayCode,newLeadCode } from './codes.js';
import { actions, Refusal } from './permissions.js';
import { rulingChange, readAuditNotes, writeAuditNote } from '../rulings/records.js';
export function phoneManagementRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/day/phones','Scoring team',async(_request,_reply,phone)=>({
    selfId:phone.id,
    phones:(await pool.query('SELECT id,name,level FROM phones WHERE day_id=$1 AND NOT removed ORDER BY joined_at,id',[phone.dayId])).rows,
    auditNotes:(await readAuditNotes(pool,phone.dayId)).filter(note=>note.eventId===null)
  }));
  for(const kind of ['day','lead'] as const) action('POST',`/api/day/${kind}-code`,'Scoring team',async(_request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const day=(await client.query('SELECT day_code,lead_code FROM olympics_days WHERE id=$1',[current.dayId])).rows[0];
    const code=kind==='day'?newDayCode(day.day_code):newLeadCode(day.lead_code);
    await client.query(`UPDATE olympics_days SET ${kind}_code=$1 WHERE id=$2`,[code,current.dayId]);
    if(kind==='lead') {
      const demoted=(await client.query("UPDATE phones SET level='Volunteer' WHERE day_id=$1 AND level='Lead' AND NOT removed RETURNING name",[current.dayId])).rows;
      for(const target of demoted) await writeAuditNote(client,current,null,{action:'Removed lead access',message:`Made ${target.name} a volunteer when the lead code changed`,comment:null,touches:[]});
    }
    await writeAuditNote(client,current,null,{action:kind==='day'?'Made new day code':'Made new lead code',message:kind==='day'?'Changed the day code; joined phones stay in':'Changed the lead code; ordinary leads are volunteers again',comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
  action('POST','/api/day/phones/:phoneId/scoring-team','Scoring team',async(request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const {phoneId}=request.params as {phoneId:string};
    const scoringTeam=(request.body as {scoringTeam?:unknown}|null)?.scoringTeam;
    if(typeof scoringTeam!=='boolean') throw new Refusal(400,'Choose whether this phone is scoring team');
    const target=(await client.query('SELECT id,name,level FROM phones WHERE id::text=$1 AND day_id=$2 AND NOT removed',[phoneId,current.dayId])).rows[0];
    if(!target) throw new Refusal(404,'Joined phone not found');
    if(target.level!==(scoringTeam?'Lead':'Scoring team')) throw new Refusal(409,scoringTeam?'Choose a joined lead':'This phone is not scoring team');
    await client.query('UPDATE phones SET level=$1 WHERE id=$2',[scoringTeam?'Scoring team':'Lead',target.id]);
    await writeAuditNote(client,current,null,{action:scoringTeam?'Made scoring team':'Removed from scoring team',message:scoringTeam?`Made ${target.name} scoring team`:`Removed ${target.name} from the scoring team`,comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
  action('POST','/api/day/phones/:phoneId/remove','Scoring team',async(request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const {phoneId}=request.params as {phoneId:string};
    const target=(await client.query('UPDATE phones SET removed=true WHERE id::text=$1 AND day_id=$2 AND NOT removed RETURNING name',[phoneId,current.dayId])).rows[0];
    if(!target) throw new Refusal(404,'Joined phone not found');
    await writeAuditNote(client,current,null,{action:'Removed phone',message:`Removed ${target.name}`,comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
}
