import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { newLeadCode } from './codes.js';
import { actions, Refusal } from './permissions.js';
import { levels, type Level, type Phone } from '../../shared/domain.js';
import { rulingChange, readAuditNotes, writeAuditNote } from '../rulings/records.js';
import { clearHolds } from '../races/race-screen.js';
export function phoneManagementRoutes(app:FastifyInstance,pool:pg.Pool) {
  const action=actions(app,pool);
  action('GET','/api/day/phones','Scoring team',async(_request,_reply,phone)=>({
    selfId:phone.id,
    phones:(await pool.query('SELECT id,name,level,owner FROM sign_ins WHERE day_id=$1 AND NOT signed_out ORDER BY signed_in_at,id',[phone.dayId])).rows,
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
    if(password!==password.trim()) throw new Refusal(400,'Do not put spaces at the start or end of the Olympics password');
    return rulingChange(pool,phone,async(client,current)=>{
      const changed=await client.query('UPDATE olympics_settings SET password=$1,password_version=password_version+1 WHERE password<>$1',[password]);
      if(!changed.rowCount) throw new Refusal(409,'That is already the Olympics password. Type a new one.');
      await writeAuditNote(client,current,null,{action:'Changed Olympics password',message:'Changed the Olympics password; every phone types the new one',comment:null,touches:[]});
      return {status:'saved'};
    },'Scoring team');
  });
  const signedInRow=async(client:pg.PoolClient,current:Phone,rowId:string,self:string)=>{
    if(rowId===current.id) throw new Refusal(409,self);
    const target=(await client.query('SELECT id,name,level,owner FROM sign_ins WHERE id::text=$1 AND day_id=$2 AND NOT signed_out FOR UPDATE',[rowId,current.dayId])).rows[0];
    if(!target) throw new Refusal(404,'Nobody is signed in with that row today');
    return target as {id:string;name:string;level:Level;owner:boolean};
  };
  const madeAs:Record<Level,string>={Volunteer:'a volunteer',Lead:'a lead','Scoring team':'scoring team'};
  action('POST','/api/day/phones/:phoneId/role','Scoring team',async(request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const role=(request.body as {role?:unknown}|null)?.role;
    if(!levels.includes(role as Level)) throw new Refusal(400,'Choose Volunteer, Lead or Scoring team');
    const target=await signedInRow(client,current,(request.params as {phoneId:string}).phoneId,"You can't change your own role");
    if(target.owner && role!=='Scoring team') throw new Refusal(409,"Nobody can lower the owner's role");
    if(target.level===role) throw new Refusal(409,`${target.name} is already ${role}`);
    await client.query('UPDATE sign_ins SET level=$1 WHERE id=$2',[role,target.id]);
    await writeAuditNote(client,current,null,{action:`Made ${(role as Level).toLowerCase()}`,message:`Made ${target.name} ${madeAs[role as Level]}`,comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
  action('POST','/api/day/phones/:phoneId/remove','Scoring team',async(request,_reply,phone)=>rulingChange(pool,phone,async(client,current)=>{
    const target=await signedInRow(client,current,(request.params as {phoneId:string}).phoneId,'Use Sign out to remove yourself');
    // The phone's next request fails with reason signed-out; signing back in starts again as a volunteer, except the owner, who keeps Scoring team.
    await client.query("UPDATE sign_ins SET signed_out=true, level=CASE WHEN owner THEN level ELSE 'Volunteer' END WHERE id=$1",[target.id]);
    await clearHolds(client,target.id);
    await writeAuditNote(client,current,null,{action:'Removed',message:`Removed ${target.name}`,comment:null,touches:[]});
    return {status:'saved'};
  },'Scoring team'));
}
