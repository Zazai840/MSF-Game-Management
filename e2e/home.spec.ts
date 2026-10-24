import { expect,createProfile,deleteCurrentRace,live,lookProblems,openRaceScreen,ownEvent,ownRelay,recordRace,signInThroughApi,submitRace,takeJob,test,writeCheckIn,writeOrder,writeTimes,type Locator,type Page } from './fixtures.js';

const red='rgb(172, 48, 54)',navy='rgb(27, 42, 81)',tint='rgb(220, 227, 239)';

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
  const project=info.project.name,name=`Home sprint ${project}`,code=`HS-${project.toUpperCase()}`,off=`HO-${project.toUpperCase()}`,owner={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  expect((await request.post('/api/day/events',{headers:owner,data:{code,name,section:'Boy Scouts',format:'heats'}})).ok()).toBe(true);
  expect((await request.post('/api/day/events',{headers:owner,data:{code:off,name,section:'Girl Scouts',format:'heats'}})).ok()).toBe(true);
  expect((await request.post(`/api/day/events/${off}/enabled`,{headers:owner,data:{enabled:false}})).ok()).toBe(true);
  // Heat 1 is saved, so the event's current race is the next heat, not stored yet.
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[3001,3002],[1234,1301]);
  const {page}=await openPhone(`Home picker ${project}`);
  const distances=['60m','60m Hurdles','200m','400m'];
  // The heading shows while Home's stream is still opening: wait for the events before reading them all at once.
  await expect(page.getByRole('region',{name:'400m',exact:true})).toBeVisible();
  expect((await page.getByRole('main').getByRole('heading',{level:2}).allInnerTexts()).filter(heading=>distances.includes(heading))).toEqual(distances);
  await expect(page.getByRole('region',{name:'60m',exact:true}).getByRole('button')).toHaveCount(6);
  await expect(page.getByRole('region',{name:'60m Hurdles',exact:true}).getByRole('button')).toHaveCount(6);
  await expect(page.getByRole('region',{name:'400m',exact:true}).getByRole('button')).toHaveText([/^Boy Scouts/,/^Girl Scouts/]);
  const mine=page.getByRole('region',{name,exact:true}).getByRole('button');
  // The switched-off Girl Scouts event is not listed.
  await expect(mine).toHaveCount(1);
  // The owner who recorded Heat 1 still holds its jobs, which carry over to Heat 2.
  await expect(mine).toHaveAccessibleName(new RegExp(`^${name} Boy Scouts · Heat 2 · Order and times · `));
  await expect(mine).toHaveText(/^Boy ScoutsHeat 2 · Order and times · /);
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

test('Home\'s Races & Hurdles and Relays tabs switch the events shown, a reload keeps the last tab, and the back arrow from a relay\'s race screen returns to Relays',async({openPhone},info)=>{
  const project=info.project.name,name=`Home relay ${project}`;
  await ownRelay(`HR-${project.toUpperCase()}`,name);
  const {page}=await openPhone(`Home tabs ${project}`);
  const tabs=page.getByRole('tablist',{name:'Events',exact:true}),races=tabs.getByRole('tab',{name:'Races & Hurdles',exact:true}),relays=tabs.getByRole('tab',{name:'Relays',exact:true});
  const relayHeadings=['4x50m Relay','4x100m Relay',name];
  // The test day is shared, so other tests' events show too: only this test's and the seeded headings count.
  const headings=async()=>(await page.getByRole('main').getByRole('heading',{level:2}).allInnerTexts()).filter(heading=>[...relayHeadings,'60m','400m'].includes(heading));
  const which=page.getByRole('heading',{level:1,name:'Which event are you at?'});
  // A phone that has never switched opens on Races & Hurdles: today's Home, with no relay anywhere.
  await expect(tabs.getByRole('tab')).toHaveText(['Races & Hurdles','Relays']);
  await expect(races).toHaveAttribute('aria-selected','true');await expect(relays).toHaveAttribute('aria-selected','false');
  await expect(which).toBeVisible();
  await expect.poll(headings).toEqual(['60m','400m']);
  await expect(page.getByRole('button',{name:/No teams yet/})).toHaveCount(0);
  await relays.click();
  await expect(relays).toHaveAttribute('aria-selected','true');await expect(races).toHaveAttribute('aria-selected','false');
  await expect(which).toBeVisible();
  await expect.poll(headings).toEqual(relayHeadings);
  await expect(page.getByRole('region',{name:'4x50m Relay',exact:true}).getByRole('button')).toHaveText(['Boy BeaversNo teams yet','Girl BeaversNo teams yet','Boy CubsNo teams yet','Girl CubsNo teams yet']);
  await expect(page.getByRole('region',{name:'4x100m Relay',exact:true}).getByRole('button')).toHaveText(['Boy ScoutsNo teams yet','Girl ScoutsNo teams yet']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('home-relays.png'),fullPage:true});
  // The phone remembers the tab it used last.
  await page.reload();
  await expect(relays).toHaveAttribute('aria-selected','true');
  await expect.poll(headings).toEqual(relayHeadings);
  await openRaceScreen(page,name);
  await page.getByRole('button',{name:'Back to Home',exact:true}).click();
  await expect(relays).toHaveAttribute('aria-selected','true');
  await expect.poll(headings).toEqual(relayHeadings);
  await races.click();
  await expect(races).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('region',{name:'60m',exact:true})).toBeVisible();
  await page.reload();
  await expect(races).toHaveAttribute('aria-selected','true');
  await expect.poll(headings).toEqual(['60m','400m']);
});

