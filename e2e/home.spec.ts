import { expect,createProfile,test,type Page } from './fixtures.js';

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

test('Home says what each job is and shows race counts only when there is work',async({page},info)=>{
  await page.goto('/');await createProfile(page,`Home volunteer ${info.project.name}`);
  await expect(page.getByRole('heading',{level:1,name:"What's your job for this race?"})).toBeVisible();
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

