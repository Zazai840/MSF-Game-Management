import { deleteCurrentRace,openDashboard,openRaceScreen,becomeLead,expect,createProfile,lookProblems,readRaceScreen,recordRace,test,writeCheckIn,writeOrder,writeTimes,type APIRequestContext,type Page } from './fixtures.js';
async function signInAs(page:Page,name:string) {
  await page.goto('/');await createProfile(page,name);
}
/** Six runners placed and timed (the times by `timer`), then the last taken off as Didn't run: six times for five finishers. */
async function surplusRace(request:APIRequestContext,code:string,name:string,timer:string) {
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},runners=[2401,2402,2403,2404,2405,2406];
  expect((await request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'timed'}})).ok()).toBe(true);
  const token=process.env.E2E_SCORING_TOKEN!;
  await writeCheckIn(request,token,code,runners);await writeOrder(request,token,code,runners);
  await writeTimes(request,timer,code,[1200,1300,1400,1500,1600,1700]);
  await writeOrder(request,token,code,runners.slice(0,5),{didNotRun:[2406]});
}
const mismatch='Finish order has 5 finishers, times have 6 - check the recording';
test('a surplus time at a place with no wristband blocks Submit Race until the timer removes it',async({openPhone,request},info)=>{
  const project=info.project.name,code=`SV-${project.toUpperCase()}`,name=`Review surplus ${project}`;
  const {page,token}=await openPhone(`Surplus timer ${project}`);
  await surplusRace(request,code,name,token);
  await openRaceScreen(page,name);await page.getByRole('button',{name:/^Order and Times/}).click();
  const rows=page.getByRole('table',{name:'Order and times'}).getByRole('row');
  await expect(rows).toHaveText([/^Place/,/^1st\s*2401\s*12\.00$/,/^2nd/,/^3rd/,/^4th/,/^5th\s*2405\s*16\.00$/,/^6th\s*17\.00$/]);
  // Nothing more to time, the surplus time can't be retyped, and Submit Race waits until the timer removes it.
  await expect(page.locator('.race-blocked')).toHaveText('6th place has a time but no wristband');
  await expect(page.getByRole('button',{name:'Submit Race',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Place time',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^6th place/})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('surplus-times-volunteer.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:"Remove 6th place's time",exact:true}).click();
  await expect(rows).toHaveText([/^Place/,/^1st/,/^2nd/,/^3rd/,/^4th/,/^5th\s*2405\s*16\.00$/]);
  await expect(page.getByRole('button',{name:'Submit Race',exact:true})).toBeEnabled();
  await expect.poll(async()=>(await readRaceScreen(request,token,code)).race.parts.times.value?.places).toEqual([1200,1300,1400,1500,1600]);
  await deleteCurrentRace(request,code);
});
test('after a lead takes a finisher off a saved race, the lead sees the surplus time and the mismatch before correcting the last place',async({page},info)=>{
  const code=`SL-${info.project.name.toUpperCase()}`,headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},runners=[2401,2402,2403,2404,2405,2406];
  expect((await page.request.post('/api/day/events',{headers,data:{code,name:'Review surplus',section:'Girl Cubs',format:'timed'}})).ok()).toBe(true);
  const race=await recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,runners,[1200,1300,1400,1500,1600,1700]);
  // Finishers and times only disagree after a lead's correction: 2406 turns out not to have run.
  const saved=(await (await page.request.get(`/api/lead/races/${race.id}`,{headers})).json()).race;
  expect((await page.request.post(`/api/lead/races/${race.id}/finish-order`,{headers,data:{baseVersion:saved.parts.finish.version,runnersVersion:saved.parts.runners.version,order:runners.slice(0,5),didNotFinish:[],didNotRun:[2406]}})).ok()).toBe(true);
  await signInAs(page,`Surplus lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();await page.getByRole('button',{name:`Open Race ${race.number}`,exact:true}).click();await page.getByRole('button',{name:'Correct times',exact:true}).click();
  const sheet=page.getByRole('dialog');await expect(sheet.getByRole('button',{name:/^6th place · 17\.00/})).toBeVisible();await expect(sheet.getByText(mismatch,{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('surplus-times-lead.png'),fullPage:true});
  const leftover='This race has 5 runners. Choose No finisher for every place after 5th to save.';
  await expect(sheet.getByText(leftover,{exact:true})).toBeVisible();await expect(sheet.getByRole('button',{name:'Save times',exact:true})).toBeDisabled();
  await sheet.getByLabel('No finisher',{exact:true}).nth(5).check();await expect(sheet.getByText(mismatch,{exact:true})).toHaveCount(0);await expect(sheet.getByText(leftover,{exact:true})).toHaveCount(0);
  const correction=page.waitForResponse(response=>response.url().endsWith(`/api/lead/races/${race.id}/times`));await sheet.getByRole('button',{name:'Save times',exact:true}).click();expect((await correction).request().postDataJSON().places).toEqual([1200,1300,1400,1500,1600]);await expect(sheet).toHaveCount(0);
  const corrected=(await (await page.request.get(`/api/lead/races/${race.id}`,{headers})).json()).race;expect(corrected.parts.times.value.places).toEqual([1200,1300,1400,1500,1600]);
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
