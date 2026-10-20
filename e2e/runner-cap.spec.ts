import { ownEvent,openRaceScreen,recordRace,back,openDashboard,enterWristband,becomeLead,expect,createProfile,test,type Page,enterTime } from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
async function signInAs(page:Page,name:string,lead=false) {
  await page.goto('/');await createProfile(page,name);
  if(lead) {await becomeLead(page);}
}
async function openResults(page:Page,code:string,name:string) {
  await signInAs(page,name,true);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · `)}).click();
}

test('a phone checks in 8 runners on the race screen and carries them through the order, times, Submit Race and Results',async({page,openPhone},info)=>{
  test.setTimeout(60000);
  const code=`E8-${info.project.name.slice(0,3).toUpperCase()}`,name=`Eight ${info.project.name}`,numbers=[2801,2802,2803,2804,2805,2806,2807,2808];
  await ownEvent(page.request,code,name);await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  const {page:phone}=await openPhone(`Eight phone ${info.project.name}`);
  await openRaceScreen(phone,name);await phone.getByRole('button',{name:/^Check-in Wristbands/}).click();
  for(const number of numbers) await enterWristband(phone,number);
  await expect(phone.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveCount(8);
  await expect(phone.getByText('Heat 1 · 8 runners',{exact:true})).toBeVisible();
  await phone.screenshot({path:info.outputPath('start-line-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:/^Order and Times/}).click();
  await phone.getByRole('button',{name:'Do the order',exact:true}).click();await phone.getByRole('button',{name:'Do the times',exact:true}).click();
  for(const number of numbers) await phone.getByRole('button',{name:String(number),exact:true}).click();
  await expect(phone.getByText('Everyone has a place',{exact:true})).toBeVisible();
  await phone.screenshot({path:info.outputPath('finish-order-eight.png'),fullPage:true});
  for(const [index] of numbers.entries()) {await expect(phone.getByRole('heading',{name:/place time\?$/})).toBeVisible();await enterTime(phone,1200+index*15);}
  await expect(phone.getByRole('table',{name:'Order and times'}).getByRole('row').last()).toHaveText(/^8th\s*2808\s*13\.05$/);
  await phone.screenshot({path:info.outputPath('times-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:'Submit Race',exact:true}).click();await expect(phone.getByText('Heat 1 saved',{exact:true})).toBeVisible();
  await openResults(page,code,`Eight lead ${info.project.name}`);
  const board=page.getByRole('list',{name:'Provisional leaderboard'});
  await expect(board.locator('.leaderboard-row')).toHaveCount(8);await expect(board.locator('.leaderboard-row.highlighted')).toHaveCount(8);await expect(board.locator('.result-mark')).toHaveCount(6);
  await expect(board.getByRole('button',{name:'Runner 2808 · Heat 1',exact:true})).toContainText('13.05');
  await page.screenshot({path:info.outputPath('results-eight.png'),fullPage:true});
});

test('a lead adds a 7th runner to a saved final and the final is recorded end to end',async({page,openPhone},info)=>{
  test.setTimeout(60000);
  const code=`F7-${info.project.name.slice(0,3).toUpperCase()}`,name=`Seven ${info.project.name}`;
  expect((await page.request.post('/api/day/events',{headers:headers(),data:{code,name,section:'Boy Cubs',format:'heats'}})).ok()).toBe(true);await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  for(const [runners,times] of [[[1801,1802,1803,1804,1805,1806],[900,910,920,930,940,950]],[[1807,1808],[945,1000]]]) {
    await recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,runners,times);
  }
  expect((await page.request.post(`/api/lead/events/${code}/complete-stage`,{headers:headers(),data:{stage:'heats'}})).ok()).toBe(true);
  // The final of six runs on the race screen; the phone holds check-in and the order, so its one press saves it.
  const {page:phone}=await openPhone(`Seven phone ${info.project.name}`);await openRaceScreen(phone,name,'Boy Cubs');
  await expect(phone.getByText('Final · 6 runners',{exact:true})).toBeVisible();
  await phone.getByRole('button',{name:/^Check-in Wristbands/}).click();
  await expect(phone.getByRole('button',{name:/ Here$/,pressed:true})).toHaveCount(6);
  await phone.getByRole('button',{name:/^Finishing order/}).click();
  for(const number of [1801,1807,1802,1803,1804,1805]) await phone.getByRole('button',{name:String(number),exact:true}).click();
  await expect(phone.getByText('Everyone has a place',{exact:true})).toBeVisible();
  await phone.getByRole('button',{name:'Submit Race',exact:true}).click();await expect(phone.getByText('Final saved',{exact:true})).toBeVisible();
  // A tie for 6th: the lead adds 1806 to the saved final, then gives them their place.
  await openResults(page,code,`Seven lead ${info.project.name}`);
  await page.getByRole('button',{name:'Open final',exact:true}).click();await page.getByRole('button',{name:'Correct runner list',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:'Add runner',exact:true}).click();await sheet.getByLabel('Wristband for runner 7',{exact:true}).fill('1806');
  await expect(sheet.getByRole('button',{name:'Add runner',exact:true})).toBeEnabled();
  await page.screenshot({path:info.outputPath('lead-add-seventh.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Review runner list',exact:true}).click();await expect(sheet.getByRole('heading',{name:'7 runners. Is that right?',exact:true})).toBeVisible();
  await sheet.getByLabel('New runners did not finish',{exact:true}).check();
  await sheet.getByLabel('Comment (optional)',{exact:true}).fill('Tie for 6th');await sheet.getByRole('button',{name:'Save runner list',exact:true}).click();await expect(sheet).toHaveCount(0);
  await page.getByRole('button',{name:'Correct finishing order',exact:true}).click();
  await sheet.getByRole('button',{name:'Give a place to 1806',exact:true}).click();
  const rows=sheet.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
  await expect(rows).toHaveCount(7);await expect(rows.last()).toContainText('7th1806');
  await page.screenshot({path:info.outputPath('lead-order-seventh.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Done',exact:true}).click();await expect(sheet).toHaveCount(0);
  await back(page,`${name} Boy Cubs`);await page.getByRole('button',{name:'Refresh',exact:true}).click();
  const final=page.getByRole('list',{name:'Final leaderboard'});await expect(final.locator('.leaderboard-row')).toHaveCount(7);
  await expect(final.locator('.leaderboard-row').first()).toContainText('1801');await expect(final.locator('.leaderboard-row').last()).toContainText('1806');
  await page.getByRole('button',{name:'Final complete',exact:true}).click();const complete=page.getByRole('dialog',{name:'Final complete',exact:true});await expect(complete).toContainText('1st: 1801');await complete.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('table',{name:'Input - Running'})).toContainText('1801');
  await page.screenshot({path:info.outputPath('final-complete-seven.png'),fullPage:true});
});
