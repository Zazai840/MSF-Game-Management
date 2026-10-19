import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,payload?:unknown)=>app.inject({method:payload===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'phones-owner-fixture',resetTestDay:true});
  const {owner,day,pass,volunteer:join}=await signInOwner(app,'phones-owner-fixture');
  return {owner,day,pass,join};
}
test('Remove signs a profile out for today as a volunteer, with reason signed-out and a day-level audit note',async()=>{
  const {owner,pass,day,join}=await start();const lead=await join('Ahmed');
  await call(lead.token,'/api/become-lead',{code:day.leadCode});
  const before=(await call(owner.token,'/api/day')).json().revision;
  const self=await call(owner.token,`/api/day/phones/${owner.phone.id}/remove`,{});
  expect(self.statusCode).toBe(409);expect(self.json().message).toBe("Use Sign out to remove yourself");
  expect((await call(owner.token,`/api/day/phones/${lead.phone.id}/remove`,{})).statusCode).toBe(200);
  const next=await call(lead.token,'/api/home');
  expect(next.statusCode).toBe(401);expect(next.json().reason).toBe('signed-out');
  const list=(await call(owner.token,'/api/day/phones')).json();
  expect(list.phones.map((phone:any)=>phone.name)).toEqual(['Aisha']);
  expect(list.auditNotes[0]).toMatchObject({eventId:null,actor:'Aisha',action:'Removed',message:'Removed Ahmed',touches:[]});
  expect((await call(owner.token,'/api/day')).json().revision).toBeGreaterThan(before);
  const again=await app.inject({method:'POST',url:'/api/sign-in',payload:{pass,profileId:lead.profile.id,secret:lead.profile.secret}});
  expect((await call(again.json().token,'/api/me')).json()).toMatchObject({name:'Ahmed',level:'Volunteer'});
});
test('Signed in today lists rows oldest first with role, owner marker and your own row',async()=>{
  const {owner,join}=await start();const volunteer=await join('Ahmed');
  const list=(await call(owner.token,'/api/day/phones')).json();
  expect(list.selfId).toBe(owner.phone.id);
  expect(list.phones).toEqual([{id:owner.phone.id,name:'Aisha',level:'Scoring team',owner:true},{id:volunteer.phone.id,name:'Ahmed',level:'Volunteer',owner:false}]);
});
test('Set role moves a row between all three roles for today, each with a day-level audit note naming who did it',async()=>{
  const {owner,join}=await start();const target=await join('Maryam');
  const before=(await call(owner.token,'/api/day')).json().revision;
  for(const role of ['Lead','Scoring team','Volunteer','Scoring team','Lead','Volunteer']) {
    expect((await call(owner.token,`/api/day/phones/${target.phone.id}/role`,{role})).statusCode).toBe(200);
    expect((await call(target.token,'/api/me')).json().level).toBe(role);
  }
  const notes=(await call(owner.token,'/api/day/phones')).json().auditNotes;
  expect(notes.slice(0,3).map((note:any)=>[note.action,note.actor,note.eventId,note.message])).toEqual([
    ['Made volunteer','Aisha',null,'Made Maryam a volunteer'],['Made lead','Aisha',null,'Made Maryam a lead'],['Made scoring team','Aisha',null,'Made Maryam scoring team']]);
  expect((await call(owner.token,'/api/day')).json().revision).toBeGreaterThan(before);
});
test('Set role is refused for your own row, for demoting the owner, for the role a row has and for an unknown role',async()=>{
  const {owner,join}=await start();const scoring=await join('Yusuf');const volunteer=await join('Ahmed');
  await call(owner.token,`/api/day/phones/${scoring.phone.id}/role`,{role:'Scoring team'});
  const refused=async(token:string,id:string,role:unknown,status:number,message:string)=>{
    const response=await call(token,`/api/day/phones/${id}/role`,{role});
    expect(response.statusCode).toBe(status);expect(response.json().message).toBe(message);
  };
  await refused(scoring.token,scoring.phone.id,'Lead',409,"You can't change your own role");
  await refused(scoring.token,owner.phone.id,'Lead',409,"Nobody can lower the owner's role");
  await refused(scoring.token,owner.phone.id,'Volunteer',409,"Nobody can lower the owner's role");
  await refused(owner.token,volunteer.phone.id,'Volunteer',409,'Ahmed is already Volunteer');
  await refused(owner.token,volunteer.phone.id,'Owner',400,'Choose Volunteer, Lead or Scoring team');
  await refused(owner.token,'00000000-0000-0000-0000-000000000000','Lead',404,'Nobody is signed in with that row today');
  expect((await call(owner.token,'/api/me')).json().level).toBe('Scoring team');
});
test('a new lead code refuses old lead upgrades, keeps signed-in jobs, and demotes only ordinary leads',async()=>{
  const {owner,day,join}=await start();const lead=await join('Maryam');const scoring=await join('Yusuf');const volunteer=await join('Ahmed');
  await call(lead.token,'/api/become-lead',{code:day.leadCode});
  await call(scoring.token,'/api/become-lead',{code:'phones-owner-fixture'});
  const before=(await call(owner.token,'/api/day')).json().revision;
  expect((await call(owner.token,'/api/day/lead-code',{})).statusCode).toBe(200);
  const rotated=(await call(owner.token,'/api/day')).json();
  expect(rotated.leadCode).toMatch(/^[A-Z2-9]{6}$/);expect(rotated.leadCode).not.toBe(day.leadCode);
  expect(rotated.revision).toBeGreaterThan(before);
  expect((await call(lead.token,'/api/me')).json().level).toBe('Volunteer');
  expect((await call(scoring.token,'/api/me')).json().level).toBe('Scoring team');
  expect((await call(owner.token,'/api/me')).json().level).toBe('Scoring team');
  expect((await call(volunteer.token,'/api/become-lead',{code:day.leadCode})).statusCode).toBe(403);
  for(const phone of [lead,volunteer,scoring]) for(const path of ['/api/jobs/start-line','/api/jobs/finish-order','/api/jobs/times']) expect((await call(phone.token,path)).statusCode).toBe(200);
  expect((await call(lead.token,'/api/lead/results')).statusCode).toBe(403);
  expect((await call(lead.token,'/api/become-lead',{code:rotated.leadCode})).json().level).toBe('Lead');
});
test('joining and becoming lead each invalidate the current export revision',async()=>{
  const {owner,day,join}=await start();const before=(await call(owner.token,'/api/day')).json().revision;
  const volunteer=await join('Ahmed');const joined=(await call(owner.token,'/api/day')).json().revision;
  expect(joined).toBeGreaterThan(before);
  await call(volunteer.token,'/api/become-lead',{code:day.leadCode});
  expect((await call(owner.token,'/api/day')).json().revision).toBeGreaterThan(joined);
});
test('volunteers and ordinary leads cannot read joined phones or use any scoring-team access action',async()=>{
  const {owner,day,join}=await start();const target=await join('Target');
  for(const name of ['Volunteer Ahmed','Lead Maryam']) {
    const phone=await join(name);if(name.startsWith('Lead')) await call(phone.token,'/api/become-lead',{code:day.leadCode});
    expect((await call(phone.token,'/api/day/phones')).statusCode).toBe(403);
    for(const [url,payload] of [
      ['/api/day/lead-code',{}],
      [`/api/day/phones/${target.phone.id}/remove`,{}],
      [`/api/day/phones/${target.phone.id}/role`,{role:'Lead'}],
      [`/api/day/phones/${owner.phone.id}/role`,{role:'Volunteer'}]
    ] as const) {
      const response=await call(phone.token,url,payload);expect(response.statusCode).toBe(403);expect(response.json().message).toBe('Scoring team access needed');
    }
  }
  expect((await call(target.token,'/api/me')).statusCode).toBe(200);
  expect((await call(owner.token,'/api/me')).json().level).toBe('Scoring team');
});
test('a concurrent old lead-code upgrade cannot survive a new lead code',async()=>{
  const {owner,join}=await start();const phone=await join('Ahmed');
  for(let round=0;round<5;round++) {
    const day=(await call(owner.token,'/api/day')).json();
    const [upgraded,rotated]=await Promise.all([call(phone.token,'/api/become-lead',{code:day.leadCode}),call(owner.token,'/api/day/lead-code',{})]);
    expect([200,403]).toContain(upgraded.statusCode);expect(rotated.statusCode).toBe(200);
    expect((await call(phone.token,'/api/me')).json().level).toBe('Volunteer');
  }
});
