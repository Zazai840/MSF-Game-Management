import { timesOpened,goHome,trailBack,toCheckItem,openDashboard,dashboardMenuButton,jobButton,dashboardButton,becomeLead,expect,joinDay,test } from './fixtures.js';
test('live lead count, pending runner actions and duplicate choices share one queue',async({page},info)=>{
  const code=`NY-${info.project.name.toUpperCase()}`,headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  const queue=async()=>(await(await page.request.get('/api/lead',{headers})).json()).needsYou;
  /** On Home: the Dashboard button's badge matches the live queue. */
  const count=async()=>{const n=(await queue()).length;await expect(page.getByRole('button',{name:n?`Dashboard ${n} to check`:'Dashboard',exact:true})).toBeVisible({timeout:10000});};
  /** Back on the Dashboard menu: the To check button's badge matches the live queue. */
  const menuCount=async()=>{
    const n=(await queue()).length;await trailBack(page,'Dashboard');const button=dashboardMenuButton(page,'To check');
    if(n) await expect(button.getByText(`${n} to check`,{exact:true})).toBeVisible({timeout:10000});else await expect(button).not.toContainText('to check',{timeout:10000});
  };
  /** Inside a race: Home's count and the queue still agree. */
  const agrees=async()=>expect.poll(async()=>(await(await page.request.get('/api/home',{headers})).json()).needsYou).toBe((await queue()).length);
  await page.goto('/');await joinDay(page,`Queue lead ${info.project.name}`);await becomeLead(page);await count();
  await dashboardButton(page).click();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await trailBack(page,'Home');
  await page.request.post('/api/day/events',{headers,data:{code,name:'Needs you sprint',section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const checkIn=async(runners:number[])=>(await(await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners,keptWarnings:runners}})).json()).race;
  const first=await checkIn([3045,2001]),second=await checkIn([2001]);
  await page.request.post(`/api/races/${first.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:[3045,2001,2002],didNotFinish:[],didNotRun:[],added:[2002]}});
  await count();
  await jobButton(page,'Times').click();await timesOpened(page);await goHome(page);await count();
  await openDashboard(page,'To check');
  await toCheckItem(page,new RegExp(`${code}.*3045 is not a Girl Cubs number`)).click();
  const sheet=page.getByRole('dialog');await expect(sheet.getByRole('heading',{name:'Runner 3045',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('pending-warning-actions.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Disqualify for wrong section or age',exact:true}).click();await sheet.getByRole('button',{name:'Save disqualification',exact:true}).click();await expect(sheet).toHaveCount(0);await agrees();
  await page.getByRole('button',{name:'Open Race 1',exact:true}).click();await page.getByRole('button',{name:'Runner 3045',exact:true}).click();await sheet.getByRole('button',{name:'Lift disqualification',exact:true}).click();await sheet.getByLabel('Comment',{exact:true}).fill('Wristband confirmed for review');await sheet.getByRole('button',{name:'Save lift',exact:true}).click();await expect(sheet).toHaveCount(0);await agrees();
  await trailBack(page,'To check');await toCheckItem(page,new RegExp(`${code}.*3045 is not a Girl Cubs number`)).click();await sheet.getByRole('button',{name:'Mark checked',exact:true}).click();await expect(sheet).toHaveCount(0);await menuCount();
  await dashboardMenuButton(page,'To check').click();await toCheckItem(page,new RegExp(`${code}.*2002 crossed the line but was not checked in`)).click();
  await sheet.getByRole('button',{name:'Mark addition checked',exact:true}).click();await expect(sheet).toHaveCount(0);await menuCount();
  await dashboardMenuButton(page,'To check').click();await toCheckItem(page,new RegExp(`${code}.*2001 has a result in more than one race`)).first().click();await sheet.getByRole('button',{name:'Choose which result counts',exact:true}).click();
  await expect(sheet.getByLabel('Count Race 2',{exact:true})).toBeVisible();await expect(sheet.getByText('Race 2 · Not recorded yet',{exact:true})).toBeVisible();await sheet.getByLabel('Count Race 2',{exact:true}).check();await page.screenshot({path:info.outputPath('pending-duplicate-choice.png'),fullPage:true});await sheet.getByRole('button',{name:'Save counted result',exact:true}).click();await expect(sheet).toHaveCount(0);await menuCount();
  await dashboardMenuButton(page,'Results').click();await expect(page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)})).not.toContainText(/to check|needing you/i);
  await trailBack(page,'Dashboard');await dashboardMenuButton(page,'To check').click();await expect(page.getByRole('heading',{level:1,name:/zone lead|Nothing to check/})).toBeVisible();await expect(toCheckItem(page,new RegExp(`${code}.*more than one race`))).toHaveCount(0);await page.screenshot({path:info.outputPath('needs-you-cleared.png'),fullPage:true});
  for(const race of [first,second]) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
test('queue items open their race or tie directly and clear after the lead settles them',async({page},info)=>{
  const code=`NR-${info.project.name.toUpperCase()}`,headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/events',{headers,data:{code,name:'Queue race actions',section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const races:any[]=[];
  async function recorded(numbers:number[],places:number[]) {const race=(await(await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners:numbers}})).json()).race;races.push(race);await page.request.post(`/api/races/${race.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:numbers,didNotFinish:[],didNotRun:[],added:[]}});await page.request.post(`/api/races/${race.id}/times`,{headers,data:{baseVersion:0,places}});return race;}
  await recorded([2001,2002],[1700,1600]);const clash=await recorded([2003],[1400]);await page.request.post(`/api/races/${clash.id}/times`,{headers,data:{baseVersion:0,places:[1500]}});await recorded([2004],[2000]);await recorded([2005],[2000]);
  await page.goto('/');await joinDay(page,`Race queue lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'To check');
  const wrongTime=toCheckItem(page,new RegExp(`${code}.*A time looks wrong`)),versions=toCheckItem(page,new RegExp(`${code}.*Two different sets of times were saved`)),tie=toCheckItem(page,new RegExp(`${code}.*Runners tied on time`));
  await expect(page.getByRole('list',{name:'To check'})).toBeVisible();await expect(wrongTime).toBeVisible();
  await page.screenshot({path:info.outputPath('needs-you-races.png'),fullPage:true});
  await wrongTime.click();await expect(page.getByRole('button',{name:'Correct times',exact:true})).toBeVisible();await page.getByRole('button',{name:'Correct times',exact:true}).click();const sheet=page.getByRole('dialog');await sheet.getByLabel('Accept these out-of-order times',{exact:true}).check();await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
  await trailBack(page,'To check');await expect(versions).toBeVisible();await expect(wrongTime).toHaveCount(0);await versions.click();await page.getByRole('radio').last().check();await page.getByRole('button',{name:'Use chosen Times version',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Saved'})).toBeVisible();
  await trailBack(page,'To check');await expect(tie).toBeVisible();await expect(versions).toHaveCount(0);await tie.click();await expect(sheet.getByRole('heading',{name:'Tie at 20.00',exact:true})).toBeVisible();await sheet.getByRole('button',{name:'No run-off needed',exact:true}).click();await sheet.getByRole('button',{name:'Save tie',exact:true}).click();await expect(sheet).toHaveCount(0);
  await trailBack(page,'To check');await expect(page.getByRole('heading',{level:1,name:/zone lead|Nothing to check/})).toBeVisible();await expect(tie).toHaveCount(0);
  for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
