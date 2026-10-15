import { pickRace,openDashboard,savedRaceLabel,enterWristband,jobButton,becomeLead,expect,joinDay,test,type Page } from './fixtures.js';
async function join(page:Page,name:string) {
  await page.goto('/');await joinDay(page,name);
}
async function surplusRace(page:Page,code:string) {
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  expect((await page.request.post('/api/day/events',{headers,data:{code,name:'Review surplus',section:'Girl Cubs',format:'timed'}})).ok()).toBe(true);
  const race=(await (await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners:[2401,2402,2403,2404,2405,2406]}})).json()).race;
  expect((await page.request.post(`/api/races/${race.id}/times`,{headers,data:{baseVersion:0,places:[1200,1300,1400,1500,1600,1700]}})).ok()).toBe(true);
  expect((await page.request.post(`/api/races/${race.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:[2401,2402,2403,2404,2405],didNotFinish:[],didNotRun:[2406],added:[]}})).ok()).toBe(true);
  return {race,headers};
}
const mismatch='Finish order has 5 finishers, times have 6 - check the recording';
test('Times keeps surplus saved numeric places visible until the volunteer deliberately records No finisher',async({page},info)=>{
  const code=`SV-${info.project.name.toUpperCase()}`,{race,headers}=await surplusRace(page,code);
  await join(page,`Surplus timer ${info.project.name}`);await jobButton(page,'Times').click();await pickRace(page,'Times',`Review surplus Girl Cubs (${code}) · Race ${race.number} · Finishers and times don't agree`);
  await expect(page.getByRole('button',{name:'6th place · 17.00',exact:true})).toBeVisible();await expect(page.getByText(mismatch,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();await savedRaceLabel(page);await expect(page.getByText(mismatch,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Change times',exact:true}).click();
  const unchanged=await (await page.request.get(`/api/races/${race.id}`,{headers})).json();expect(unchanged.parts.times.value.places).toEqual([1200,1300,1400,1500,1600,1700]);
  await page.getByRole('button',{name:'6th place · 17.00',exact:true}).click();await expect(page.getByText(mismatch,{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('surplus-times-volunteer.png'),fullPage:true});
  await page.getByRole('button',{name:'No more finishers',exact:true}).click();await expect(page.getByRole('list',{name:'Times',exact:true}).getByRole('listitem').nth(5)).toHaveText('6thNo finisher');const correction=page.waitForResponse(response=>response.url().endsWith(`/api/races/${race.id}/times`) && response.request().method()==='POST');await page.getByRole('button',{name:'Save',exact:true}).click();expect((await correction).ok()).toBe(true);await savedRaceLabel(page);await expect(page.getByText(mismatch,{exact:true})).toHaveCount(0);
  const corrected=await (await page.request.get(`/api/races/${race.id}`,{headers})).json();expect(corrected.parts.times.value.places).toEqual([1200,1300,1400,1500,1600]);
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
test('a lead sees surplus numeric times and the mismatch before deliberately correcting the last place',async({page},info)=>{
  const code=`SL-${info.project.name.toUpperCase()}`,{race,headers}=await surplusRace(page,code);
  await join(page,`Surplus lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();await page.getByRole('button',{name:`Open Race ${race.number}`,exact:true}).click();await page.getByRole('button',{name:'Correct times',exact:true}).click();
  const sheet=page.getByRole('dialog');await expect(sheet.getByRole('button',{name:/^6th place · 17\.00/})).toBeVisible();await expect(sheet.getByText(mismatch,{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('surplus-times-lead.png'),fullPage:true});
  const leftover='This race has 5 runners. Choose No finisher for every place after 5th to save.';
  await expect(sheet.getByText(leftover,{exact:true})).toBeVisible();await expect(sheet.getByRole('button',{name:'Save times',exact:true})).toBeDisabled();
  await sheet.getByLabel('No finisher',{exact:true}).nth(5).check();await expect(sheet.getByText(mismatch,{exact:true})).toHaveCount(0);await expect(sheet.getByText(leftover,{exact:true})).toHaveCount(0);
  const correction=page.waitForResponse(response=>response.url().endsWith(`/api/lead/races/${race.id}/times`));await sheet.getByRole('button',{name:'Save times',exact:true}).click();expect((await correction).request().postDataJSON().places).toEqual([1200,1300,1400,1500,1600]);await expect(sheet).toHaveCount(0);
  const corrected=await (await page.request.get(`/api/races/${race.id}`,{headers})).json();expect(corrected.parts.times.value.places).toEqual([1200,1300,1400,1500,1600]);
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
test('Start line shows enabled event choices alongside the programme confirmation reminder',async({page},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},code=`UC-${info.project.name.toUpperCase()}`;
  await page.request.post('/api/day/events',{headers,data:{code,name:'Unconfirmed sprint',section:'Girl Cubs',format:'timed'}});
  await join(page,`Unconfirmed start ${info.project.name}`);await jobButton(page,'Start line').click();await expect(page.getByText('Ask the scoring team to confirm the event list',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Unconfirmed sprint',exact:true}).click();await page.getByRole('button',{name:`Girl Cubs · ${code}`,exact:true}).click();await enterWristband(page,2450);await page.getByRole('button',{name:"That's everyone",exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();expect(await savedRaceLabel(page)).toBe('Race 1');await page.getByRole('button',{name:'Delete this race',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
});
