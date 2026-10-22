import { test,expect,type Browser,type Page } from '@playwright/test';
import { enterTime,enterWristband,createProfile,openDashboard,openRaceScreen,readRaceScreen,typePassword,writeCheckIn } from '../fixtures.js';
import { jobWords,type Job } from '../../src/shared/race-screen.js';

// Runs only under playwright.remote.config.ts, against a deployed test build whose day is shared with real testers:
// it adds phones and one race to the day and never clears it.
const baseURL=process.env.REMOTE_BASE_URL,ownerPassword=process.env.REMOTE_OWNER_PASSWORD;
test.skip(!baseURL || !ownerPassword,'Set REMOTE_BASE_URL and REMOTE_OWNER_PASSWORD to run the remote smoke check');

const run=Date.now().toString(36);
const token=(page:Page)=>page.evaluate(()=>localStorage.getItem('msf:token'));
// Another phone's entries must show within 3 s, the spec's allowance for the first update after a quiet spell on 3G.
const crossPhone={timeout:3000};
const home=(page:Page)=>expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
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
const checkInCard=(page:Page)=>page.getByRole('button',{name:/^Check-in Wristbands/}),orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
/**
 * Takes an R4 job on the race screen as a volunteer would. Opening the card takes it when it is the card's one free job;
 * with both columns free, Do the order or Do the times picks one. The day is shared and holds outlast a saved race, so a
 * tester or an earlier run may still hold the job: then it needs Take over.
 */
async function holdJob(page:Page,job:Job) {
  const {holds}=await readRaceScreen(page.request,(await token(page))!,'R4');
  const card=job==='check-in'?checkInCard(page):orderCard(page);
  await card.click();
  if(holds[job]) {
    await page.getByRole('button',{name:`Take over ${jobWords[job]}`,exact:true}).click();
    await page.getByRole('button',{name:'Take over',exact:true}).click();
  } else if(job!=='check-in' && !holds[job==='order'?'times':'order']) await page.getByRole('button',{name:`Do ${jobWords[job]}`,exact:true}).click();
  await expect(card).toHaveAccessibleName({'check-in':/You are checking in/,order:/Order: You/,times:/Times: You/}[job]);
}

test('five phones share the test build: three work one race live to Submit Race, a mistyped password, the export and 70 live writes',async({browser},info)=>{
  test.setTimeout(240_000);
  const use={...info.project.use};
  // Owner: the owner password signs in as the scoring team, starting the day on a fresh server.
  const owner=await phone(browser,use);
  await expectDeployedCommitShown(owner);
  await typePassword(owner,ownerPassword!);
  await owner.getByLabel('Full name',{exact:true}).fill(`Smoke Owner ${run}`);
  await owner.getByRole('button',{name:/^(Sign in|Start the day and sign in)$/}).click();
  await home(owner);
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
    await home(page);
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

  // Three phones work one race on the race screen: check-in on one, the order on another, the times on the third, then Submit Race by all three.
  // Each phone's entries show on the other two live.
  const [starterName,finisherName,timerName]=[1,2,3].map(index=>`Smoke Volunteer ${index} ${run}`);
  const rows=(page:Page)=>page.getByRole('table',{name:'Order and times'}).getByRole('row');
  const dockSays=(page:Page,text:string)=>expect(page.getByRole('status').filter({hasText:text})).toHaveText(text,crossPhone);
  for(const page of [starter,finisher,timer]) await openRaceScreen(page,event.name);
  const label=(await starter.locator('.race-line').innerText()).split(' · ')[0];
  await holdJob(starter,'check-in');
  for(const number of [first,second,third]) await enterWristband(starter,number);
  for(const page of [finisher,timer]) await expect(checkInCard(page)).toHaveAccessibleName(`Check-in Wristbands ${starterName} is checking in · 3 in`,crossPhone);
  await holdJob(finisher,'order');
  await expect(orderCard(timer)).toHaveAccessibleName(new RegExp(`^Order and Times Order: ${finisherName} · `),crossPhone);
  for(const number of [second,third,first]) await finisher.getByRole('button',{name:String(number),exact:true}).click();
  await holdJob(timer,'times');
  await expect(rows(timer)).toHaveText([/^Place/,new RegExp(`^1st\\s*${second}`),new RegExp(`^2nd\\s*${third}`),new RegExp(`^3rd\\s*${first}`)],crossPhone);
  await orderCard(starter).click();
  await expect(orderCard(starter)).toHaveAccessibleName(`Order and Times Order: ${finisherName} · Times: ${timerName}`,crossPhone);
  for(const digits of ['1210','1250','1320']) await enterTime(timer,digits);
  for(const page of [starter,finisher]) await expect(rows(page)).toHaveText([/^Place/,new RegExp(`^1st\\s*${second}\\s*12\\.10$`),new RegExp(`^2nd\\s*${third}\\s*12\\.50$`),new RegExp(`^3rd\\s*${first}\\s*13\\.20$`)],crossPhone);
  for(const page of [starter,finisher]) await page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await dockSays(timer,'Waiting on you');
  for(const page of [starter,finisher]) await dockSays(page,`You submitted. Waiting on ${timerName}`);
  await timer.getByRole('button',{name:'Submit Race',exact:true}).click();
  for(const page of [starter,finisher,timer]) await expect(page.getByText(`${label} saved`,{exact:true})).toBeVisible(crossPhone);

  // The owner downloads the day export.
  const download=owner.waitForEvent('download');
  await owner.getByRole('button',{name:'Download day export',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/^msf-running-.*\.xlsx$/);

  // 70 live writes from the check-in holder (a busy hour's envelope) on the next race, each one accepted, while the three phones watch it live.
  const starterToken=(await token(starter))!;
  let {race}=await writeCheckIn(starter.request,starterToken,'R4',[loopA]);
  for(let write=1;write<70;write++) ({race}=await writeCheckIn(starter.request,starterToken,'R4',write%2?[loopA,loopB]:[loopA]));
  for(const page of [starter,finisher,timer]) await expect(page.locator('.race-line')).toHaveText(/ · 2 runners$/,crossPhone);
  // The loop's race was never submitted, so the owner deletes it and leaves only the smoke race on the day.
  expect((await owner.request.post(`/api/lead/races/${race.id}/delete`,{headers:ownerHeaders,data:{permanent:true}})).ok()).toBe(true);
});
