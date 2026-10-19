import { lookProblems,checkIn,recordFinishingOrder,recordTimes,recordRace,signInThroughApi,steps,trailBack,toCheckItem,openDashboard,dashboardMenuButton,dashboardButton,becomeLead,expect,createProfile,test,type Page } from './fixtures.js';

const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
const menu=[
  ['Results','Standings for every event, heats and finals'],
  ['Day setup','Day and lead codes, phones, events and the day export']
] as const;
/** The look a Dashboard menu button must share with a Home job button. */
async function buttonLook(button:ReturnType<Page['getByRole']>) {
  return {
    button:await button.evaluate(element=>{const style=getComputedStyle(element);return [style.borderRadius,style.padding,style.backgroundColor,style.borderTopColor,style.borderTopWidth,style.display];}),
    title:await button.locator('.job-title').evaluate(element=>{const style=getComputedStyle(element);return [style.fontSize,style.fontWeight,style.color];}),
    explanation:await button.locator('.job-explanation').evaluate(element=>{const style=getComputedStyle(element);return [style.fontSize,style.fontWeight,style.color];})
  };
}
/** A timed event with one race whose 2nd place time is faster than 1st, so To check has an item. */
async function wrongTimeRace(page:Page,code:string) {
  await page.request.post('/api/day/events',{headers:headers(),data:{code,name:'Dashboard sprint',section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  return recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,[2001,2002],[1600,1305]);
}
const cleanUp=async(page:Page,races:{id:string}[])=>{for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:headers(),data:{permanent:true}});};

test('the Dashboard opens on To check, with Results above it and a trail back to Home',async({page},info)=>{
  const code=`DB-${info.project.name.toUpperCase()}`,race=await wrongTimeRace(page,code);
  try {
    await page.goto('/');await createProfile(page,`Dashboard lead ${info.project.name}`);await becomeLead(page);
    const homeLook=await buttonLook(page.getByRole('button',{name:/^Enter times/}));
    await dashboardButton(page).click();
    await expect(page.getByRole('heading',{level:1,name:'Dashboard',exact:true})).toBeVisible();
    await expect(steps(page)).toHaveText(/^Home\s*›\s*Dashboard$/);
    await expect(page.getByRole('heading',{name:'Needs you'})).toHaveCount(0);
    await expect(page.getByRole('navigation',{name:'Lead tabs'})).toHaveCount(0);
    await expect(dashboardButton(page)).toHaveCount(0);
    for(const [title,line] of menu.slice(0,1)) await expect(dashboardMenuButton(page,title)).toContainText(line);
    await expect(dashboardMenuButton(page,'Day setup')).toHaveCount(0);
    const queue=await(await page.request.get('/api/lead',{headers:headers()})).json(),count=queue.needsYou.length+queue.profileRequests.length;
    expect(count).toBeGreaterThan(0);
    await expect(page.getByRole('heading',{level:2,name:`${count} ${count===1?'thing needs':'things need'} a zone lead`,exact:true})).toBeVisible();
    await expect(toCheckItem(page,new RegExp(code))).toBeVisible();
    await expect(dashboardMenuButton(page,'Results')).not.toContainText(/to check|\d/);
    expect(await buttonLook(dashboardMenuButton(page,'Results'))).toEqual(homeLook);
    expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('dashboard-menu.png'),fullPage:true});

    await dashboardMenuButton(page,'Results').click();
    await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
    await expect(steps(page)).toHaveText(/^Home\s*›\s*Dashboard\s*›\s*Results$/);
    await page.screenshot({path:info.outputPath('dashboard-results.png'),fullPage:true});
    await trailBack(page,'Dashboard');
    await expect(page.getByRole('heading',{level:1,name:'Dashboard',exact:true})).toBeVisible();
    await expect(toCheckItem(page,new RegExp(code))).toBeVisible();
    await trailBack(page,'Home');
    await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
    await expect(steps(page)).toHaveCount(0);
  } finally {await cleanUp(page,[race]);}
});

test('Day setup shows only for the scoring team and opens the Olympics password and lead code',async({page},info)=>{
  await page.goto('/');await createProfile(page,`Dashboard scoring ${info.project.name}`);await becomeLead(page,'e2e-owner-fixture');
  await openDashboard(page);
  for(const [title,line] of menu) await expect(dashboardMenuButton(page,title)).toContainText(line);
  await expect(dashboardMenuButton(page,'Day setup')).not.toContainText(/to check|\d/);
  await page.screenshot({path:info.outputPath('dashboard-menu-scoring.png'),fullPage:true});
  await dashboardMenuButton(page,'Day setup').click();
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expect(steps(page)).toHaveText(/^Home\s*›\s*Dashboard\s*›\s*Day setup$/);
  await expect(page.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  await expect(page.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
  await trailBack(page,'Dashboard');
  await expect(dashboardMenuButton(page,'Day setup')).toBeVisible();
});

test('To check explains each problem in plain English, opens the race and confirms a saved ruling',async({page},info)=>{
  const code=`TC-${info.project.name.toUpperCase()}`,wrong=await wrongTimeRace(page,code);
  const first=await signInThroughApi(page.request,`Yusuf ${info.project.name}`),second=await signInThroughApi(page.request,`Maryam ${info.project.name}`);
  const clash=await checkIn(page.request,process.env.E2E_SCORING_TOKEN!,code,[2003]);
  await recordFinishingOrder(page.request,process.env.E2E_SCORING_TOKEN!,clash,{order:[2003]});
  for(const [token,places] of [[first,[1400]],[second,[1500]]] as const) await recordTimes(page.request,token,clash,places);
  try {
    await page.goto('/');await createProfile(page,`To check lead ${info.project.name}`);await becomeLead(page);
    await openDashboard(page);
    const time=toCheckItem(page,new RegExp(`${code} · Dashboard sprint Girl Cubs · Race 1`));
    await expect(time).toContainText('A time looks wrong');
    await expect(time).toContainText('2nd place (13.05) is faster than 1st (16.00). The timer kept it as typed.');
    await expect(time).toContainText('Open race');
    const versions=toCheckItem(page,new RegExp(`${code} · Dashboard sprint Girl Cubs · Race 2`));
    await expect(versions).toContainText('Two different sets of times were saved');
    await expect(versions).toContainText(`Saved by Yusuf ${info.project.name} and Maryam ${info.project.name} less than a minute apart. Choose which one stands.`);
    await expect(versions).toContainText('Open race');
    await expect(page.getByText('Times out of order',{exact:true})).toHaveCount(0);
    await versions.scrollIntoViewIfNeeded();expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('to-check.png'),fullPage:true});

    await time.click();
    await expect(steps(page)).toContainText('Race 1');
    await page.getByRole('button',{name:'Correct times',exact:true}).click();
    const sheet=page.getByRole('dialog');await sheet.getByLabel('Accept these out-of-order times',{exact:true}).check();await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('status').filter({hasText:'Saved'})).toBeVisible();
    await page.screenshot({path:info.outputPath('to-check-saved.png'),fullPage:true});
    await trailBack(page,'Dashboard');
    await expect(toCheckItem(page,new RegExp(`${code} · Dashboard sprint Girl Cubs · Race 1`))).toHaveCount(0);
    await expect(versions).toBeVisible();
  } finally {await cleanUp(page,[wrong,clash]);}
});
