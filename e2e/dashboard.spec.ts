import { lookProblems,recordRace,back,toCheckItem,openDashboard,dashboardMenuButton,dashboardButton,becomeLead,expect,createProfile,test,type Page } from './fixtures.js';

const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
const menu=[
  ['Results','Standings for every event, heats and finals'],
  ['Day setup','Day and lead codes, phones, events and the day export']
] as const;
/** A timed event with one race whose 2nd place time is faster than 1st, so To check has an item. */
async function wrongTimeRace(page:Page,code:string) {
  await page.request.post('/api/day/events',{headers:headers(),data:{code,name:'Dashboard sprint',section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  return recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,[2001,2002],[1600,1305]);
}
const cleanUp=async(page:Page,races:{id:string}[])=>{for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:headers(),data:{permanent:true}});};

test('the Dashboard opens on To check, with Results above it and a back arrow to Home',async({page},info)=>{
  const code=`DB-${info.project.name.toUpperCase()}`,race=await wrongTimeRace(page,code);
  try {
    await page.goto('/');await createProfile(page,`Dashboard lead ${info.project.name}`);await becomeLead(page);
    await dashboardButton(page).click();
    await expect(page.getByRole('heading',{level:1,name:'Dashboard',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Back to Home',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Needs you'})).toHaveCount(0);
    await expect(page.getByRole('navigation',{name:'Lead tabs'})).toHaveCount(0);
    await expect(dashboardButton(page)).toHaveCount(0);
    for(const [title,line] of menu) await expect(dashboardMenuButton(page,title)).toContainText(line);
    const queue=await(await page.request.get('/api/lead',{headers:headers()})).json(),count=queue.needsYou.length+queue.profileRequests.length;
    expect(count).toBeGreaterThan(0);
    await expect(page.getByRole('heading',{level:2,name:`${count} ${count===1?'thing needs':'things need'} a zone lead`,exact:true})).toBeVisible();
    await expect(toCheckItem(page,new RegExp(code))).toBeVisible();
    await expect(dashboardMenuButton(page,'Results')).not.toContainText(/to check|\d/);
    expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('dashboard-menu.png'),fullPage:true});

    await dashboardMenuButton(page,'Results').click();
    await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Back to Dashboard',exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('dashboard-results.png'),fullPage:true});
    await back(page,'Dashboard');
    await expect(page.getByRole('heading',{level:1,name:'Dashboard',exact:true})).toBeVisible();
    await expect(toCheckItem(page,new RegExp(code))).toBeVisible();
    await back(page,'Home');
    await expect(page.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Back',exact:true})).toHaveCount(0);
  } finally {await cleanUp(page,[race]);}
});

test('Day setup shows for every lead and opens the Olympics password and lead code',async({page},info)=>{
  await page.goto('/');await createProfile(page,`Dashboard day setup ${info.project.name}`);await becomeLead(page);
  await openDashboard(page);
  for(const [title,line] of menu) await expect(dashboardMenuButton(page,title)).toContainText(line);
  await expect(dashboardMenuButton(page,'Day setup')).not.toContainText(/to check|\d/);
  await page.screenshot({path:info.outputPath('dashboard-menu-day-setup.png'),fullPage:true});
  await dashboardMenuButton(page,'Day setup').click();
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to Dashboard',exact:true})).toBeVisible();
  await expect(page.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  await expect(page.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
  await back(page,'Dashboard');
  await expect(dashboardMenuButton(page,'Day setup')).toBeVisible();
});

test('To check explains each problem in plain English, opens the race and confirms a saved ruling',async({page},info)=>{
  const code=`TC-${info.project.name.toUpperCase()}`,wrong=await wrongTimeRace(page,code);
  try {
    await page.goto('/');await createProfile(page,`To check lead ${info.project.name}`);await becomeLead(page);
    await openDashboard(page);
    const time=toCheckItem(page,new RegExp(`${code} · Dashboard sprint Girl Cubs · Race 1`));
    await expect(time).toContainText('A time looks wrong');
    await expect(time).toContainText('2nd place (13.05) is faster than 1st (16.00). The timer kept it as typed.');
    await expect(time).toContainText('Open race');
    await expect(page.getByText('Times out of order',{exact:true})).toHaveCount(0);
    expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('to-check.png'),fullPage:true});

    await time.click();
    await expect(page.getByRole('heading',{name:/^Race 1 · /})).toBeVisible();
    await page.getByRole('button',{name:'Correct times',exact:true}).click();
    const sheet=page.getByRole('dialog');await sheet.getByLabel('Accept these out-of-order times',{exact:true}).check();await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('status').filter({hasText:'Saved'})).toBeVisible();
    await page.screenshot({path:info.outputPath('to-check-saved.png'),fullPage:true});
    await back(page,'Dashboard');
    await expect(toCheckItem(page,new RegExp(`${code} · Dashboard sprint Girl Cubs · Race 1`))).toHaveCount(0);
  } finally {await cleanUp(page,[wrong]);}
});
