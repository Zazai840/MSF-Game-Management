import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
import { raceSetup } from './support/races.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
afterEach(async()=>{await app?.close();});
const group=async(token:string)=>(await call(token,'/api/races')).json().groups.find((group:any)=>group.event.code==='R3');
test.each([['Move to Deleted races',false],['Delete for good',true]])('%s on a final with no times brings "+ Final" back: the heats stay complete and the new final takes the fastest 6, nobody Here',async(_choice,permanent)=>{
 app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'final-back-owner',resetTestDay:true});
 const people=await signInOwner(app,'final-back-owner','Owner');
 const volunteer=(await people.volunteer('Start line volunteer')).token,lead=(await people.volunteer('Zone lead')).token;await call(lead,'/api/become-lead',{code:people.day.leadCode});
 const setup=raceSetup(app);
 await setup.record(volunteer,'R3',[1023,1088,1012,1135,1047,1101],[901,925,948,977,990,1024]);
 await setup.record(volunteer,'R3',[1066,1005,1110,1031,1092],[912,939,961,1003,1048]);
 const old=(await setup.makeFinal(lead,'R3')).race.id;
 expect((await call(lead,`/api/lead/races/${old}/delete`,{permanent})).statusCode).toBe(200);
 // The Races read offers the final again, and no new heat: the heats are still complete.
 expect(await group(lead)).toMatchObject({finalAvailable:true,finalReason:null,heatsOpen:false,medalsDecided:false});
 const heat=await call(lead,'/api/races',{eventCode:'R3',kind:'heat',number:3});
 expect(heat.statusCode).toBe(409);expect(heat.json().message).toBe('Boy Cubs heats are finished. Ask a lead to add another heat.');
 // "+ Final" makes the final directly, with no Reopen heats.
 const made=await call(lead,'/api/races',{eventCode:'R3',kind:'final'});
 expect(made.statusCode).toBe(200);
 const final=made.json().race;
 expect(final).toMatchObject({kind:'final',number:1});expect(final.id).not.toBe(old);
 expect(final.final.entries.map((entry:any)=>entry.wristband)).toEqual([1023,1066,1088,1005,1012,1110]);
 expect(final.final.entries.some((entry:any)=>entry.absent)).toBe(false);expect(final.parts.runners.value).toEqual([]);
 expect((await call(lead,'/api/lead/events/R3/results')).json().results).toMatchObject({status:'Heats complete - final to run',finalResults:{raceId:final.id,started:false}});
 const after=await group(lead);
 expect(after).toMatchObject({finalAvailable:false,heatsOpen:false});expect(after.races.map((race:any)=>race.kind)).toEqual(['heat','heat','final']);
});