test('Home\'s tabs are one segmented control under the zone lead row and above the heading: equal halves on a tinted track, the chosen one raised on white',async({openPhone},info)=>{
  const {page}=await openPhone(`Home tabs look ${info.project.name}`);
  const tabs=page.getByRole('tablist',{name:'Events',exact:true}),[races,relays]=[tabs.getByRole('tab',{name:'Races & Hurdles',exact:true}),tabs.getByRole('tab',{name:'Relays',exact:true})];
  const box=async(locator:Locator)=>(await locator.boundingBox())!;
  const [lead,list,heading,content]=await Promise.all([box(page.getByRole('button',{name:"I'm a zone lead",exact:true})),box(tabs),box(page.getByRole('heading',{level:1,name:'Which event are you at?'})),box(page.locator('.home'))]);
  expect(list.y).toBeGreaterThanOrEqual(lead.y+lead.height);
  expect(list.y+list.height).toBeLessThanOrEqual(heading.y);
  // The full width of Home's content, in two equal halves at least tap height.
  expect(Math.abs(list.width-content.width)).toBeLessThan(1);
  const [left,right]=await Promise.all([box(races),box(relays)]);
  expect(Math.abs(left.width-right.width)).toBeLessThan(1);
  expect(Math.abs(left.y-right.y)).toBeLessThan(1);
  expect(Math.min(left.height,right.height)).toBeGreaterThanOrEqual(44);
  const look=(locator:Locator)=>locator.evaluate(element=>{const style=getComputedStyle(element);return {background:style.backgroundColor,shadow:style.boxShadow,color:style.color};});
  expect(await look(tabs)).toMatchObject({background:tint});
  for(const [chosen,other] of [[races,relays],[relays,races]]) {
    await chosen.click();
    await expect(chosen).toHaveAttribute('aria-selected','true');
    expect(await look(chosen)).toMatchObject({background:'rgb(255, 255, 255)',color:navy});
    expect((await look(chosen)).shadow).not.toBe('none');
    expect(await look(other)).toEqual({background:'rgba(0, 0, 0, 0)',shadow:'none',color:navy});
    expect(await lookProblems(page)).toEqual([]);
  }
  await races.click();
  await page.screenshot({path:info.outputPath('home-tabs.png')});
});

test('a tile\'s status line changes live on another phone as phones check in, take the order and press Submit Race, and says Done once the stage is complete',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Home live ${project}`,code=`HL-${project.toUpperCase()}`,timed=`HT-${project.toUpperCase()}`;
  await ownEvent(request,code,name);await ownEvent(request,timed,name,'Boy Cubs','timed');
  const sam=`Home Sam ${project}`,jo=`Home Jo ${project}`,samToken=await signInThroughApi(request,sam),joToken=await signInThroughApi(request,jo);
  const {page}=await openPhone(`Home watcher ${project}`);
  const tile=(section:string)=>page.getByRole('region',{name,exact:true}).getByRole('button',{name:new RegExp(`^${name} ${section} · `)});
  await expect(tile('Girl Cubs')).toHaveText('Girl CubsHeat 1');
  await writeCheckIn(request,samToken,code,[2601,2602]);
  await expect(tile('Girl Cubs')).toHaveText(`Girl CubsHeat 1 · Checking in · ${sam}`,live);
  await takeJob(request,joToken,code,'order');
  await expect(tile('Girl Cubs')).toHaveText(`Girl CubsHeat 1 · Order and times · ${sam}, ${jo}`,live);
  await expect(tile('Girl Cubs')).toHaveAccessibleName(`${name} Girl Cubs · Heat 1 · Order and times · ${sam}, ${jo}`);
  await writeOrder(request,joToken,code,[2602,2601]);await writeTimes(request,samToken,code,[1000,1100]);
  await submitRace(request,samToken,code);
  await expect(tile('Girl Cubs')).toHaveText(`Girl CubsHeat 1 · Waiting on 1 to submit · ${jo}`,live);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('home-status-lines.png'),fullPage:true});
  await submitRace(request,joToken,code);
  // Heat 1 is saved; the holds carry over to Heat 2.
  await expect(tile('Girl Cubs')).toHaveText(`Girl CubsHeat 2 · Order and times · ${sam}, ${jo}`,live);
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,timed,[2611],[1000]);
  expect((await request.post(`/api/lead/events/${timed}/complete-stage`,{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{stage:'event'}})).ok()).toBe(true);
  await expect(tile('Boy Cubs')).toHaveText('Boy CubsDone',live);
  expect(await lookProblems(page)).toEqual([]);
  await deleteCurrentRace(request,code);await deleteCurrentRace(request,timed);
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

