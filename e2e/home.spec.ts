import { expect,createProfile,lookProblems,test,type Page } from './fixtures.js';

const navy='rgb(27, 42, 81)',red='rgb(172, 48, 54)';
const jobs=[
  ['Check in runners',"Type each runner's wristband number before the race starts"],
  ['Record the finishing order','Tap runners in the order they crossed the line'],
  ['Enter times',"Type each place's time from the timer"]
] as const;

/** Serves the real Home read with the waiting and to-check counts replaced, so badges can be checked at known numbers. */
async function homeCounts(page:Page,counts:{start:number;finish:number;times:number;needsYou?:number}) {
  await page.unroute('**/api/home');
  await page.route('**/api/home',async route=>{
    const response=await route.fetch();const body=await response.json();
    body.waiting={'Start line':counts.start,'Finish order':counts.finish,Times:counts.times};
    if('needsYou' in body) body.needsYou=counts.needsYou??0;
    await route.fulfill({response,json:body});
  });
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
}

test('Home lists events under distance headings in programme order, and a tile opens its race screen on the next heat',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Home sprint ${project}`,code=`HS-${project.toUpperCase()}`,off=`HO-${project.toUpperCase()}`,scoring={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  expect((await request.post('/api/day/events',{headers:scoring,data:{code,name,section:'Boy Scouts',format:'heats'}})).ok()).toBe(true);
  expect((await request.post('/api/day/events',{headers:scoring,data:{code:off,name,section:'Girl Scouts',format:'heats'}})).ok()).toBe(true);
  expect((await request.post(`/api/day/events/${off}/enabled`,{headers:scoring,data:{enabled:false}})).ok()).toBe(true);
  // Heat 1 is recorded in full, so it counts and the event's current race is the next heat, not stored yet.
  const race=(await (await request.post('/api/races/check-in',{headers:scoring,data:{eventCode:code,runners:[3001,3002]}})).json()).race;
  await request.post(`/api/races/${race.id}/finish`,{headers:scoring,data:{baseVersion:0,runnersVersion:1,order:[3002,3001],didNotFinish:[],didNotRun:[],added:[]}});
  await request.post(`/api/races/${race.id}/times`,{headers:scoring,data:{baseVersion:0,places:[1234,1301]}});
  const {page}=await openPhone(`Home picker ${project}`);
  const distances=['60m','60m Hurdles','200m','400m'];
  expect((await page.getByRole('main').getByRole('heading',{level:2}).allInnerTexts()).filter(heading=>distances.includes(heading))).toEqual(distances);
  await expect(page.getByRole('region',{name:'60m',exact:true}).getByRole('button')).toHaveCount(6);
  await expect(page.getByRole('region',{name:'60m Hurdles',exact:true}).getByRole('button')).toHaveCount(6);
  await expect(page.getByRole('region',{name:'400m',exact:true}).getByRole('button')).toHaveText([/^Boy Scouts/,/^Girl Scouts/]);
  const mine=page.getByRole('region',{name,exact:true}).getByRole('button');
  // The switched-off Girl Scouts event is not listed.
  await expect(mine).toHaveCount(1);
  await expect(mine).toHaveAccessibleName(`${name} Boy Scouts · Heat 2`);
  await expect(mine).toHaveText('Boy ScoutsHeat 2');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('home-events.png'),fullPage:true});
  await mine.click();
  await expect(page.getByRole('heading',{level:1,name:`${name} Boy Scouts`,exact:true})).toBeVisible();
  await expect(page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Home',exact:true})).toHaveCount(0);
  for(const card of [/^Check-in Wristbands/,/^Order and Times/]) {
    const toggle=page.getByRole('button',{name:card});
    await expect(toggle).toHaveAttribute('aria-expanded','false');
    await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
  }
  await expect(page.getByText('No runners checked in yet',{exact:true})).toBeVisible();
  await expect(page.getByText('Places appear here once runners are checked in',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('race-screen-next-heat.png'),fullPage:true});
  await page.getByRole('button',{name:/^Order and Times/}).click();
  await expect(page.getByText('Places appear here once runners are checked in',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Back to Home',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
});

test('Home says what each job is and shows race counts only when there is work',async({page},info)=>{
  await page.goto('/');await createProfile(page,`Home volunteer ${info.project.name}`);
  await expect(page.getByRole('heading',{level:2,name:"What's your job for this race?"})).toBeVisible();
  await expect(page.getByRole('heading',{name:'What are you doing?'})).toHaveCount(0);
  for(const [title,line] of jobs) {
    const job=page.getByRole('button',{name:new RegExp(`^${title}`)});
    await expect(job).toBeVisible();await expect(job).toContainText(line);
  }
  await expect(page.getByRole('button',{name:/waiting/})).toHaveCount(0);
  await homeCounts(page,{start:3,finish:1,times:2});
  const finish=page.getByRole('button',{name:/^Record the finishing order/}),times=page.getByRole('button',{name:/^Enter times/});
  await expect(finish.getByText('1 race ready',{exact:true})).toBeVisible();
  await expect(times.getByText('2 races ready',{exact:true})).toBeVisible();
  expect(await finish.getByText('1 race ready').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  await expect(page.getByRole('button',{name:/^Check in runners/})).not.toContainText(/\d/);
  await page.screenshot({path:info.outputPath('home-volunteer-counts.png'),fullPage:true});
  await homeCounts(page,{start:3,finish:0,times:0});
  await expect(finish).not.toContainText('ready');await expect(times).not.toContainText('ready');
  await expect(page.getByText(/^Updated at \d\d:\d\d$/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Home',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/^Enter times/}).click();
  await expect(page.getByRole('heading',{name:'Times',exact:true})).toBeVisible();
});

test("a volunteer taps I'm a zone lead, gives the lead code and then sees the Dashboard with its to-check badge",async({page},info)=>{
  await page.goto('/');await createProfile(page,`Home lead ${info.project.name}`);
  const zoneLead=page.getByRole('button',{name:"I'm a zone lead",exact:true});
  await expect(zoneLead).toBeVisible();
  await expect(page.getByRole('button',{name:'Become lead',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('home-volunteer.png'),fullPage:true});
  await zoneLead.click();
  await expect(page.getByLabel('Lead code or owner password')).toBeVisible();await expect(zoneLead).toHaveCount(0);
  await page.getByLabel('Lead code or owner password').fill(process.env.E2E_LEAD_CODE!);
  await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  await expect(zoneLead).toHaveCount(0);
  await homeCounts(page,{start:0,finish:1,times:0,needsYou:2});
  const dashboard=page.getByRole('button',{name:'Dashboard 2 to check',exact:true});
  await expect(dashboard).toBeVisible();
  expect(await dashboard.getByText('2 to check',{exact:true}).evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(red);
  await page.screenshot({path:info.outputPath('home-lead.png'),fullPage:true});
  await homeCounts(page,{start:0,finish:0,times:0,needsYou:0});
  await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
});

