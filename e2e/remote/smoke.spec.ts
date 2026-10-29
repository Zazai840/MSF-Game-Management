import { test,expect,type Browser,type Page } from '@playwright/test';
import readExcelFile from 'read-excel-file/node';
import {back,enterTime,join,openLeadMenu,openRace,openRaceScreen,openRelays,openTeams,readRaceScreen,writeCheckIn,type JobName} from '../fixtures.js';
import { jobWords,type Job } from '../../src/shared/race-screen.js';
import type { RacesRead } from '../../src/shared/race-flow.js';

// Runs only under playwright.remote.config.ts, against a deployed test build whose day is shared with real testers:
// it adds phones, one race and one relay heat (two new teams) to the day and never clears it.
const baseURL=process.env.REMOTE_BASE_URL,ownerPassword=process.env.REMOTE_OWNER_PASSWORD;
test.skip(!baseURL || !ownerPassword,'Set REMOTE_BASE_URL and REMOTE_OWNER_PASSWORD to run the remote smoke check');

const run=Date.now().toString(36);
const token=(page:Page)=>page.evaluate(()=>localStorage.getItem('msf:token'));
// Another phone's entries must show within 3 s, the spec's allowance for the first update after a quiet spell on 3G.
const crossPhone={timeout:3000};
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
async function phone(browser:Browser,use:object) {
  const page=await (await browser.newContext(use)).newPage();
  await page.goto('/');
  return page;
}
/** The test build bar shows the deployed commit (never `unknown`) and the Report a bug link. */
async function expectDeployedCommitShown(page:Page) {
  const marker=page.getByText(/^Test build · /);
  await expect(marker).toBeVisible();
  expect(await marker.innerText(),'The test build shows commit unknown: RAILWAY_GIT_COMMIT_SHA is not set on the deployment').not.toBe('Test build · unknown');
  await expect(marker).toHaveText(/^Test build · [0-9a-f]{7}$/);
  await expect(page.getByRole('link',{name:'Report a bug',exact:true})).toBeVisible();
}
const orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
/**
 * Takes a job on a relay's race screen as a volunteer would. Opening the card takes it when it is the card's one free
 * job; with both columns free, Do the order or Do the times picks one. The day is shared and holds outlast a saved
 * race, so a tester or an earlier run may still hold the job: then it needs Take over.
 */
async function holdJob(page:Page,eventCode:string,job:Exclude<Job,'check-in'>) {
  const {holds}=await readRaceScreen(page.request,(await token(page))!,eventCode);
  await orderCard(page).click();
  if(holds[job]) {
    await page.getByRole('button',{name:`Take over ${jobWords[job]}`,exact:true}).click();
    await page.getByRole('button',{name:'Take over',exact:true}).click();
  } else if(!holds[job==='order'?'times':'order']) await page.getByRole('button',{name:`Do ${jobWords[job]}`,exact:true}).click();
  await expect(orderCard(page)).toHaveAccessibleName({order:/Order: You/,times:/Times: You/}[job]);
}

