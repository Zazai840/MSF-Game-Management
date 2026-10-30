import { test,expect,type Browser,type Page } from '@playwright/test';
import readExcelFile from 'read-excel-file/node';
import {back,enterTime,join,openLeadMenu,openRace,openRelays,writeCheckIn,type JobName} from '../fixtures.js';
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
  await expect(mistyped.getByRole('alert')).toHaveText("That password isn't right. Check it with a lead and try again.");
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
  await newRace.getByRole('button',{name,exact:true}).click();await newRace.getByRole('button',{name:'Girl Cubs',exact:true}).click();
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

  // One relay on top, R22 (4x50m Relay Girl Cubs), seeded by Start new day, worked in the race flow like any race: two
  // teams typed in its teams sheet on one phone while another watches, then one heat checked in from two phones, placed
  // on a third and timed on a fourth, saving itself.
  const relayName='4x50m Relay',relaySection='Girl Cubs';
  const relayGroups=async(page:Page)=>((await (await page.request.get('/api/races',{headers:{authorization:`Bearer ${await token(page)}`}})).json()) as RacesRead).groups;
  const relayGroup=async(page:Page)=>(await relayGroups(page)).find(item=>item.event.code==='R22');
  const relayBefore=await relayGroup(starter);
  expect(relayBefore,'R22 (4x50m Relay Girl Cubs) must be on the day and switched on').toBeTruthy();
  expect(relayBefore!.heatsOpen,'R22 must still be running heats: a lead has completed its heats').toBe(true);
  // Girl Cubs wristbands in no relay's team yet, so no leg needs Keep on a day earlier runs and testers have used.
  const inTeams=new Set((await relayGroups(starter)).flatMap(item=>item.teams||[]).flatMap(team=>team.legs.map(leg=>leg.wristband)));
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
  const sheet=(page:Page,title:string|RegExp)=>page.getByRole('dialog',{name:title});
  const teamsSheet=(page:Page)=>sheet(page,`${relayName} · ${relaySection}`);
  const teamCards=(page:Page)=>page.getByRole('list',{name:'Teams',exact:true}).getByRole('listitem');
  const legsText=(team:number[])=>['1st','2nd','3rd','4th'].map((leg,index)=>`${leg}${team[index]}`).join('');
  for(const page of [starter,finisher,timer,mistyped]) {await toRaces(page);await openRelays(page);}
  // The first team from New team at the foot of Relays, which asks which relay first; the second from the teams sheet.
  await starter.locator('footer').getByRole('button',{name:'New team',exact:true}).click();
  const which=sheet(starter,'New team');
  await which.getByRole('button',{name:relayName,exact:true}).click();
  await which.getByRole('button',{name:new RegExp(`^${relaySection}`)}).click();
  await which.getByRole('button',{name:'Type a new team',exact:true}).click();
  const teamNumbers:number[]=[];
  for(const [index,team] of teamLegs.entries()) {
    if(index) await teamsSheet(starter).getByRole('button',{name:'New team',exact:true}).click();
    const typing=sheet(starter,/^New team \d+$/);
    for(const [leg,label] of ['1st','2nd','3rd','4th'].entries()) await typing.getByLabel(`${label} leg`,{exact:true}).fill(String(team[leg]));
    await typing.getByRole('button',{name:/^Save team \d+$/}).click();
    await expect(teamCards(starter).filter({hasText:legsText(team)})).toHaveCount(1);
    teamNumbers.push((await relayGroup(starter))!.teams!.find(saved=>saved.legs[0].wristband===team[0])!.number);
    // The 4th phone watches the relay's teams sheet: each team shows there as it is saved.
    if(!index) await mistyped.getByRole('article',{name:`${relayName} · ${relaySection}`,exact:true}).getByRole('button',{name:/^Teams \d/}).click();
    await expect(teamCards(mistyped).filter({hasText:legsText(team)})).toHaveCount(1,crossPhone);
  }
  const [teamA,teamB]=teamNumbers,[legsA,legsB]=teamLegs;
  for(const page of [starter,mistyped]) await teamsSheet(page).getByRole('button',{name:'Close',exact:true}).click();
  // New relay makes the next heat; the other three open it from its card.
  const relayHeatNumber=(await relayGroup(starter))!.nextHeat,relayHeat=`Heat ${relayHeatNumber}`;
  await starter.locator('footer').getByRole('button',{name:'New relay',exact:true}).click();
  const newRelay=sheet(starter,'New relay');
  await newRelay.getByRole('button',{name:relayName,exact:true}).click();
  await newRelay.getByRole('button',{name:new RegExp(`^${relaySection}`)}).click();
  await newRelay.getByRole('button',{name:`Create heat ${relayHeatNumber}`,exact:true}).click();
  await expect(starter.getByRole('heading',{level:1,name:`${relayName} · ${relaySection}`})).toBeVisible();
  const relayRace=(await relayGroup(starter))!.races.find(race=>race.kind==='heat' && race.number===relayHeatNumber)!.id;
  try {
    for(const page of [mistyped,finisher,timer]) await openRace(page,relayName,relaySection,`H${relayHeatNumber}`);
    // Two start-line phones add a team each and tap each child here; both see all eight children here.
    const meta=(page:Page)=>page.locator('.rz-prompt__meta');
    for(const [page,number,team] of [[starter,teamA,legsA],[mistyped,teamB,legsB]] as const) {
      await page.getByRole('list',{name:'Still to run'}).getByRole('button',{name:`Add Team ${number}`,exact:true}).click();
      for(const wristband of team) await page.getByRole('button',{name:`${wristband}: Here`,exact:true}).click();
    }
    for(const page of [starter,mistyped]) await expect(meta(page)).toHaveText(`${relayHeat} · 2 teams · 8 children here`,crossPhone);
    await starter.getByRole('button',{name:"That's everyone",exact:true}).click();
    await expect(starter.locator('.rz-toast')).toContainText(`Runners saved · ${relaySection} ${relayHeat}`);
    // The finish line taps each team's tile as its 4th leg crosses; the timer types one time per team, and the last saves the heat.
    await finisher.getByRole('button',{name:`Team ${teamB}, 4th leg ${legsB[3]}, came 1st`,exact:true}).click();
    await finisher.getByRole('button',{name:`Team ${teamA}, 4th leg ${legsA[3]}, came 2nd`,exact:true}).click();
    await finisher.getByRole('button',{name:'Save the order',exact:true}).click();
    await expect(finisher.locator('.rz-toast')).toContainText('Finishing order saved');
    await expect(timer.getByRole('list',{name:'Place times'}).getByRole('listitem')).toHaveCount(2,crossPhone);
    for(const digits of ['1520','1610']) await enterTime(timer,digits);
    await expect(timer.locator('.rz-toast')).toContainText(`Times saved · ${relaySection} ${relayHeat}`);
    await expect.poll(async()=>(await relayGroup(owner))!.races.find(race=>race.id===relayRace)?.state,crossPhone).toBe('saved');

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
    const left=(await relayGroups(owner)).find(item=>item.event.code==='R22')!.races.find(race=>race.id===relayRace);
    if(left && left.state!=='saved') expect((await owner.request.post(`/api/lead/races/${relayRace}/delete`,{headers:ownerHeaders,data:{permanent:true}})).ok()).toBe(true);
  }
});
