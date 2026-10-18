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
test('removing a joined phone invalidates its token and keeps a day-level audit note',async()=>{
  const {owner,pass,join}=await start();const volunteer=await join('Ahmed');
  const before=(await call(owner.token,'/api/day')).json().revision;
  const removed=await call(owner.token,`/api/day/phones/${volunteer.phone.id}/remove`,{});
  expect(removed.statusCode).toBe(200);
  expect((await call(volunteer.token,'/api/home')).statusCode).toBe(401);
  const list=(await call(owner.token,'/api/day/phones')).json();
  expect(list.phones.map((phone:any)=>phone.name)).toEqual(['Aisha']);
  expect(list.auditNotes[0]).toMatchObject({eventId:null,actor:'Aisha',action:'Removed phone',message:'Removed Ahmed',touches:[]});
  expect((await call(owner.token,'/api/day')).json().revision).toBeGreaterThan(before);
  const again=await app.inject({method:'POST',url:'/api/sign-in',payload:{pass,profileId:volunteer.profile.id,secret:volunteer.profile.secret}});
  expect((await call(again.json().token,'/api/me')).json()).toMatchObject({name:'Ahmed',level:'Volunteer'});
});
test('scoring team promotes a joined lead and demotes scoring team back to Lead, with audit notes',async()=>{
  const {owner,day,join}=await start();const lead=await join('Maryam');
  await call(lead.token,'/api/become-lead',{code:day.leadCode});
  const before=(await call(owner.token,'/api/day')).json().revision;
  expect((await call(owner.token,`/api/day/phones/${lead.phone.id}/scoring-team`,{scoringTeam:true})).statusCode).toBe(200);
  expect((await call(lead.token,'/api/me')).json().level).toBe('Scoring team');
  expect((await call(owner.token,`/api/day/phones/${lead.phone.id}/scoring-team`,{scoringTeam:false})).statusCode).toBe(200);
  expect((await call(lead.token,'/api/me')).json().level).toBe('Lead');
  const notes=(await call(owner.token,'/api/day/phones')).json().auditNotes;
  expect(notes.slice(0,2).map((note:any)=>[note.action,note.actor,note.eventId])).toEqual([['Removed from scoring team','Aisha',null],['Made scoring team','Aisha',null]]);
  expect(notes.slice(0,2).map((note:any)=>note.message)).toEqual(['Removed Maryam from the scoring team','Made Maryam scoring team']);
  expect((await call(owner.token,'/api/day')).json().revision).toBeGreaterThan(before);
  const volunteer=await join('Ahmed');
  expect((await call(owner.token,`/api/day/phones/${volunteer.phone.id}/scoring-team`,{scoringTeam:true})).statusCode).toBe(409);
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
      [`/api/day/phones/${target.phone.id}/scoring-team`,{scoringTeam:true}],
      [`/api/day/phones/${owner.phone.id}/scoring-team`,{scoringTeam:false}]
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
