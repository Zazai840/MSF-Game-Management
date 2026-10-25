import { lookProblems,recordRace,back,toCheckItem,openDashboard,dashboardMenuButton,dashboardButton,becomeLead,expect,createProfile,submitRace,test,writeCheckIn,writeOrder,writeTimes } from './fixtures.js';
/** This run's own suffix, so the spec can repeat in one run (--repeat-each) without reusing a code or profile name. */
const run=(info:{project:{name:string};repeatEachIndex:number})=>`${info.project.name.toUpperCase()}${info.repeatEachIndex?`-${info.repeatEachIndex}`:''}`;
test('live lead count, pending runner actions and duplicate choices share one queue',async({page},info)=>{
  const code=`NY-${run(info)}`,headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  const queue=async()=>(await(await page.request.get('/api/lead',{headers})).json()).needsYou;
  /** On Home: the Dashboard button's badge matches the live queue. */
  const count=async()=>{const n=(await queue()).length;await expect(page.getByRole('button',{name:n?`Dashboard ${n} to check`:'Dashboard',exact:true})).toBeVisible({timeout:10000});};
  /** Back on the Dashboard: the To check heading matches the live queue. */
  const menuCount=async()=>{
    const n=(await queue()).length;await back(page,'Dashboard');
    await expect(page.getByRole('heading',{level:2,name:n===0?'Nothing to check':`${n} ${n===1?'thing needs':'things need'} a zone lead`,exact:true})).toBeVisible({timeout:10000});
  };
  /** Inside a race: Home's count and the queue still agree. */
  const agrees=async()=>expect.poll(async()=>(await(await page.request.get('/api/home',{headers})).json()).needsYou).toBe((await queue()).length);
  await page.goto('/');await createProfile(page,`Queue lead ${run(info)}`);await becomeLead(page);await count();
  await dashboardButton(page).click();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await back(page,'Home');
  await page.request.post('/api/day/events',{headers,data:{code,name:`Needs you sprint ${run(info)}`,section:'Girl Cubs',format:'timed',type:'races'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  // Race 1: a kept wrong-section warning and a runner added at the finish. Race 2: 2001 again. Both saved, so both on To check.
  const token=process.env.E2E_OWNER_TOKEN!;
  await writeCheckIn(page.request,token,code,[3045,2001],[3045,2001]);
  await writeOrder(page.request,token,code,[3045,2001,2002],{added:[2002]});
  const {race:first}=await writeTimes(page.request,token,code,[1200,1300,1400]);
  await submitRace(page.request,token,code);
  const second=await recordRace(page.request,token,code,[2001],[1250],[2001]);
  await count();
  await openDashboard(page);
  await toCheckItem(page,new RegExp(`${code}.*3045 is not a Girl Cubs number`)).click();
  const sheet=page.getByRole('dialog');await expect(sheet.getByRole('heading',{name:'Runner 3045',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('pending-warning-actions.png'),fullPage:true});
  for(const action of ['Disqualify','Mark checked','Correct number']) await expect(sheet.getByRole('button',{name:action,exact:true})).toBeVisible();
  await expect(sheet.getByRole('button',{name:'Disqualify for wrong section or age',exact:true})).toHaveCount(0);
  await sheet.getByRole('button',{name:'Disqualify',exact:true}).click();
  await expect(sheet.getByLabel('Reason',{exact:true}).getByRole('option')).toHaveText(['Choose a reason','Two false starts','Obstruction','Out of lane','Baton','Wrong section or age','Other']);
  await sheet.getByLabel('Reason',{exact:true}).selectOption('Other');await expect(sheet.getByLabel('Comment (optional)',{exact:true})).toHaveValue('');
  await sheet.getByRole('button',{name:'Save disqualification',exact:true}).click();await expect(sheet).toHaveCount(0);await agrees();
  await page.getByRole('button',{name:'Open Race 1',exact:true}).click();await page.getByRole('button',{name:'Runner 3045',exact:true}).click();await sheet.getByRole('button',{name:'Lift disqualification',exact:true}).click();await sheet.getByLabel('Comment',{exact:true}).fill('Wristband confirmed for review');await sheet.getByRole('button',{name:'Save lift',exact:true}).click();await expect(sheet).toHaveCount(0);await agrees();
  await back(page,'Dashboard');await toCheckItem(page,new RegExp(`${code}.*3045 is not a Girl Cubs number`)).click();await sheet.getByRole('button',{name:'Mark checked',exact:true}).click();await sheet.getByRole('button',{name:'Save check',exact:true}).click();await expect(sheet).toHaveCount(0);await menuCount();
  await toCheckItem(page,new RegExp(`${code}.*2002 crossed the line but was not checked in`)).click();
  await sheet.getByRole('button',{name:'Mark addition checked',exact:true}).click();await sheet.getByRole('button',{name:'Save check',exact:true}).click();await expect(sheet).toHaveCount(0);await menuCount();
  await toCheckItem(page,new RegExp(`${code}.*2001 has a result in more than one race`)).first().click();await sheet.getByRole('button',{name:'Choose which result counts',exact:true}).click();
  await expect(sheet.getByLabel('Count Race 2',{exact:true})).toBeVisible();await expect(sheet.getByText('Race 2 · 12.50',{exact:true})).toBeVisible();await sheet.getByLabel('Count Race 2',{exact:true}).check();await page.screenshot({path:info.outputPath('pending-duplicate-choice.png'),fullPage:true});await sheet.getByRole('button',{name:'Save counted result',exact:true}).click();await expect(sheet).toHaveCount(0);await menuCount();
  await dashboardMenuButton(page,'Results').click();await expect(page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)})).not.toContainText(/to check|needing you/i);
  await back(page,'Dashboard');await expect(page.getByRole('heading',{level:2,name:/zone lead|Nothing to check/})).toBeVisible();await expect(toCheckItem(page,new RegExp(`${code}.*more than one race`))).toHaveCount(0);await page.screenshot({path:info.outputPath('needs-you-cleared.png'),fullPage:true});
  for(const race of [first,second]) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
test('queue items open their race or tie directly and clear after the lead settles them',async({page},info)=>{
  const code=`NR-${run(info)}`,headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await page.request.post('/api/day/events',{headers,data:{code,name:`Queue race actions ${run(info)}`,section:'Girl Cubs',format:'timed',type:'races'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const races:any[]=[];
  const token=process.env.E2E_OWNER_TOKEN!;
  async function recorded(numbers:number[],places:number[]) {const race=await recordRace(page.request,token,code,numbers,places);races.push(race);return race;}
  await recorded([2001,2002],[1700,1600]);await recorded([2003],[1400]);await recorded([2004],[2000]);await recorded([2005],[2000]);
  await page.goto('/');await createProfile(page,`Race queue lead ${run(info)}`);await becomeLead(page);await openDashboard(page);
  const wrongTime=toCheckItem(page,new RegExp(`${code}.*A time looks wrong`)),tie=toCheckItem(page,new RegExp(`${code}.*Runners tied on time`));
  await expect(page.getByRole('list',{name:'To check'})).toBeVisible();await expect(wrongTime).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('needs-you-races.png'),fullPage:true});
  await wrongTime.click();await expect(page.getByRole('button',{name:'Correct times',exact:true})).toBeVisible();await page.getByRole('button',{name:'Correct times',exact:true}).click();const sheet=page.getByRole('dialog');await sheet.getByLabel('Accept these out-of-order times',{exact:true}).check();await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
  await back(page,'Dashboard');await expect(page.getByRole('heading',{level:2,name:/zone lead|Nothing to check/})).toBeVisible();await expect(wrongTime).toHaveCount(0);await expect(tie).toBeVisible();await tie.click();await expect(sheet.getByRole('heading',{name:'Tie at 20.00',exact:true})).toBeVisible();await sheet.getByRole('button',{name:'No run-off needed',exact:true}).click();await sheet.getByRole('button',{name:'Save tie',exact:true}).click();await expect(sheet).toHaveCount(0);
  await back(page,'Dashboard');await expect(page.getByRole('heading',{level:2,name:/zone lead|Nothing to check/})).toBeVisible();await expect(tie).toHaveCount(0);
  for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
