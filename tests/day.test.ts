import { afterEach, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app: FastifyInstance, people: Awaited<ReturnType<typeof signInOwner>>;
const auth = (token:string) => ({authorization:`Bearer ${token}`});
const call = (token:string, url:string, payload?:unknown) => app.inject({method:payload===undefined?'GET':'POST',url,headers:{...auth(token),...(payload===undefined?{}:{'content-type':'application/json'})},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});
afterEach(async()=>{await app?.close();});
async function start() {
  app = await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'day-owner-fixture',resetTestDay:true});
  people = await signInOwner(app,'day-owner-fixture');
  return people.owner.token;
}
test('a new Olympics day starts with exactly the 20 individual running events',async()=>{
  const token = await start();
  const day = (await call(token,'/api/day')).json();
  expect(day.eventsConfirmed).toBe(false);
  expect(day.events.map((event:any)=>[event.code,event.name,event.section,event.format,event.enabled])).toEqual([
    ['R1','60m','Boy Beavers','heats',true],['R2','60m','Girl Beavers','heats',true],
    ['R3','60m','Boy Cubs','heats',true],['R4','60m','Girl Cubs','heats',true],
    ['R5','60m','Boy Scouts','heats',true],['R6','60m','Girl Scouts','heats',true],
    ['R7','60m Hurdles','Boy Beavers','timed',true],['R8','60m Hurdles','Girl Beavers','timed',true],
    ['R9','60m Hurdles','Boy Cubs','timed',true],['R10','60m Hurdles','Girl Cubs','timed',true],
    ['R11','60m Hurdles','Boy Scouts','timed',true],['R12','60m Hurdles','Girl Scouts','timed',true],
    ['R13','200m','Boy Beavers','timed',true],['R14','200m','Girl Beavers','timed',true],
    ['R15','200m','Boy Cubs','timed',true],['R16','200m','Girl Cubs','timed',true],
    ['R17','200m','Boy Scouts','timed',true],['R18','200m','Girl Scouts','timed',true],
    ['R23','400m','Boy Scouts','timed',true],['R24','400m','Girl Scouts','timed',true]
  ]);
});
test('the scoring team confirms the event list for the Olympics day',async()=>{
  const token = await start();
  const before = (await call(token,'/api/day')).json();
  const saved = await call(token,'/api/day/confirm-events',{});
  expect(saved.statusCode).toBe(200);
  const after = (await call(token,'/api/day')).json();
  expect(after.eventsConfirmed).toBe(true);
  expect(after.revision).toBeGreaterThan(before.revision);
});
test('the scoring team renames an event and the changed list needs confirmation again',async()=>{
  const token = await start();
  await call(token,'/api/day/confirm-events',{});
  const before = (await call(token,'/api/day')).json();
  const saved = await call(token,'/api/day/events/R4/rename',{name:'60m sprint'});
  expect(saved.statusCode).toBe(200);
  const after = (await call(token,'/api/day')).json();
  expect(after.events.find((event:any)=>event.code==='R4')).toMatchObject({name:'60m sprint',section:'Girl Cubs',format:'heats'});
  expect(after.eventsConfirmed).toBe(false);
  expect(after.revision).toBeGreaterThan(before.revision);
});
test('the scoring team adds an event with its code, name, section and event format',async()=>{
  const token = await start();
  const event = {code:'R25',name:'Extra sprint',section:'Girl Cubs',format:'timed'};
  const saved = await call(token,'/api/day/events',event);
  expect(saved.statusCode).toBe(200);
  const day = (await call(token,'/api/day')).json();
  expect(day.events).toHaveLength(21);
  expect(day.events.at(-1)).toMatchObject({...event,enabled:true});
});
test.each([
  [{code:'R25',name:'Sprint',section:'Girl Cubs',format:'relay'},'Choose heats then final or timed'],
  [{code:'R25',name:'Sprint',section:'Penguins',format:'timed'},'Choose one of the six sections'],
  [{code:'',name:'Sprint',section:'Girl Cubs',format:'timed'},'Enter an event code (letters, numbers or hyphens, up to 12 characters)'],
  [{code:25,name:'Sprint',section:'Girl Cubs',format:'timed'},'Enter an event code (letters, numbers or hyphens, up to 12 characters)'],
  [null,'Enter event details']
])('invalid event details are refused plainly: %j',async(payload,message)=>{
  const token = await start();
  const response = await call(token,'/api/day/events',payload);
  expect(response.statusCode).toBe(400);
  expect(response.json().message).toBe(message);
  expect((await call(token,'/api/day')).json().events).toHaveLength(20);
});
test('an event code already in the programme is refused plainly',async()=>{
  const token = await start();
  const response = await call(token,'/api/day/events',{code:' r4 ',name:'Sprint',section:'Girl Cubs',format:'timed'});
  expect(response.statusCode).toBe(409);
  expect(response.json().message).toBe('An event already uses R4');
});
test('a switched-off event stays on Day and disappears from volunteer event choices',async()=>{
  const token = await start();
  const volunteer = await people.volunteer('Ahmed');
  const saved = await call(token,'/api/day/events/R4/enabled',{enabled:false});
  expect(saved.statusCode).toBe(200);
  const choices = await call(volunteer.token,'/api/events');
  expect(choices.statusCode).toBe(200);
  expect(choices.json().events).toHaveLength(19);
  expect(choices.json().events.some((event:any)=>event.code==='R4')).toBe(false);
  expect(choices.json()).not.toHaveProperty('leadCode');
  expect((await call(token,'/api/day')).json().events.find((event:any)=>event.code==='R4').enabled).toBe(false);
});
test('volunteers and ordinary leads are refused every scoring-team setup action',async()=>{
  const token = await start();
  const day = (await call(token,'/api/day')).json();
  for (const name of ['Volunteer Ahmed','Lead Maryam']) {
    const phone = await people.volunteer(name);
    if (name==='Lead Maryam') await call(phone.token,'/api/become-lead',{code:day.leadCode});
    for (const [url,payload] of [
      ['/api/day/confirm-events',{}],
      ['/api/day/events/R4/rename',{name:'Changed'}],
      ['/api/day/events/R4/enabled',{enabled:false}],
      ['/api/day/events',{code:'R25',name:'Changed',section:'Girl Cubs',format:'timed'}]
    ] as const) {
      const response = await call(phone.token,url,payload);
      expect(response.statusCode).toBe(403);
      expect(response.json().message).toBe('Scoring team access needed');
    }
    expect((await call(phone.token,'/api/day')).statusCode).toBe(403);
  }
});
test('Become lead refuses a wrong code and preserves the signed-in name and scoring-team level',async()=>{
  const token = await start();
  const day = (await call(token,'/api/day')).json();
  const phone = await people.volunteer('Ahmed');
  const wrong = await call(phone.token,'/api/become-lead',{code:'wrong-fixture'});
  expect(wrong.statusCode).toBe(403);
  expect(wrong.json().message).toBe('Wrong lead code');
  expect((await call(phone.token,'/api/me')).json()).toMatchObject({name:'Ahmed',level:'Volunteer'});
  expect((await call(phone.token,'/api/become-lead',{code:day.leadCode})).json()).toMatchObject({id:phone.phone.id,name:'Ahmed',level:'Lead'});
  expect((await call(token,'/api/become-lead',{code:day.leadCode})).json()).toMatchObject({name:'Aisha',level:'Scoring team'});
  expect((await call(phone.token,'/api/become-lead',{code:'day-owner-fixture'})).json()).toMatchObject({name:'Ahmed',level:'Scoring team'});
});
test('the day read shows the scoring team the Olympics password and there is no day code to read, make or join with',async()=>{
  const token = await start();
  const day = (await call(token,'/api/day')).json();
  expect(day.olympicsPassword).toMatch(/^[A-Z0-9]{8}$/);
  expect(Object.keys(day).filter(key=>/day.?code/i.test(key))).toEqual([]);
  expect((await call(token,'/api/day/day-code',{})).statusCode).toBe(404);
  expect((await app.inject({method:'POST',url:'/api/join',payload:{code:day.olympicsPassword,name:'Sam Patel'}})).statusCode).toBe(404);
});
