import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { newLeadCode } from './codes.js';
import { actions, Refusal } from './permissions.js';
import { rulingChange, readAuditNotes, writeAuditNote } from '../rulings/records.js';
export function phoneManagementRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/day/phones','Scoring team',async(_request,_reply,phone)=>({
    selfId:phone.id,
    phones:(await pool.query('SELECT id,name,level FROM sign_ins WHERE day_id=$1 AND NOT signed_out ORDER BY signed_in_at,id',[phone.dayId])).rows,
    auditNotes:(await readAuditNotes(pool,phone.dayId)).filter(note=>note.eventId===null)
  }));
  action('POST','/api/day/lead-code','Scoring team',async(_request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const day=(await client.query('SELECT lead_code FROM olympics_days WHERE id=$1',[current.dayId])).rows[0];
    await client.query('UPDATE olympics_days SET lead_code=$1 WHERE id=$2',[newLeadCode(day.lead_code),current.dayId]);
    const demoted=(await client.query("UPDATE sign_ins SET level='Volunteer' WHERE day_id=$1 AND level='Lead' AND NOT signed_out RETURNING name",[current.dayId])).rows;
    for(const target of demoted) await writeAuditNote(client,current,null,{action:'Removed lead access',message:`Made ${target.name} a volunteer when the lead code changed`,comment:null,touches:[]});
    await writeAuditNote(client,current,null,{action:'Made new lead code',message:'Changed the lead code; ordinary leads are volunteers again',comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
  // Bumping the version ends every session, the caller's too, with password-changed; roles stay on today's rows.
  action('POST','/api/day/olympics-password','Scoring team',async(request,_reply,phone)=>{
    const password=(request.body as {password?:unknown}|null)?.password;
    if(typeof password!=='string' || password.length<6) throw new Refusal(400,'Use at least 6 characters for the Olympics password');
    return rulingChange(pool,phone,async(client,current)=>{
      const changed=await client.query('UPDATE olympics_settings SET password=$1,password_version=password_version+1 WHERE password<>$1',[password]);
      if(!changed.rowCount) throw new Refusal(409,'That is already the Olympics password. Type a new one.');
      await writeAuditNote(client,current,null,{action:'Changed Olympics password',message:'Changed the Olympics password; every phone types the new one',comment:null,touches:[]});
      return {status:'saved'};
    },'Scoring team');
  });
  action('POST','/api/day/phones/:phoneId/scoring-team','Scoring team',async(request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const {phoneId}=request.params as {phoneId:string};
    const scoringTeam=(request.body as {scoringTeam?:unknown}|null)?.scoringTeam;
    if(typeof scoringTeam!=='boolean') throw new Refusal(400,'Choose whether this phone is scoring team');
    const target=(await client.query('SELECT id,name,level FROM sign_ins WHERE id::text=$1 AND day_id=$2 AND NOT signed_out',[phoneId,current.dayId])).rows[0];
    if(!target) throw new Refusal(404,'Joined phone not found');
    if(target.level!==(scoringTeam?'Lead':'Scoring team')) throw new Refusal(409,scoringTeam?'Choose a joined lead':'This phone is not scoring team');
    await client.query('UPDATE sign_ins SET level=$1 WHERE id=$2',[scoringTeam?'Scoring team':'Lead',target.id]);
    await writeAuditNote(client,current,null,{action:scoringTeam?'Made scoring team':'Removed from scoring team',message:scoringTeam?`Made ${target.name} scoring team`:`Removed ${target.name} from the scoring team`,comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
  action('POST','/api/day/phones/:phoneId/remove','Scoring team',async(request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const {phoneId}=request.params as {phoneId:string};
    const target=(await client.query('UPDATE sign_ins SET signed_out=true WHERE id::text=$1 AND day_id=$2 AND NOT signed_out RETURNING name',[phoneId,current.dayId])).rows[0];
    if(!target) throw new Refusal(404,'Joined phone not found');
    await writeAuditNote(client,current,null,{action:'Removed phone',message:`Removed ${target.name}`,comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
}
