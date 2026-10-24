import { test,expect,type Browser,type Page } from '@playwright/test';
import readExcelFile from 'read-excel-file/node';
import { enterTime,enterWristband,createProfile,goHome,openDashboard,openRaceScreen,openTeams,readRaceScreen,typePassword,writeCheckIn } from '../fixtures.js';
import { jobWords,type Job } from '../../src/shared/race-screen.js';

// Runs only under playwright.remote.config.ts, against a deployed test build whose day is shared with real testers:
// it adds phones, one race and one relay heat (two new teams) to the day and never clears it.
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
 * Takes a job on the event's race screen as a volunteer would. Opening the card takes it when it is the card's one free job;
 * with both columns free, Do the order or Do the times picks one. The day is shared and holds outlast a saved race, so a
 * tester or an earlier run may still hold the job: then it needs Take over.
 */
async function holdJob(page:Page,eventCode:string,job:Job) {
  const {holds}=await readRaceScreen(page.request,(await token(page))!,eventCode);
  const card=job==='check-in'?checkInCard(page):orderCard(page);
  await card.click();
  if(holds[job]) {
    await page.getByRole('button',{name:`Take over ${jobWords[job]}`,exact:true}).click();
    await page.getByRole('button',{name:'Take over',exact:true}).click();
  } else if(job!=='check-in' && !holds[job==='order'?'times':'order']) await page.getByRole('button',{name:`Do ${jobWords[job]}`,exact:true}).click();
  await expect(card).toHaveAccessibleName({'check-in':/You are checking in/,order:/Order: You/,times:/Times: You/}[job]);
}

