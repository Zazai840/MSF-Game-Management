import { test,expect,type Browser,type Page } from '@playwright/test';
import { enterTime,enterWristband,jobButton,createProfile,openDashboard,pickRace,savedRaceLabel,typePassword } from '../fixtures.js';

// Runs only under playwright.remote.config.ts, against a deployed test build whose day is shared with real testers:
// it adds phones and one race to the day and never clears it.
const baseURL=process.env.REMOTE_BASE_URL,ownerPassword=process.env.REMOTE_OWNER_PASSWORD;
test.skip(!baseURL || !ownerPassword,'Set REMOTE_BASE_URL and REMOTE_OWNER_PASSWORD to run the remote smoke check');

const run=Date.now().toString(36);
const token=(page:Page)=>page.evaluate(()=>localStorage.getItem('msf:token'));
async function phone(browser:Browser,use:object) {
  const page=await (await browser.newContext(use)).newPage();
  await page.goto('/');
  return page;
}
/** The header shows the deployed commit (never `unknown`) and the Report a bug link. */
async function expectDeployedCommitShown(page:Page) {
  const marker=page.getByRole('banner').getByText(/^Test build · /);
  await expect(marker).toBeVisible();
  expect(await marker.innerText(),'The test build shows commit unknown: RAILWAY_GIT_COMMIT_SHA is not set on the deployment').not.toBe('Test build · unknown');
  await expect(marker).toHaveText(/^Test build · [0-9a-f]{7}$/);
  await expect(page.getByRole('banner').getByRole('link',{name:'Report a bug',exact:true})).toBeVisible();
}

test('five phones share the test build: one race end to end, a mistyped password, the export and 70 saves',async({browser},info)=>{
  test.setTimeout(240_000);
  const use={...info.project.use};
  // Owner: the owner password signs in as the scoring team, starting the day on a fresh server.
  const owner=await phone(browser,use);
  await expectDeployedCommitShown(owner);
  await typePassword(owner,ownerPassword!);
  await owner.getByLabel('Full name',{exact:true}).fill(`Smoke Owner ${run}`);
  await owner.getByRole('button',{name:/^(Sign in|Start the day and sign in)$/}).click();
  await expect(jobButton(owner,'Start line')).toBeVisible();
  await openDashboard(owner,'Day setup');
  const ownerHeaders={authorization:`Bearer ${await token(owner)}`};
  const dayResponse=await owner.request.get('/api/day',{headers:ownerHeaders});
  expect(dayResponse.ok()).toBe(true);
  process.env.E2E_OLYMPICS_PASSWORD=(await dayResponse.json()).olympicsPassword;

  // A mistyped password on one phone does not block another phone (all phones here share one address, as in a school hall).
  const [starter,finisher,timer,mistyped]=await Promise.all([1,2,3,4].map(()=>phone(browser,use)));
  await typePassword(mistyped,'wrong-olympics-password');
  await expect(mistyped.getByRole('alert')).toHaveText('That is not the Olympics password. Check with a lead and try again.');
  for(const [index,page] of [starter,finisher,timer,mistyped].entries()) {
    await createProfile(page,`Smoke Volunteer ${index+1} ${run}`);
    await expect(jobButton(page,'Start line')).toBeVisible();
    await expectDeployedCommitShown(page);
  }

  // Wristbands nobody has used in R4 yet, so the race raises no warnings on a day testers have already used.
  const starterHeaders={authorization:`Bearer ${await token(starter)}`};
  const fresh:number[]=[];
  while(fresh.length<5) {
    const number=2000+Math.floor(Math.random()*1000);
    if(fresh.includes(number)) continue;
    const check=await starter.request.post('/api/wristband-check',{headers:starterHeaders,data:{eventCode:'R4',wristband:number}});
    expect(check.ok(),await check.text()).toBe(true);
    if(!(await check.json()).warnings.length) fresh.push(number);
  }
  const [first,second,third,loopA,loopB]=fresh;
  const event=(await (await starter.request.get('/api/events',{headers:starterHeaders})).json()).events.find((item:{code:string})=>item.code==='R4');
  expect(event?.enabled,'R4 (60m Girl Cubs) must be switched on').toBe(true);

  // One race end to end: check-in, finishing order, times.
  await jobButton(starter,'Start line').click();
  await starter.getByRole('button',{name:event.name,exact:true}).click();
  await starter.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  for(const number of [first,second,third]) await enterWristband(starter,number);
  await starter.getByRole('button',{name:"That's everyone",exact:true}).click();
  await starter.getByRole('button',{name:'Save',exact:true}).click();
  const label=await savedRaceLabel(starter);
  await jobButton(finisher,'Finish order').click();
  await pickRace(finisher,'Finishing order',new RegExp(`\\(R4\\) · ${label}$`));
  for(const number of [second,third,first]) await finisher.getByRole('button',{name:String(number),exact:true}).click();
  await finisher.getByRole('button',{name:'Check the order',exact:true}).click();
  await finisher.getByRole('button',{name:'Save',exact:true}).click();
  expect(await savedRaceLabel(finisher)).toBe(label);
  await jobButton(timer,'Times').click();
  await pickRace(timer,'Times',new RegExp(`\\(R4\\) · ${label}$`));
  for(const digits of ['1210','1250','1320']) await enterTime(timer,digits);
  await timer.getByRole('button',{name:'Save',exact:true}).click();
  expect(await savedRaceLabel(timer)).toBe(label);

  // The owner downloads the day export.
  const download=owner.waitForEvent('download');
  await owner.getByRole('button',{name:'Download day export',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/^msf-running-.*\.xlsx$/);

  // 70 saves across the 5 phones (a busy hour's envelope): a check-in, then 69 runner-list changes, every one saved.
  const phones=await Promise.all([owner,starter,finisher,timer,mistyped].map(async page=>({page,headers:{authorization:`Bearer ${await token(page)}`}})));
  const statuses:string[]=[];
  const checkIn=await starter.request.post('/api/races/check-in',{headers:starterHeaders,data:{eventCode:'R4',runners:[loopA]}});
  statuses.push(`${checkIn.status()} ${(await checkIn.json()).status}`);
  let race=(await checkIn.json()).race;
  for(let save=1;save<70;save++) {
    const {page,headers}=phones[save%phones.length];
    const response=await page.request.post(`/api/races/${race.id}/runners`,{headers,data:{baseVersion:race.parts.runners.version,runners:save%2?[loopA,loopB]:[loopA]}});
    const body=await response.json();
    statuses.push(`${response.status()} ${body.status}`);
    if(body.race) race=body.race;
  }
  expect(statuses).toEqual(Array(70).fill('200 saved'));
  // The loop's race has no finishing order, so it can go again and leave only the smoke race on the day.
  expect((await starter.request.post(`/api/races/${race.id}/delete`,{headers:starterHeaders,data:{permanent:true}})).ok()).toBe(true);
});
