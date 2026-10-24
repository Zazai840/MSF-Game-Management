import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,payload?:unknown)=>app.inject({method:payload===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`,...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'phones-owner-fixture',resetTestDay:true});
  const {owner,day,pass,volunteer:signInAs}=await signInOwner(app,'phones-owner-fixture');
  return {owner,day,pass,signInAs};
}
test('Remove signs a profile out for today as a volunteer, with reason signed-out and a day-level audit note',async()=>{
  const {owner,pass,day,signInAs}=await start();const lead=await signInAs('Ahmed');
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
test('Remove on the owner row signs the owner out but keeps Lead and the owner marker',async()=>{
  const {owner,pass,signInAs}=await start();const lead=await signInAs('Yusuf');
  await call(owner.token,`/api/day/phones/${lead.phone.id}/role`,{role:'Lead'});
  expect((await call(lead.token,`/api/day/phones/${owner.phone.id}/remove`,{})).statusCode).toBe(200);
  expect((await call(owner.token,'/api/home')).json().reason).toBe('signed-out');
  const again=await app.inject({method:'POST',url:'/api/sign-in',payload:{pass,profileId:owner.profile.id,secret:owner.profile.secret}});
  expect((await call(again.json().token,'/api/me')).json()).toMatchObject({name:'Aisha',level:'Lead'});
  const list=(await call(lead.token,'/api/day/phones')).json();
  expect(list.phones.find((phone:any)=>phone.name==='Aisha')).toMatchObject({level:'Lead',owner:true});
});
test('Signed in today lists rows oldest first with role, owner marker and your own row',async()=>{
  const {owner,signInAs}=await start();const volunteer=await signInAs('Ahmed');
  const list=(await call(owner.token,'/api/day/phones')).json();
  expect(list.selfId).toBe(owner.phone.id);
  expect(list.phones).toEqual([{id:owner.phone.id,name:'Aisha',level:'Lead',owner:true},{id:volunteer.phone.id,name:'Ahmed',level:'Volunteer',owner:false}]);
});
test('Set role moves a row between volunteer and lead for today, each with a day-level audit note naming who did it',async()=>{
  const {owner,signInAs}=await start();const target=await signInAs('Maryam');
  const before=(await call(owner.token,'/api/day')).json().revision;
  for(const role of ['Lead','Volunteer','Lead','Volunteer']) {
    expect((await call(owner.token,`/api/day/phones/${target.phone.id}/role`,{role})).statusCode).toBe(200);
    expect((await call(target.token,'/api/me')).json().level).toBe(role);
  }
  const notes=(await call(owner.token,'/api/day/phones')).json().auditNotes;
  expect(notes.slice(0,2).map((note:any)=>[note.action,note.actor,note.eventId,note.message])).toEqual([
    ['Made volunteer','Aisha',null,'Made Maryam a volunteer'],['Made lead','Aisha',null,'Made Maryam a lead']]);
  expect((await call(owner.token,'/api/day')).json().revision).toBeGreaterThan(before);
});
test('Set role is refused for your own row, for demoting the owner, for the role a row has and for any role but Volunteer or Lead',async()=>{
  const {owner,signInAs}=await start();const lead=await signInAs('Yusuf');const volunteer=await signInAs('Ahmed');
  await call(owner.token,`/api/day/phones/${lead.phone.id}/role`,{role:'Lead'});
  const refused=async(token:string,id:string,role:unknown,status:number,message:string)=>{
    const response=await call(token,`/api/day/phones/${id}/role`,{role});
    expect(response.statusCode).toBe(status);expect(response.json().message).toBe(message);
  };
  await refused(lead.token,lead.phone.id,'Volunteer',409,"You can't change your own role");
  await refused(lead.token,owner.phone.id,'Volunteer',409,"The owner can't be made a volunteer");
  await refused(lead.token,owner.phone.id,'Lead',409,'Aisha is already Lead');
  await refused(owner.token,volunteer.phone.id,'Volunteer',409,'Ahmed is already Volunteer');
  await refused(owner.token,volunteer.phone.id,'Scoring team',400,'Choose Volunteer or Lead');
  await refused(owner.token,volunteer.phone.id,'Owner',400,'Choose Volunteer or Lead');
  await refused(owner.token,'00000000-0000-0000-0000-000000000000','Lead',404,'Nobody is signed in with that row today');
  expect((await call(owner.token,'/api/me')).json().level).toBe('Lead');
});
test('a new lead code refuses old lead upgrades, keeps signed-in race screens, and demotes only ordinary leads',async()=>{
  const {owner,day,signInAs}=await start();const lead=await signInAs('Maryam');const volunteer=await signInAs('Ahmed');
  await call(lead.token,'/api/become-lead',{code:day.leadCode});
  const before=(await call(owner.token,'/api/day')).json().revision;
  expect((await call(owner.token,'/api/day/lead-code',{})).statusCode).toBe(200);
  const rotated=(await call(owner.token,'/api/day')).json();
  expect(rotated.leadCode).toMatch(/^[A-Z2-9]{6}$/);expect(rotated.leadCode).not.toBe(day.leadCode);
  expect(rotated.revision).toBeGreaterThan(before);
  expect((await call(lead.token,'/api/me')).json().level).toBe('Volunteer');
  expect((await call(owner.token,'/api/me')).json().level).toBe('Lead');
  expect((await call(volunteer.token,'/api/become-lead',{code:day.leadCode})).statusCode).toBe(403);
  for(const phone of [lead,volunteer]) expect((await call(phone.token,'/api/race-screen/R4')).statusCode).toBe(200);
  expect((await call(lead.token,'/api/lead/results')).statusCode).toBe(403);
  expect((await call(lead.token,'/api/become-lead',{code:rotated.leadCode})).json().level).toBe('Lead');
});
test('a lead making a new lead code stays a lead, the owner stays, and every other lead becomes a volunteer with an audit note',async()=>{
  const {owner,day,signInAs}=await start();const maker=await signInAs('Maryam');const other=await signInAs('Yusuf');const ownerToo=await signInAs('Bilal');const volunteer=await signInAs('Ahmed');
  for(const phone of [maker,other]) await call(phone.token,'/api/become-lead',{code:day.leadCode});
  await call(ownerToo.token,'/api/become-lead',{code:'phones-owner-fixture'});
  expect((await call(maker.token,'/api/day/lead-code',{})).statusCode).toBe(200);
  const level=async(phone:{token:string})=>(await call(phone.token,'/api/me')).json().level;
  expect([await level(maker),await level(owner),await level(other),await level(ownerToo),await level(volunteer)]).toEqual(['Lead','Lead','Volunteer','Lead','Volunteer']);
  const notes=(await call(maker.token,'/api/day/phones')).json().auditNotes;
  expect(notes[0]).toMatchObject({actor:'Maryam',action:'Made new lead code',message:'Changed the lead code; other leads are volunteers again'});
  expect(notes.filter((note:any)=>note.action==='Removed lead access').map((note:any)=>note.message).sort()).toEqual(['Made Yusuf a volunteer when the lead code changed']);
});
test('joining and becoming lead each invalidate the current export revision',async()=>{
  const {owner,day,signInAs}=await start();const before=(await call(owner.token,'/api/day')).json().revision;
  const volunteer=await signInAs('Ahmed');const afterSignIn=(await call(owner.token,'/api/day')).json().revision;
  expect(afterSignIn).toBeGreaterThan(before);
  await call(volunteer.token,'/api/become-lead',{code:day.leadCode});
  expect((await call(owner.token,'/api/day')).json().revision).toBeGreaterThan(afterSignIn);
});
test('a lead who is not the owner can use every Signed in today and lead code action and a volunteer is refused each one',async()=>{
  const {owner,signInAs}=await start();const target=await signInAs('Target');const volunteer=await signInAs('Volunteer Ahmed');
  const lead=await signInAs('Lead Maryam');await call(lead.token,'/api/become-lead',{code:(await call(owner.token,'/api/day')).json().leadCode});
  const actions=[
    [`/api/day/phones/${target.phone.id}/role`,{role:'Lead'}],
    [`/api/day/phones/${target.phone.id}/remove`,{}],
    ['/api/day/lead-code',{}]
  ] as const;
  expect((await call(volunteer.token,'/api/day/phones')).statusCode).toBe(403);
  for(const [url,payload] of [...actions,[`/api/day/phones/${owner.phone.id}/role`,{role:'Volunteer'}]] as const) {
    const response=await call(volunteer.token,url,payload);expect(response.statusCode).toBe(403);expect(response.json().message).toBe('Lead access needed');
  }
  expect((await call(lead.token,'/api/day/phones')).statusCode).toBe(200);
  for(const [url,payload] of actions) expect((await call(lead.token,url,payload)).statusCode).toBe(200);
  expect((await call(target.token,'/api/me')).json().reason).toBe('signed-out');
  expect((await call(lead.token,`/api/day/phones/${owner.phone.id}/role`,{role:'Volunteer'})).json().message).toBe("The owner can't be made a volunteer");
  expect((await call(owner.token,'/api/me')).json().level).toBe('Lead');
});
test('a concurrent old lead-code upgrade cannot survive a new lead code',async()=>{
  const {owner,signInAs}=await start();const phone=await signInAs('Ahmed');
  for(let round=0;round<5;round++) {
    const day=(await call(owner.token,'/api/day')).json();
    const [upgraded,rotated]=await Promise.all([call(phone.token,'/api/become-lead',{code:day.leadCode}),call(owner.token,'/api/day/lead-code',{})]);
    expect([200,403]).toContain(upgraded.statusCode);expect(rotated.statusCode).toBe(200);
    expect((await call(phone.token,'/api/me')).json().level).toBe('Volunteer');
  }
});
