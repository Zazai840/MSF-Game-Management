import { afterEach,expect,test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import readExcelFile from 'read-excel-file/node';
import pg from 'pg';
import { createApp } from '../src/server/app.js';
import { signInOwner } from './support/sign-in.js';
let app:FastifyInstance;
const call=(token:string,url:string,body?:unknown)=>app.inject({method:body===undefined?'GET':'POST',url,headers:{authorization:`Bearer ${token}`},...(body===undefined?{}:{payload:body as object})});
const year=new Date().getUTCFullYear();
afterEach(async()=>{await app?.close();});
async function start() {
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'this-day-owner',resetTestDay:true});
  const people=await signInOwner(app,'this-day-owner','Aisha Khan',{labelled:false});
  const volunteer=(await people.volunteer('Sam Patel')).token,lead=(await people.lead('Yusuf Ali')).token;
  return {owner:people.owner.token,volunteer,lead};
}
const thisDay=async(token:string)=>{const day=(await call(token,'/api/day')).json();return {year:day.year,region:day.region,dayNumber:day.dayNumber};};

test('a new day starts on the current year with Region and Day empty',async()=>{
  const {owner}=await start();
  expect(await thisDay(owner)).toEqual({year,region:null,dayNumber:null});
});
test('any lead sets Year, Region and Day one at a time, each raising the day\'s revision; a volunteer cannot',async()=>{
  const {owner,volunteer,lead}=await start();
  const refused=await call(volunteer,'/api/day/this-day',{region:'South'});
  expect(refused.statusCode).toBe(403);expect(refused.json().message).toBe('Lead access needed');
  let revision=(await call(owner,'/api/day')).json().revision;
  for(const change of [{region:'South'},{dayNumber:1},{year:year+1},{region:'National'},{year:2026}]) {
    const saved=await call(lead,'/api/day/this-day',change);
    expect(saved.statusCode,saved.body).toBe(200);
    const after=(await call(owner,'/api/day')).json();
    expect(after.revision).toBeGreaterThan(revision);revision=after.revision;
  }
  expect(await thisDay(owner)).toEqual({year:2026,region:'National',dayNumber:1});
});
test('the server refuses a value outside the lists, and more or fewer than one field, changing nothing',async()=>{
  const {owner}=await start();
  const before=(await call(owner,'/api/day')).json();
  for(const [change,message] of [
    [{year:2025},`Choose a year from 2026 to ${year+1}`],[{year:year+2},`Choose a year from 2026 to ${year+1}`],[{year:'2026'},`Choose a year from 2026 to ${year+1}`],
    [{region:'East'},'Choose North, South or National'],[{region:'south'},'Choose North, South or National'],[{region:null},'Choose North, South or National'],
    [{dayNumber:0},'Choose Day 1 to Day 5'],[{dayNumber:6},'Choose Day 1 to Day 5'],[{dayNumber:1.5},'Choose Day 1 to Day 5'],
    [{},'Choose one of Year, Region or Day'],[{region:'South',dayNumber:1},'Choose one of Year, Region or Day']
  ] as const) {
    const refused=await call(owner,'/api/day/this-day',change);
    expect(refused.statusCode,JSON.stringify(change)).toBe(400);expect(refused.json().message).toBe(message);
  }
  const after=(await call(owner,'/api/day')).json();
  expect(after.revision).toBe(before.revision);expect(await thisDay(owner)).toEqual({year,region:null,dayNumber:null});
});
test('the day export is refused until both Region and Day are set',async()=>{
  const {owner}=await start();
  const refusal=async()=>{const response=await call(owner,'/api/day/export',{});return [response.statusCode,response.json().message];};
  expect(await refusal()).toEqual([409,'Set the Region and Day under This day first']);
  await call(owner,'/api/day/this-day',{region:'South'});
  expect(await refusal()).toEqual([409,'Set the Region and Day under This day first']);
  await call(owner,'/api/day/this-day',{region:'North'});
  const day=(await call(owner,'/api/day')).json();expect(day.exportedAt).toBeNull();
  await call(owner,'/api/day/this-day',{dayNumber:3});
  expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);
});
test('the export is named after the day and its fifth tab, Day details, says which day it is and who took it',async()=>{
  const {owner,lead}=await start();
  await call(owner,'/api/day/this-day',{region:'South'});await call(owner,'/api/day/this-day',{dayNumber:1});
  const response=await call(lead,'/api/day/export',{});
  expect(response.statusCode).toBe(200);
  const at=String(response.headers['x-exported-at']);
  expect(response.headers['content-disposition']).toBe(`attachment; filename="msf-running-south-day-1-${at.slice(0,10)}.xlsx"`);
  const sheets=await readExcelFile(response.rawPayload);
  expect(sheets.map(sheet=>sheet.sheet)).toEqual(['Input - Running','Finals','All results','Audit notes','Day details']);
  expect(sheets[4].data).toEqual([['Year','Region','Day','Downloaded at','Downloaded by'],[year,'South','Day 1',at,'Yusuf Ali']]);
});
test('Start a new day copies nothing across from This day',async()=>{
  const {owner}=await start();
  await call(owner,'/api/day/this-day',{year:year+1});await call(owner,'/api/day/this-day',{region:'South'});await call(owner,'/api/day/this-day',{dayNumber:4});
  expect((await call(owner,'/api/day/export',{})).statusCode).toBe(200);
  expect((await call(owner,'/api/day/start-new',{confirmation:'NEW DAY'})).statusCode).toBe(200);
  expect(await thisDay(owner)).toEqual({year,region:null,dayNumber:null});
});
test('the storage upgrade gives the live day an older build left the current year and empty Region and Day',async()=>{
  const {owner}=await start();
  await app.close();
  const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  try {await db.query('ALTER TABLE olympics_days DROP COLUMN year, DROP COLUMN region, DROP COLUMN day_number');} finally {await db.end();}
  app=await createApp({databaseUrl:process.env.TEST_DATABASE_URL!,ownerPassword:'this-day-owner'});
  expect(await thisDay(owner)).toEqual({year,region:null,dayNumber:null});
  expect((await call(owner,'/api/day/this-day',{region:'South'})).statusCode).toBe(200);
});