test('five phones share the test build: three work one race live until it saves itself, four work one relay heat, a mistyped code, 70 live writes and the export',async({browser},info)=>{
  test.setTimeout(360_000);
  const use={...info.project.use};
  // Owner: the owner password on Join signs in as the owner lead, starting the day on a fresh server.
  const owner=await phone(browser,use);
  await expectDeployedCommitShown(owner);
  await join(owner,`Smoke Owner ${run}`,{code:ownerPassword!});
  await races(owner);
  await openLeadMenu(owner,'Day setup');
  const ownerHeaders={authorization:`Bearer ${await token(owner)}`};
  const dayResponse=await owner.request.get('/api/day',{headers:ownerHeaders});
  expect(dayResponse.ok()).toBe(true);
  process.env.E2E_OLYMPICS_PASSWORD=(await dayResponse.json()).olympicsPassword;

  // A mistyped code on one phone does not block another phone (all phones here share one address, as in a school hall).
  const [starter,finisher,timer,mistyped]=await Promise.all([1,2,3,4].map(()=>phone(browser,use)));
  await join(mistyped,`Smoke Volunteer 4 ${run}`,{code:'wrong-olympics-password',job:'Start line'});
  await expect(mistyped.getByRole('alert')).toHaveText("That is not the Olympics password or today's lead code. Check with a lead and try again.");
  for(const [index,[page,job]] of ([[starter,'Start line'],[finisher,'Finish line'],[timer,'Timer'],[mistyped,'Start line']] as Array<[Page,JobName]>).entries()) {
    await join(page,`Smoke Volunteer ${index+1} ${run}`,{job});
    await races(page);
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
  const group=((await (await starter.request.get('/api/races',{headers:starterHeaders})).json()) as RacesRead).groups.find(item=>item.event.code==='R4');
  expect(group,'R4 (60m Girl Cubs) must be switched on').toBeTruthy();
  const name=group!.event.name,heat=`Heat ${group!.nextHeat}`,chip=`H${group!.nextHeat}`;

  // Three phones work one race: the start line makes the next heat with New race, the finish line and the timer open it
  // from Races, and each step shows on the other two live. Once every step is done the race saves itself.
  await starter.getByRole('button',{name:'New race',exact:true}).click();
  const newRace=starter.getByRole('dialog',{name:'New race'});
  await newRace.getByRole('button',{name,exact:true}).click();await newRace.getByRole('button',{name:'Girl Cubs R4',exact:true}).click();
  await newRace.getByRole('button',{name:`Create heat ${group!.nextHeat}`,exact:true}).click();
  await expect(starter.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();
  for(const page of [finisher,timer]) await openRace(page,name,'Girl Cubs',chip);
  const input=starter.getByLabel('Wristband number',{exact:true});
  for(const number of [first,second,third]) {await expect(input).toBeEditable();await input.fill(String(number));await input.press('Enter');}
  await expect(finisher.getByRole('list',{name:'Runners not yet placed'}).getByRole('button')).toHaveText([String(first),String(second),String(third)],crossPhone);
  await expect(timer.getByRole('list',{name:'Place times'}).getByRole('listitem')).toHaveCount(3,crossPhone);
  await starter.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(starter.locator('.rz-toast')).toContainText(`Runners saved · Girl Cubs ${heat}`);
  for(const [number,place] of [[second,'1st'],[third,'2nd'],[first,'3rd']] as const) await finisher.getByRole('button',{name:`${number} came ${place}`,exact:true}).click();
  await expect(timer.getByRole('tab',{name:/^Finishing order/})).toContainText('3 of 3',crossPhone);
  await finisher.getByRole('button',{name:'Save the order',exact:true}).click();
  for(const digits of ['1210','1250']) await enterTime(timer,digits);
  await expect(finisher.getByRole('article',{name:`${name} · Girl Cubs`})).toBeVisible();
  await enterTime(timer,'1320');
  await expect(timer.locator('.rz-toast')).toContainText(`Times saved · Girl Cubs ${heat}`);
  await expect.poll(async()=>((await (await owner.request.get('/api/races',{headers:ownerHeaders})).json()) as RacesRead).groups.find(item=>item.event.code==='R4')!.races.find(race=>race.number===group!.nextHeat && race.kind!=='final')?.state,crossPhone).toBe('saved');

  // 70 live writes from the start line (a busy hour's envelope) on the next race, each one accepted, while the finish line watches it live.
  const starterToken=(await token(starter))!;
  let {race}=await writeCheckIn(starter.request,starterToken,'R4',[loopA]);
  for(let write=1;write<70;write++) ({race}=await writeCheckIn(starter.request,starterToken,'R4',write%2?[loopA,loopB]:[loopA]));
  await openRace(finisher,name,'Girl Cubs',`H${race.number}`);
  await expect(finisher.getByRole('list',{name:'Runners not yet placed'}).getByRole('button')).toHaveText([String(loopA),String(loopB)],crossPhone);
  // The loop's race was never saved, so the owner deletes it and leaves only the smoke race on the day.
  expect((await owner.request.post(`/api/lead/races/${race.id}/delete`,{headers:ownerHeaders,data:{permanent:true}})).ok()).toBe(true);

  // One relay on top, R22 (4x50m Relay Girl Cubs), seeded by Start new day: two teams typed on the Teams screen on one
  // phone, checked in from two phones, the order on a third and the times on a fourth, then Submit Race by both holders.
  const relayName='4x50m Relay';
  const relayBefore=await readRaceScreen(starter.request,starterToken,'R22');
  expect(relayBefore.event.enabled,'R22 (4x50m Relay Girl Cubs) must be on the day and switched on').toBe(true);
  expect(relayBefore.race.kind,'R22 must still be running heats: a lead has completed its heats').toBe('heat');
  // Girl Cubs wristbands in no relay's team yet, so no leg needs Keep on a day earlier runs and testers have used.
  const inTeams=new Set([...relayBefore.teams!,...relayBefore.relays!.flatMap(other=>other.teams)].flatMap(team=>team.legs.map(leg=>leg.wristband)));
  const legs:number[]=[];
  while(legs.length<8) {
    const number=2000+Math.floor(Math.random()*1000);
    if(!inTeams.has(number) && !legs.includes(number)) legs.push(number);
  }
  const teamLegs=[legs.slice(0,4),legs.slice(4)];
  /** Back to Races from wherever the phone is: a race's back link, an older screen's back arrow, or there already. */
  const toRaces=async(page:Page)=>{
    if(await page.getByRole('navigation',{name:'Event type'}).isVisible()) return;
    const raceBack=page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true});
    if(await raceBack.isVisible()) await raceBack.click();else await back(page,'Races');
    await races(page);
  };
  const openRelay=async(page:Page)=>{await openRelays(page);await openRaceScreen(page,relayName);};
  const checkInTeams=(page:Page)=>page.getByRole('button',{name:/^Check-in Teams/});
  // The 4th phone watches Check-in Teams while the 1st types the teams on the Teams screen.
  await openRelay(mistyped);
  await checkInTeams(mistyped).click();
  for(const page of [starter,finisher,timer]) await toRaces(page);
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
  await toRaces(starter);
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
    const relayHeat=(await starter.locator('.race-line').innerText()).split(' · ')[0];
    await expect(mistyped.locator('.race-line')).toHaveText(`${relayHeat} · 2 teams`);
    // The order on the 2nd phone, by each team's 4th-leg button; the times on the 3rd. Each shows on the others live.
    const [finisherName,timerName]=[2,3].map(index=>`Smoke Volunteer ${index} ${run}`);
    const rows=(page:Page)=>page.getByRole('table',{name:'Order and times'}).getByRole('row');
    const dockSays=(page:Page,text:string)=>expect(page.getByRole('status').filter({hasText:text})).toHaveText(text,crossPhone);
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
    for(const page of [starter,mistyped,finisher,timer]) await expect(page.getByText(`${relayHeat} saved`,{exact:true})).toBeVisible(crossPhone);

    // The owner downloads the day export: the relay heat is in All results, one row per child with its team and leg (by place here).
    const download=owner.waitForEvent('download');
    await owner.getByRole('button',{name:'Download day export',exact:true}).click();
    expect((await download).suggestedFilename()).toMatch(/^msf-running-.*\.xlsx$/);
    const exportPath=info.outputPath('day-export.xlsx');
    await (await download).saveAs(exportPath);
    const allResults=(await readExcelFile(exportPath)).find(sheet=>sheet.sheet==='All results')!.data;
    expect(allResults[0].slice(3,9)).toEqual(['Race','Wristband number','Team','Leg','Time','Place in race']);
    expect(allResults.filter(row=>row[0]==='R22' && row[3]===relayHeat && legs.includes(row[4] as number)).map(row=>row.slice(4,9)).sort((x,y)=>Number(x[4])-Number(y[4]))).toEqual([
      ...legsB.map((wristband,leg)=>[wristband,`Team ${teamB}`,leg+1,15.2,1]),...legsA.map((wristband,leg)=>[wristband,`Team ${teamA}`,leg+1,16.1,2])
    ]);
    // The smoke race is there too, by its heat name.
    expect(allResults.filter(row=>row[0]==='R4' && row[3]===heat && [first,second,third].includes(row[4] as number))).toHaveLength(3);
  } finally {
    // A run that fails mid-heat deletes the heat it opened, so the next run's heat starts with no teams.
    const left=(await readRaceScreen(owner.request,(await token(owner))!,'R22')).race;
    if(relayRace && left.id===relayRace && left.state!=='saved') expect((await owner.request.post(`/api/lead/races/${relayRace}/delete`,{headers:ownerHeaders,data:{permanent:true}})).ok()).toBe(true);
  }
});
