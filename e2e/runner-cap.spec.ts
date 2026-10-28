import {ownCode,ownEvent,openRace,recordRace,back,openLeadMenu,switchJob,becomeLead,expect,join,test,type Page,enterTime} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
async function signInAs(page:Page,name:string,lead=false) {
  await page.goto('/');await join(page,name,{job:'Start line'});
  if(lead) {await becomeLead(page);}
}
async function openResults(page:Page,code:string,name:string) {
  await signInAs(page,name,true);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · `)}).click();
}

test('a phone checks in 8 runners and carries them through each job in turn, the race saving itself, and Results',async({page,openPhone},info)=>{
  test.setTimeout(60000);
  const code=await ownCode(),name=`Eight ${info.project.name}`,numbers=[2801,2802,2803,2804,2805,2806,2807,2808];
  await ownEvent(page.request,code,name);await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  const {page:phone}=await openPhone(`Eight phone ${info.project.name}`);
  await phone.getByRole('button',{name:'New race',exact:true}).click();
  const newRace=phone.getByRole('dialog',{name:'New race'});
  await newRace.getByRole('button',{name,exact:true}).click();await newRace.getByRole('button',{name:`Girl Cubs ${code}`,exact:true}).click();
  await newRace.getByRole('button',{name:'Create heat 1',exact:true}).click();
  const input=phone.getByLabel('Wristband number',{exact:true});
  for(const number of numbers) {await expect(input).toBeEditable();await input.fill(String(number));await input.press('Enter');}
  await expect(phone.getByRole('list',{name:'Wristbands entered'}).getByRole('button')).toHaveCount(8);
  await expect(phone.locator('.rz-prompt__meta')).toHaveText('Heat 1 · 8 runners so far · more than usual');
  await phone.screenshot({path:info.outputPath('start-line-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:"That's everyone",exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Finish line');
  for(const [index,number] of numbers.entries()) await phone.getByRole('button',{name:new RegExp(`^${number} came ${index+1}(st|nd|rd|th)$`)}).click();
  await expect(phone.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await phone.screenshot({path:info.outputPath('finish-order-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:'Save positions',exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Timer');
  for(const [index] of numbers.entries()) {await expect(phone.getByRole('heading',{level:2,name:/place time\?$/})).toBeVisible();await enterTime(phone,1200+index*15);}
  await expect(phone.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  await openResults(page,code,`Eight lead ${info.project.name}`);
  const board=page.getByRole('list',{name:'Provisional leaderboard'});
  await expect(board.locator('.leaderboard-row')).toHaveCount(8);await expect(board.locator('.leaderboard-row.highlighted')).toHaveCount(8);await expect(board.locator('.result-mark')).toHaveCount(6);
  await expect(board.getByRole('button',{name:'Runner 2808 · Heat 1',exact:true})).toContainText('13.05');
  await page.screenshot({path:info.outputPath('results-eight.png'),fullPage:true});
});

test('a lead adds a 7th runner to a saved final and the final is recorded end to end',async({page,openPhone},info)=>{
  test.setTimeout(60000);
  const code=await ownCode(),name=`Seven ${info.project.name}`;
  await ownEvent(page.request,code,name,'Boy Cubs','heats');await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  for(const [runners,times] of [[[1801,1802,1803,1804,1805,1806],[900,910,920,930,940,950]],[[1807,1808],[945,1000]]]) {
    await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,runners,times);
  }
  expect((await page.request.post(`/api/lead/events/${code}/complete-stage`,{headers:headers(),data:{stage:'heats'}})).ok()).toBe(true);
  // The final of six runs in the race flow: everyone here at the start line, then the finishing order, and it saves itself.
  const {page:phone}=await openPhone(`Seven phone ${info.project.name}`);await openRace(phone,name,'Boy Cubs','Final');
  await expect(phone.locator('.rz-prompt__meta')).toHaveText('Final · 6 of 6 here');
  await expect(phone.getByRole('button',{name:/: Here\. Mark absent$/})).toHaveCount(6);
  await phone.getByRole('button',{name:"That's everyone",exact:true}).click();
  await openRace(phone,name,'Boy Cubs','Final');await switchJob(phone,'Finish line');
  for(const [number,place] of [[1801,'1st'],[1807,'2nd'],[1802,'3rd'],[1803,'4th'],[1804,'5th'],[1805,'6th']] as const) await phone.getByRole('button',{name:`${number} came ${place}`,exact:true}).click();
  await phone.getByRole('button',{name:'Save positions',exact:true}).click();
  await expect(phone.locator('.rz-toast')).toContainText('Positions saved · Boy Cubs Final');
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
