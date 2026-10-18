import { goHome,timesOpened,trailBack,openDashboard,dashboardMenuButton,jobButton,dashboardButton,becomeLead,lookProblems,typePassword,expect,createProfile,test,type Locator,type Page } from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
/** Docked buttons sit at the bottom of the phone screen, as on the job screens. */
async function expectDocked(page:Page,button:Locator) {
  const box=(await button.boundingBox())!,height=page.viewportSize()!.height;
  expect(height-(box.y+box.height)).toBeLessThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(50);
}
/** Name inputs are large for outdoor use: 20px text, 56px tall. */
async function expectLargeInput(input:Locator) {
  expect(await input.evaluate(element=>getComputedStyle(element).fontSize)).toBe('20px');
  expect(Math.round((await input.boundingBox())!.height)).toBe(56);
}
test('a new phone types the Olympics password once, creates a profile, stays signed in and taps its name to sign in again',async({page},info)=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator.storage,'persist',{value:()=>{localStorage.setItem('e2e:persist','asked');return Promise.resolve(false);}});});
  const downloaded:string[]=[];
  page.on('request',request=>{if(request.url().endsWith('.js')) downloaded.push(request.url());});
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible();
  await expect(page.getByText('Type the Olympics password. You only need it once on this phone.',{exact:true})).toBeVisible();
  await expectDocked(page,page.getByRole('button',{name:'Continue',exact:true}));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('password.png')});
  await typePassword(page,'wrong-fixture');
  await expect(page.getByRole('alert')).toHaveText('That is not the Olympics password. Check with a lead and try again.');
  await typePassword(page);
  await expect(page.getByRole('heading',{level:1,name:"Who's using this phone?"})).toBeVisible();
  await expect(page.getByRole('button',{name:'New here? Create profile'})).toHaveAttribute('aria-expanded','true');
  await expectLargeInput(page.getByLabel('Full name'));
  await expectDocked(page,page.getByRole('button',{name:'Create profile',exact:true}));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('create-profile.png')});
  const name=`Ahmed Sign ${info.project.name}`;
  await page.getByLabel('Full name').fill(`  Ahmed   Sign ${info.project.name} `);
  await page.getByRole('button',{name:'Create profile',exact:true}).click();
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  await expect(page.getByRole('banner').getByText(name,{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('e2e:persist'))).toBe('asked');
  await page.reload();
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  await jobButton(page,'Times').click();
  await timesOpened(page);
  await goHome(page);
  expect(downloaded.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(false);
  // The session ends (as after a new day) but the phone keeps its Olympics password and profile.
  await page.evaluate(()=>localStorage.removeItem('msf:token'));await page.reload();
  await expect(page.getByRole('heading',{level:1,name:"Who's using this phone?"})).toBeVisible();
  await expect(page.getByText('Tap your name.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'New here? Create profile'})).toHaveAttribute('aria-expanded','false');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('profiles.png')});
  await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  await becomeLead(page);
  await expect(dashboardButton(page)).toBeVisible();
  await openDashboard(page,'Results');
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  await trailBack(page,'Dashboard');await expect(dashboardMenuButton(page,'Day setup')).toHaveCount(0);
  expect(downloaded.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(true);
});
test('Create profile refuses a name already taken, keeping what was typed',async({page,browser},info)=>{
  const name=`Amina Taken ${info.project.name}`;
  await page.goto('/');await createProfile(page,name);
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  const second=await browser.newContext({...info.project.use});
  try {
    const other=await second.newPage();await other.goto('/');await createProfile(other,name.toLowerCase());
    await expect(other.getByRole('alert')).toHaveText(`${name} already has a profile. If that's you, tap That's me and show a lead. If not, add your middle name or initial.`);
    await expect(other.getByLabel('Full name')).toHaveValue(name.toLowerCase());
    expect(await lookProblems(other)).toEqual([]);
    await other.screenshot({path:info.outputPath('create-profile-taken.png')});
  } finally {await second.close();}
});
test('the owner password signs in as the scoring team on the running day without touching it',async({page},info)=>{
  const before=await (await page.request.get('/api/day',{headers:headers()})).json();
  await page.goto('/');await typePassword(page,'e2e-owner-fixture');
  await expect(page.getByRole('heading',{level:1,name:"What's your full name?"})).toBeVisible();
  await expect(page.getByText("You'll sign in as the scoring team.",{exact:true})).toBeVisible();
  await expect(page.getByText("No Olympics day is running. Signing in starts today's day.",{exact:true})).toHaveCount(0);
  await expectLargeInput(page.getByLabel('Full name'));
  await expectDocked(page,page.getByRole('button',{name:'Sign in',exact:true}));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('owner.png')});
  await page.getByLabel('Full name').fill(`Owner Sign ${info.project.name}`);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await openDashboard(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  const after=await (await page.request.get('/api/day',{headers:headers()})).json();
  expect(after).toMatchObject({leadCode:before.leadCode,olympicsPassword:before.olympicsPassword,revision:expect.any(Number)});
  await page.reload();await expect(dashboardButton(page)).toBeVisible();
});
test('with no day running the owner screen says signing in starts the day',async({page},info)=>{
  await page.route('**/api/password',route=>route.fulfill({json:{kind:'owner',dayRunning:false}}));
  await page.goto('/');await typePassword(page,'e2e-owner-fixture');
  await expect(page.getByText("No Olympics day is running. Signing in starts today's day.",{exact:true})).toBeVisible();
  await expectDocked(page,page.getByRole('button',{name:'Start the day and sign in',exact:true}));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('owner-first-day.png')});
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible();
});
test('an old phone explains that another phone is needed', async ({browser}) => {
  const context = await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 Version/14.1 Mobile/15E148 Safari/604.1'});
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText("This phone's browser is too old, please use another phone")).toBeVisible();
  await context.close();
});
