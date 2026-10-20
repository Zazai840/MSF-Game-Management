import { expect,createProfile,lookProblems,recordRace,test,type Page } from './fixtures.js';

const red='rgb(172, 48, 54)';

/** Serves the real Home read with the to-check count replaced, so the badge can be checked at known numbers. */
async function toCheckCount(page:Page,needsYou:number) {
  await page.unroute('**/api/home');
  await page.route('**/api/home',async route=>{
    const response=await route.fetch();const body=await response.json();
    if('needsYou' in body) body.needsYou=needsYou;
    await route.fulfill({response,json:body});
  });
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
}

test('Home lists events under distance headings in programme order, and a tile opens its race screen on the next heat',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Home sprint ${project}`,code=`HS-${project.toUpperCase()}`,off=`HO-${project.toUpperCase()}`,scoring={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  expect((await request.post('/api/day/events',{headers:scoring,data:{code,name,section:'Boy Scouts',format:'heats'}})).ok()).toBe(true);
  expect((await request.post('/api/day/events',{headers:scoring,data:{code:off,name,section:'Girl Scouts',format:'heats'}})).ok()).toBe(true);
  expect((await request.post(`/api/day/events/${off}/enabled`,{headers:scoring,data:{enabled:false}})).ok()).toBe(true);
  // Heat 1 is saved, so the event's current race is the next heat, not stored yet.
  await recordRace(request,process.env.E2E_SCORING_TOKEN!,code,[3001,3002],[1234,1301]);
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
  await expect(page.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();
  await expect(zoneLead).toHaveCount(0);
  await toCheckCount(page,2);
  const dashboard=page.getByRole('button',{name:'Dashboard 2 to check',exact:true});
  await expect(dashboard).toBeVisible();
  expect(await dashboard.getByText('2 to check',{exact:true}).evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(red);
  await page.screenshot({path:info.outputPath('home-lead.png'),fullPage:true});
  await toCheckCount(page,0);
  await expect(page.getByRole('button',{name:'Dashboard',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
});