test('five phones share the test build: three work one race live to Submit Race, four work one relay heat, a mistyped password, 70 live writes and the export',async({browser},info)=>{
  test.setTimeout(360_000);
  const use={...info.project.use};
  // Owner: the owner password signs in as the owner lead, starting the day on a fresh server.
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
  await holdJob(starter,'R4','check-in');
  for(const number of [first,second,third]) await enterWristband(starter,number);
  for(const page of [finisher,timer]) await expect(checkInCard(page)).toHaveAccessibleName(`Check-in Wristbands ${starterName} is checking in · 3 in`,crossPhone);
  await holdJob(finisher,'R4','order');
  await expect(orderCard(timer)).toHaveAccessibleName(new RegExp(`^Order and Times Order: ${finisherName} · `),crossPhone);
  for(const number of [second,third,first]) await finisher.getByRole('button',{name:String(number),exact:true}).click();
  await holdJob(timer,'R4','times');
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

  // 70 live writes from the check-in holder (a busy hour's envelope) on the next race, each one accepted, while the three phones watch it live.
  const starterToken=(await token(starter))!;
  let {race}=await writeCheckIn(starter.request,starterToken,'R4',[loopA]);
  for(let write=1;write<70;write++) ({race}=await writeCheckIn(starter.request,starterToken,'R4',write%2?[loopA,loopB]:[loopA]));
  for(const page of [starter,finisher,timer]) await expect(page.locator('.race-line')).toHaveText(/ · 2 runners$/,crossPhone);
  // The loop's race was never submitted, so the owner deletes it and leaves only the smoke race on the day.
  expect((await owner.request.post(`/api/lead/races/${race.id}/delete`,{headers:ownerHeaders,data:{permanent:true}})).ok()).toBe(true);

  // One relay on top, R22 (4x50m Relay Girl Cubs), seeded by Start new day: two teams typed on the Teams screen on one
  // phone, checked in from two phones, the order on a third and the times on a fourth, then Submit Race by both holders.
  const relayName='4x50m Relay',relayEvent=(await (await starter.request.get('/api/events',{headers:starterHeaders})).json()).events.find((item:{code:string})=>item.code==='R22');
  expect(relayEvent?.enabled,'R22 (4x50m Relay Girl Cubs) must be on the day and switched on: run Start new day once the relays build is deployed').toBe(true);
  const relayBefore=await readRaceScreen(starter.request,starterToken,'R22');
  expect(relayBefore.race.kind,'R22 must still be running heats: a lead has completed its heats').toBe('heat');
  // Girl Cubs wristbands in no relay's team yet, so no leg needs Keep on a day earlier runs and testers have used.
  const inTeams=new Set([...relayBefore.teams!,...relayBefore.relays!.flatMap(other=>other.teams)].flatMap(team=>team.legs.map(leg=>leg.wristband)));
  const legs:number[]=[];
  while(legs.length<8) {
    const number=2000+Math.floor(Math.random()*1000);
    if(!inTeams.has(number) && !legs.includes(number)) legs.push(number);
  }
  const teamLegs=[legs.slice(0,4),legs.slice(4)];
  const openRelay=async(page:Page)=>{await page.getByRole('tab',{name:'Relays',exact:true}).click();await openRaceScreen(page,relayName);};
  const checkInTeams=(page:Page)=>page.getByRole('button',{name:/^Check-in Teams/});
  // The 4th phone watches Check-in Teams while the 1st types the teams on the Teams screen.
  await openRelay(mistyped);
  await checkInTeams(mistyped).click();
  for(const page of [starter,finisher,timer]) await goHome(page);
  await openTeams(starter);
  await starter.getByRole('region',{name:relayName,exact:true}).getByRole('button',{name:/^Girl Cubs/}).click();
  const addTeam=starter.getByRole('button',{name:'+ Add team',exact:true}),takeOverTeams=starter.getByRole('button',{name:'Take over the teams',exact:true});
  // An earlier run or a tester may still hold R22's teams: then it needs Take over.
  await expect(addTeam.or(takeOverTeams)).toBeVisible();
  if(await takeOverTeams.isVisible()) {
    await takeOverTeams.click();
    await starter.getByRole('button',{name:'Take over',exact:true}).click();
  }
  const teamNumbers:number[]=[];
  for(const team of teamLegs) {
    await addTeam.click();
    for(const [index,leg] of ['1st','2nd','3rd','4th'].entries()) await starter.getByLabel(`New team ${leg} leg`,{exact:true}).fill(String(team[index]));
    await starter.getByRole('button',{name:'Done',exact:true}).click();
    await expect(addTeam).toBeVisible();
    const {teams}=await readRaceScreen(starter.request,starterToken,'R22');
    const number=teams!.find(saved=>saved.legs[0].wristband===team[0])!.number;
    teamNumbers.push(number);
    await expect(mistyped.getByRole('button',{name:new RegExp(`^Team ${number} `)})).toContainText(team.join(' · '),crossPhone);
  }
  const [teamA,teamB]=teamNumbers,[legsA,legsB]=teamLegs;
  await goHome(starter);
  await openRelay(starter);
  await checkInTeams(starter).click();
  let relayRace:string|null=null;
  try {
    // Two phones check in a team each: tick it, then tap each child here. Both see all eight children here.
    const ticked=(page:Page,number:number)=>page.locator('.ci-team').filter({has:page.getByText(`Team ${number}`,{exact:true})});
    for(const [page,number] of [[starter,teamA],[mistyped,teamB]] as const) {
      await page.getByRole('button',{name:new RegExp(`^Team ${number} `)}).click();
      relayRace??=(await readRaceScreen(page.request,(await token(page))!,'R22')).race.id;
      for(const leg of ['1st','2nd','3rd','4th']) await ticked(page,number).getByRole('button',{name:new RegExp(`^${leg} `)}).click();
    }
    for(const page of [starter,mistyped]) await expect(checkInTeams(page)).toContainText('2 teams in · 8 of 8 here',crossPhone);
    const heat=(await starter.locator('.race-line').innerText()).split(' · ')[0];
    await expect(mistyped.locator('.race-line')).toHaveText(`${heat} · 2 teams`);
    // The order on the 2nd phone, by each team's 4th-leg button; the times on the 3rd. Each shows on the others live.
    for(const page of [finisher,timer]) await openRelay(page);
    await holdJob(finisher,'R22','order');
    await holdJob(timer,'R22','times');
    for(const page of [starter,mistyped]) {
      await orderCard(page).click();
      await expect(orderCard(page)).toHaveAccessibleName(`Order and Times Order: ${finisherName} · Times: ${timerName}`,crossPhone);
    }
    for(const [number,team] of [[teamB,legsB],[teamA,legsA]] as const) await finisher.locator('.race-numbers').getByRole('button',{name:new RegExp(`^${team[3]}\\s*Team ${number}$`)}).click();
    await expect(rows(timer)).toHaveText([/^Place\s*Team\s*Time$/,new RegExp(`^1st\\s*${legsB[3]}\\s*Team ${teamB}\\s*(Next)?$`),new RegExp(`^2nd\\s*${legsA[3]}\\s*Team ${teamA}\\s*$`)],crossPhone);
    for(const digits of ['1520','1610']) await enterTime(timer,digits);
    for(const page of [starter,mistyped,finisher]) await expect(rows(page)).toHaveText([/^Place/,new RegExp(`^1st\\s*${legsB[3]}\\s*Team ${teamB}\\s*15\\.20$`),new RegExp(`^2nd\\s*${legsA[3]}\\s*Team ${teamA}\\s*16\\.10$`)],crossPhone);
    // Only the two holders are asked: the check-in phones have no Submit Race.
    for(const page of [starter,mistyped]) await expect(page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
    await finisher.getByRole('button',{name:'Submit Race',exact:true}).click();
    await dockSays(timer,'Waiting on you');
    await dockSays(finisher,`You submitted. Waiting on ${timerName}`);
    await timer.getByRole('button',{name:'Submit Race',exact:true}).click();
    for(const page of [starter,mistyped,finisher,timer]) await expect(page.getByText(`${heat} saved`,{exact:true})).toBeVisible(crossPhone);

    // The owner downloads the day export: the relay heat is in All results, one row per child with its team and leg (by place here).
    const download=owner.waitForEvent('download');
    await owner.getByRole('button',{name:'Download day export',exact:true}).click();
    expect((await download).suggestedFilename()).toMatch(/^msf-running-.*\.xlsx$/);
    const exportPath=info.outputPath('day-export.xlsx');
    await (await download).saveAs(exportPath);
    const allResults=(await readExcelFile(exportPath)).find(sheet=>sheet.sheet==='All results')!.data;
    expect(allResults[0].slice(3,9)).toEqual(['Race','Wristband number','Team','Leg','Time','Place in race']);
    expect(allResults.filter(row=>row[0]==='R22' && row[3]===heat && legs.includes(row[4] as number)).map(row=>row.slice(4,9)).sort((x,y)=>Number(x[4])-Number(y[4]))).toEqual([
      ...legsB.map((wristband,leg)=>[wristband,`Team ${teamB}`,leg+1,15.2,1]),...legsA.map((wristband,leg)=>[wristband,`Team ${teamA}`,leg+1,16.1,2])
    ]);
  } finally {
    // A run that fails mid-heat deletes the heat it opened, so the next run's heat starts with no teams.
    const left=(await readRaceScreen(owner.request,(await token(owner))!,'R22')).race;
    if(relayRace && left.id===relayRace && left.state!=='saved') expect((await owner.request.post(`/api/lead/races/${relayRace}/delete`,{headers:ownerHeaders,data:{permanent:true}})).ok()).toBe(true);
  }
});
