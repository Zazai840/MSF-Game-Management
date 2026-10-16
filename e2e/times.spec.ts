import { savedRaceLabel,enterWristband,enterTime,pickRace,jobButton,expect,joinDay,test,type Page } from './fixtures.js';
async function join(page:Page,name:string) {
  await page.goto('/');await joinDay(page,name);
}
test('three phones record a race, keep a time warning and repair a count mismatch',async({page,browser},info)=>{
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const numbers=[2201+offset,2202+offset,2203+offset];
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/events/R4/rename',{headers,data:{name:'60m'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await join(page,`Start times ${info.project.name}`);await jobButton(page,'Start line').click();await page.getByRole('button',{name:'60m',exact:true}).click();await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  for(const number of numbers) await enterWristband(page,number);
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();
  const label=await savedRaceLabel(page);
  const timerContext=await browser.newContext({...info.project.use});const timer=await timerContext.newPage();
  await join(timer,`Timer ${info.project.name}`);await jobButton(timer,'Times').click();await pickRace(timer,'Times',`60m Girl Cubs (R4) · ${label}`);
  await expect(timer.getByRole('heading',{name:'1st place time?',exact:true})).toBeVisible();await timer.getByLabel('Place time').fill('1234');await expect(timer.getByText('Shows as 12.34',{exact:true})).toBeVisible();
  await timer.screenshot({path:info.outputPath('times-entry.png'),fullPage:true});await timer.getByRole('button',{name:'Next',exact:true}).click();await timer.getByRole('button',{name:'No more finishers',exact:true}).click();
  await timer.route('**/api/races/*/times',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary connection problem'})}));
  await timer.getByRole('button',{name:'Save',exact:true}).click();await expect(timer.getByText('Not saved - tap Save again',{exact:true})).toBeVisible();
  await timer.reload();await jobButton(timer,'Times').click();await expect(timer.getByRole('heading',{name:'Check the times',exact:true})).toBeVisible();await timer.unroute('**/api/races/*/times');await timer.getByRole('button',{name:'Save',exact:true}).click();await savedRaceLabel(timer);
  const finishContext=await browser.newContext({...info.project.use});const finish=await finishContext.newPage();
  await join(finish,`Finish times ${info.project.name}`);await jobButton(finish,'Finish order').click();
  for(const number of [numbers[1],numbers[0]]) await finish.getByRole('button',{name:String(number),exact:true}).click();
  await finish.getByRole('button',{name:'Nobody else crossed the line',exact:true}).click();await finish.getByRole('button',{name:'Did not finish',exact:true}).click();await finish.getByRole('button',{name:'Save',exact:true}).click();await savedRaceLabel(finish);
  await timer.getByRole('button',{name:'Change times',exact:true}).click();await timer.getByRole('button',{name:'Refresh',exact:true}).click();await expect(timer.getByText('Finish order has 2 finishers, times have 1 - check the recording',{exact:true})).toBeVisible();await expect(timer.getByText('1 time · 2 finishers',{exact:true})).toBeVisible();
  await timer.getByRole('button',{name:'2nd did finish',exact:true}).click();await enterTime(timer,'1200');
  await expect(timer.getByRole('button',{name:'Fix time',exact:true})).toBeVisible();await timer.getByRole('button',{name:'Fix time',exact:true}).click();await expect(timer.getByLabel('Place time')).toHaveValue('');await enterTime(timer,'1200');await timer.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(timer.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toBeVisible();await timer.getByRole('button',{name:'Save',exact:true}).click();await savedRaceLabel(timer);
  await timer.getByRole('button',{name:'Change times',exact:true}).click();await timer.getByRole('button',{name:'2nd place · 12.00 · Faster than 1st place',exact:true}).click();const place=timer.getByLabel('Place time');await place.pressSequentially('1');await expect(place).toHaveValue('1');await expect(timer.getByText('Shows as 0.01',{exact:true})).toBeVisible();await place.pressSequentially('3240');await expect(timer.getByText('Shows as 1:32.40',{exact:true})).toBeVisible();await timer.getByRole('button',{name:'Next',exact:true}).click();
  await expect(timer.getByText('2 times · 2 finishers',{exact:true})).toBeVisible();await timer.screenshot({path:info.outputPath('times-review.png'),fullPage:true});await timer.getByRole('button',{name:'Save',exact:true}).click();await savedRaceLabel(timer);await expect(timer.getByText('Finish order has 2 finishers, times have 1 - check the recording',{exact:true})).toHaveCount(0);
  await timerContext.close();await finishContext.close();
});
test('Times premarks nonfinishers and keeps the draft version across polling and reload',async({page},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const checked=await page.request.post('/api/races/check-in',{headers,data:{eventCode:'R4',runners:[2301,2302]}});const race=(await checked.json()).race;
  await page.request.post(`/api/races/${race.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:[2301],didNotFinish:[2302],didNotRun:[],added:[]}});
  await join(page,`Times draft ${info.project.name}`);await jobButton(page,'Times').click();await pickRace(page,'Times',`60m Girl Cubs (R4) · Heat ${race.number}`);
  await expect(page.getByRole('button',{name:'2nd place · No finisher',exact:true})).toBeDisabled();
  await enterTime(page,'1234');await expect(page.getByRole('button',{name:'2nd did finish',exact:true})).toBeVisible();
  await page.request.post(`/api/races/${race.id}/times`,{headers,data:{baseVersion:0,places:[1300,null]}});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.reload();await jobButton(page,'Times').click();await expect(page.getByRole('button',{name:'1st place · 12.34',exact:true})).toBeVisible();
  const saving=page.waitForRequest(request=>request.url().endsWith(`/api/races/${race.id}/times`) && request.method()==='POST');
  await page.getByRole('button',{name:'Save',exact:true}).click();expect((await saving).postDataJSON()).toMatchObject({baseVersion:0,places:[1234,null]});
  await expect(page.getByText('Two versions - zone lead to check',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Change times',exact:true}).click();await pickRace(page,'Times',`60m Girl Cubs (R4) · Heat ${race.number}`);await expect(page.getByRole('button',{name:'1st place · 13.00',exact:true})).toBeVisible();
  const read=await (await page.request.get(`/api/lead/races/${race.id}`,{headers})).json();
  await page.request.post(`/api/lead/races/${race.id}/clashes/times`,{headers,data:{candidateId:read.clashes[0].candidates[0].id}});
});
