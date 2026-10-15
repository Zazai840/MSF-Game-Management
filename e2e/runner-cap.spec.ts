import { backToEvent,openDashboard,savedRaceLabel,goHome,enterWristband,jobButton,becomeLead,expect,joinDay,test,type Page } from './fixtures.js';
const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
async function join(page:Page,name:string,lead=false) {
  await page.goto('/');await joinDay(page,name);
  if(lead) {await becomeLead(page);}
}
async function enter(page:Page,value:number) {for(const digit of String(value)) await page.getByRole('button',{name:digit,exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();}
async function openResults(page:Page,code:string,name:string) {
  await join(page,name,true);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · `)}).click();
}

test('a phone checks in 8 runners and carries them through finishing order, times and Results',async({page,browser},info)=>{
  test.setTimeout(60000);
  const code=`E8-${info.project.name.slice(0,3).toUpperCase()}`,name=`Eight ${info.project.name}`,numbers=[2801,2802,2803,2804,2805,2806,2807,2808];
  expect((await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'heats'}})).ok()).toBe(true);await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const context=await browser.newContext({...info.project.use}),phone=await context.newPage();await join(phone,`Eight phone ${info.project.name}`);
  await jobButton(phone,'Start line').click();await phone.getByRole('button',{name,exact:true}).click();await phone.getByRole('button',{name:`Girl Cubs · ${code}`,exact:true}).click();
  for(const number of numbers) await enterWristband(phone,number);
  await expect(phone.getByRole('heading',{name:'Runner 9: wristband number?',exact:true})).toBeVisible();
  await phone.screenshot({path:info.outputPath('start-line-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:"That's everyone",exact:true}).click();await expect(phone.getByText('8 runners lined up',{exact:true})).toBeVisible();
  await phone.getByRole('button',{name:'Save',exact:true}).click();expect(await savedRaceLabel(phone)).toBe('Heat 1');await expect(phone.getByTestId('saved-race')).toContainText('8 runners');
  await goHome(phone);await jobButton(phone,'Finish order').click();await phone.getByRole('button',{name:'Other race',exact:true}).click();await phone.getByRole('button',{name:new RegExp(`${code}.*Heat 1`)}).click();
  for(const number of numbers) await phone.getByRole('button',{name:String(number),exact:true}).click();
  await phone.screenshot({path:info.outputPath('finish-order-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:'Check the order',exact:true}).click();await phone.getByRole('button',{name:'Save',exact:true}).click();await expect(phone.getByRole('status')).toContainText('Saved');
  await phone.getByRole('button',{name:'Home',exact:true}).click();await jobButton(phone,'Times').click();await phone.getByRole('button',{name:'Other race',exact:true}).click();await phone.getByRole('button',{name:new RegExp(`${code}.*Heat 1`)}).click();
  for(const [index] of numbers.entries()) {await expect(phone.getByRole('heading',{name:/place time\?$/})).toBeVisible();await enter(phone,1200+index*15);}
  await expect(phone.getByRole('heading',{name:'Check the times',exact:true})).toBeVisible();await expect(phone.getByRole('button',{name:'8th place · 13.05',exact:true})).toBeVisible();
  await phone.screenshot({path:info.outputPath('times-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:'Save',exact:true}).click();await expect(phone.getByRole('status')).toContainText('Saved');
  await openResults(page,code,`Eight lead ${info.project.name}`);
  const board=page.getByRole('list',{name:'Provisional leaderboard'});
  await expect(board.locator('.leaderboard-row')).toHaveCount(8);await expect(board.locator('.leaderboard-row.highlighted')).toHaveCount(8);await expect(board.locator('.result-mark')).toHaveCount(6);
  await expect(board.getByRole('button',{name:'Runner 2808 · Heat 1',exact:true})).toContainText('13.05');
  await page.screenshot({path:info.outputPath('results-eight.png'),fullPage:true});
  await context.close();
});

test('a lead adds a 7th runner to a final and the final is recorded end to end',async({page,browser},info)=>{
  test.setTimeout(60000);
  const code=`F7-${info.project.name.slice(0,3).toUpperCase()}`,name=`Seven ${info.project.name}`;
  expect((await page.request.post('/api/day/events',{headers,data:{code,name,section:'Boy Cubs',format:'heats'}})).ok()).toBe(true);await page.request.post('/api/day/confirm-events',{headers,data:{}});
  for(const [runners,times] of [[[1801,1802,1803,1804,1805,1806],[900,910,920,930,940,950]],[[1807,1808],[945,1000]]]) {
    const race=(await (await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners}})).json()).race;
    await page.request.post(`/api/races/${race.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:runners,didNotFinish:[],didNotRun:[],added:[]}});await page.request.post(`/api/races/${race.id}/times`,{headers,data:{baseVersion:0,places:times}});
  }
  expect((await page.request.post(`/api/lead/events/${code}/complete-stage`,{headers,data:{stage:'heats'}})).ok()).toBe(true);
  await openResults(page,code,`Seven lead ${info.project.name}`);
  await page.getByRole('button',{name:'Open final',exact:true}).click();await page.getByRole('button',{name:'Correct runner list',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:'Add runner',exact:true}).click();await sheet.getByLabel('Wristband for runner 7',{exact:true}).fill('1806');
  await expect(sheet.getByRole('button',{name:'Add runner',exact:true})).toBeEnabled();
  await page.screenshot({path:info.outputPath('lead-add-seventh.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Review runner list',exact:true}).click();await expect(sheet.getByRole('heading',{name:'7 runners. Is that right?',exact:true})).toBeVisible();
  await sheet.getByLabel('Comment (optional)',{exact:true}).fill('Tie for 6th');await sheet.getByRole('button',{name:'Save runner list',exact:true}).click();await expect(sheet).toHaveCount(0);
  const context=await browser.newContext({...info.project.use}),phone=await context.newPage();await join(phone,`Seven phone ${info.project.name}`);
  await jobButton(phone,'Start line').click();await phone.getByRole('button',{name:new RegExp(`${code}.*Final 1`)}).click();
  await expect(phone.getByRole('heading',{name:'Is everyone here?',exact:true})).toBeVisible();await expect(phone.getByRole('button',{name:/ · Here$/})).toHaveCount(7);
  await phone.screenshot({path:info.outputPath('final-attendance-seven.png'),fullPage:true});
  await phone.getByRole('button',{name:'Check attendance',exact:true}).click();await phone.getByRole('button',{name:'Save',exact:true}).click();expect(await savedRaceLabel(phone)).toBe('Final 1');
  const order=[1806,1801,1807,1802,1803,1804,1805];
  await goHome(phone);await jobButton(phone,'Finish order').click();await phone.getByRole('button',{name:'Other race',exact:true}).click();await phone.getByRole('button',{name:new RegExp(`${code}.*Final 1`)}).click();
  for(const number of order) await phone.getByRole('button',{name:String(number),exact:true}).click();
  await phone.getByRole('button',{name:'Check the order',exact:true}).click();await phone.screenshot({path:info.outputPath('final-finish-seven.png'),fullPage:true});
  await phone.getByRole('button',{name:'Save',exact:true}).click();await expect(phone.getByRole('status')).toContainText('Saved');
  await backToEvent(page);await page.getByRole('button',{name:'Refresh Results',exact:true}).click();
  const final=page.getByRole('list',{name:'Final leaderboard'});await expect(final.locator('.leaderboard-row')).toHaveCount(7);await expect(final.locator('.leaderboard-row').first()).toContainText('1806');
  await page.getByRole('button',{name:'Final complete',exact:true}).click();const complete=page.getByRole('dialog',{name:'Final complete',exact:true});await expect(complete).toContainText('1st: 1806');await complete.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('table',{name:'Input - Running'})).toContainText('1806');
  await page.screenshot({path:info.outputPath('final-complete-seven.png'),fullPage:true});
  await context.close();
});
