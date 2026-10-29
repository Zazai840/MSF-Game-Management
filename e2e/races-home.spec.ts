import {ownCode,ownWristbands,deleteCurrentRace,expect,live,lookProblems,openRace,openRaceScreen,openRelays,ownEvent,ownRelay,recordRace,signInThroughApi,switchJob,test,writeCheckIn,writeOrder,type Page} from './fixtures.js';
const tabs=(page:Page)=>page.getByRole('navigation',{name:'Event type'});
const tab=(page:Page,name:string)=>tabs(page).getByRole('button',{name:new RegExp(`^${name}`)});
const card=(page:Page,name:string,section='Girl Cubs')=>page.getByRole('article',{name:`${name} · ${section}`,exact:true});
const status=(page:Page,name:string,section='Girl Cubs')=>card(page,name,section).locator('.rz-racecard__status');

test('Races, Hurdles and Relays tabs show their own events, the phone keeps the last tab, and Relays keeps its list and race screens',async({openPhone,request},info)=>{
  const project=info.project.name,races=`Tab sprint ${project}`,hurdles=`Tab hurdles ${project}`,relay=`Tab relay ${project}`;
  const [racesCode,hurdlesCode,relayCode]=[await ownCode(),await ownCode(),await ownCode()];
  await ownEvent(request,racesCode,races);
  await ownEvent(request,hurdlesCode,hurdles,'Girl Cubs','timed','hurdles');
  await ownRelay(relayCode,relay);
  const token=process.env.E2E_OWNER_TOKEN!;
  await writeCheckIn(request,token,racesCode,[2001]);await writeCheckIn(request,token,hurdlesCode,[2002]);
  const {page}=await openPhone(`Tabs ${project}`);
  // A phone that has never switched opens on Races.
  await expect(tab(page,'Races')).toHaveAttribute('aria-current','page');
  await expect(card(page,races)).toBeVisible();await expect(card(page,hurdles)).toHaveCount(0);
  await expect(tab(page,'Relays')).toHaveAccessibleName('Relays Beta');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('races.png'),fullPage:true});
  await tab(page,'Hurdles').click();
  await expect(tab(page,'Hurdles')).toHaveAttribute('aria-current','page');await expect(tab(page,'Races')).not.toHaveAttribute('aria-current');
  await expect(card(page,hurdles)).toBeVisible();await expect(card(page,races)).toHaveCount(0);
  await page.reload();
  await expect(tab(page,'Hurdles')).toHaveAttribute('aria-current','page');await expect(card(page,hurdles)).toBeVisible();
  // Relays keeps today's list of relay events, and the back arrow from a relay's race screen returns to Relays.
  await openRelays(page);
  await expect(tab(page,'Relays')).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('region',{name:relay,exact:true}).getByRole('button')).toHaveText(['Girl CubsNo teams yet']);
  await expect(card(page,races)).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relays.png'),fullPage:true});
  await openRaceScreen(page,relay);
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  await expect(tab(page,'Relays')).toHaveAttribute('aria-current','page');
  await tab(page,'Races').click();
  await expect(card(page,races)).toBeVisible();
  await deleteCurrentRace(request,racesCode);await deleteCurrentRace(request,hurdlesCode);
});

test('New race lists every event under its tab\'s name, and a race made from the wrong tab brings Races home back on its own tab',async({openPhone,request},info)=>{
  const project=info.project.name,races=`Grouped sprint ${project}`,hurdles=`Grouped hurdles ${project}`;
  const [racesCode,hurdlesCode]=[await ownCode(),await ownCode()];
  await ownEvent(request,racesCode,races);
  await ownEvent(request,hurdlesCode,hurdles,'Girl Cubs','timed','hurdles');
  const {page}=await openPhone(`Grouped ${project}`);
  await expect(tab(page,'Races')).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'New race'});
  const group=(name:string)=>sheet.getByRole('group',{name,exact:true});
  await expect(group('Races').getByRole('button',{name:races,exact:true})).toBeVisible();
  await expect(group('Races').getByRole('button',{name:hurdles,exact:true})).toHaveCount(0);
  await expect(group('Hurdles').getByRole('button',{name:hurdles,exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('new-race-grouped.png'),fullPage:true});
  await group('Hurdles').getByRole('button',{name:hurdles,exact:true}).click();
  await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${hurdles} · Girl Cubs`})).toBeVisible();
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  await expect(tab(page,'Hurdles')).toHaveAttribute('aria-current','page');
  await expect(card(page,hurdles)).toBeVisible();
  await deleteCurrentRace(request,hurdlesCode);
});

test('New race offers every event, each section, and the next heat; only a lead is offered the final, and once it is made no heat is offered',async({openPhone,request},info)=>{
  const project=info.project.name,name=`New race sprint ${project}`,code=await ownCode(),timed=await ownCode();
  await ownEvent(request,code,name);await ownEvent(request,timed,name,'Boy Cubs','timed');
  const {page}=await openPhone(`New race ${project}`);
  await page.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'New race'});
  await expect(sheet.getByRole('button',{name:'Choose the event and section',exact:true})).toBeDisabled();
  await sheet.getByRole('button',{name,exact:true}).click();
  await expect(sheet.getByRole('button',{name:/^(Girl Cubs|Boy Cubs)/})).toHaveText(['Girl Cubs','Boy Cubs']);
  await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Heat 1',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(sheet.getByRole('button',{name:'Final',exact:true})).toHaveCount(0);
  await expect(sheet.getByText('Girl Cubs has no heats yet. A lead makes the final once every heat has run.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('new-race.png'),fullPage:true});
  // An event decided by time alone has no final.
  await sheet.getByRole('button',{name:'Boy Cubs',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Final',exact:true})).toHaveCount(0);
  await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
  // The new race opens in my role's view.
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();
  await expect(page.getByRole('heading',{level:2,name:'Runner 1: wristband number?'})).toBeVisible();
  // Heat 1 saved: the card's "+" pre-selects the event and section, and offers Heat 2; the final is a lead's.
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2001,2002],[1200,1300]);
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  await expect(status(page,name)).toHaveText('Heat 1 done',live);
  await expect(card(page,name).getByText('A lead makes the final once every heat has run.',{exact:true})).toBeVisible();
  await expect(card(page,name).getByRole('button',{name:'Create the final from the fastest 6',exact:true})).toHaveCount(0);
  await card(page,name).getByRole('button',{name:'Add heat 2',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Heat 2',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(sheet.getByText('Girl Cubs already has heat 1. A lead makes the final once every heat has run.',{exact:true})).toBeVisible();
  await expect(sheet.getByRole('button',{name:'Final',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  // A lead's New race offers the final, and asks first: Not yet makes nothing.
  const lead=(await openPhone(`New race lead ${project}`,{lead:true})).page;
  await lead.getByRole('button',{name:'New race',exact:true}).click();
  const leadSheet=lead.getByRole('dialog',{name:'New race'});
  await leadSheet.getByRole('button',{name,exact:true}).click();await leadSheet.getByRole('button',{name:`Girl Cubs ${code}`,exact:true}).click();
  await expect(leadSheet.getByText('Girl Cubs already has heat 1. The final opens when every heat has times, with the fastest 6 filled in.',{exact:true})).toBeVisible();
  await leadSheet.getByRole('button',{name:'Final',exact:true}).click();
  await leadSheet.getByRole('button',{name:'Create the final',exact:true}).click();
  const confirm=lead.getByRole('dialog',{name:'Have all Girl Cubs heats run?',exact:true});
  await expect(confirm.locator('.rz-sheet__text')).toHaveText('1 heat saved. The final takes the fastest 6, and no more heats can be added.');
  await expect(leadSheet).toHaveCount(0);
  await confirm.getByRole('button',{name:'Not yet',exact:true}).click();
  await expect(confirm).toHaveCount(0);
  await expect(card(lead,name).getByRole('button',{name:'Add heat 2',exact:true})).toBeVisible();
  // The lead makes it from the card: the heats are finished for everyone.
  await card(lead,name).getByRole('button',{name:'Create the final from the fastest 6',exact:true}).click();
  await confirm.getByRole('button',{name:'Make the final',exact:true}).click();
  await expect(lead.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();
  await expect(card(page,name).getByRole('button',{name:/^Add heat/})).toHaveCount(0,live);
  await page.getByRole('button',{name:'New race',exact:true}).click();
  await sheet.getByRole('button',{name,exact:true}).click();await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await expect(sheet.getByText('Girl Cubs heats are finished. Ask a lead to add another heat.',{exact:true})).toBeVisible();
  await expect(sheet.getByRole('button',{name:/^Create heat/})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('new-race-heats-finished.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await deleteCurrentRace(request,code);
});

test('a New race the server refuses says why in the amber callout in the sheet, not at the top of Races',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Refused race ${project}`,code=await ownCode();
  await ownEvent(request,code,name);
  const {page}=await openPhone(`Refused race ${project}`);
  await page.route('**/api/races',route=>route.request().method()==='POST'?route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'This event is switched off'})}):route.continue());
  await page.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'New race'});
  await sheet.getByRole('button',{name,exact:true}).click();await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
  await expect(sheet.getByRole('alert')).toHaveText('This event is switched off');
  await expect(sheet.getByRole('alert')).toHaveClass('rz-callout');
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('new-race-refused.png'),fullPage:true});
  // Tried again once the server takes it, the sheet opens the race.
  await page.unroute('**/api/races');
  await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();
  await deleteCurrentRace(request,code);
});

test('a heat someone made a moment before the tap opens theirs: two phones making the same next heat end up in one race',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Same heat ${project}`,code=await ownCode();
  await ownEvent(request,code,name);
  const one=await openPhone(`Same one ${project}`),two=await openPhone(`Same two ${project}`);
  await two.page.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=two.page.getByRole('dialog',{name:'New race'});
  await sheet.getByRole('button',{name,exact:true}).click();await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Create heat 1',exact:true})).toBeVisible();
  // The other phone makes Heat 1 first, and the sheet hears of it live.
  const made=(await (await request.post('/api/races',{headers:{authorization:`Bearer ${one.token}`},data:{eventCode:code,kind:'heat',number:1}})).json()).race.id;
  await expect(sheet.getByText(/^Girl Cubs already has heat 1\./)).toBeVisible(live);
  // The tap is for the heat it offered: it opens that heat, not a second one.
  await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
  await expect(two.page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();
  expect(new URL(two.page.url()).pathname).toBe(`/races/${made}`);
  const groups=(await (await request.get('/api/races',{headers:{authorization:`Bearer ${one.token}`}})).json()).groups;
  expect(groups.find((group:{event:{code:string}})=>group.event.code===code).races).toHaveLength(1);
  await deleteCurrentRace(request,code);
});
test('each card says each race\'s state in my job\'s step, sorted into Ready for you and In progress, live as others work',async({openPhone,request},info)=>{
  const project=info.project.name,ready=`Ready sprint ${project}`,busy=`Busy sprint ${project}`,done=`Timed sprint ${project}`;
  const [readyCode,busyCode,doneCode]=[await ownCode(),await ownCode(),await ownCode()];
  for(const [code,name] of [[readyCode,ready],[busyCode,busy],[doneCode,done]]) await ownEvent(request,code,name,'Girl Cubs','timed');
  const sam=await signInThroughApi(request,`Ready Sam ${project}`);
  await recordRace(request,sam,doneCode,[2001],[1200]);
  // Busy has runners still checking in; Ready has its runners done, waiting for times.
  await writeCheckIn(request,sam,busyCode,[2002]);
  await writeCheckIn(request,sam,readyCode,[2003,2004]);
  const {page}=await openPhone(`Ready timer ${project}`,{job:'timer'});
  const section=(heading:string)=>page.locator(`h2:text-is("${heading}") ~ article`);
  // Times never wait for the start line: both heats with runners are ready for the timer.
  await expect(status(page,ready)).toHaveText('Heat 1 needs times');
  await expect(status(page,busy)).toHaveText('Heat 1 needs times');
  await expect(page.getByRole('heading',{level:2,name:'Ready for you'})).toBeVisible();
  await expect(section('Ready for you').filter({hasText:ready})).toHaveCount(1);
  // A saved heat is done, but its event stays in progress until a lead decides the medals.
  await expect(section('In progress').filter({hasText:done})).toHaveCount(1);
  await expect(status(page,done)).toHaveText('Heat 1 done');
  await expect(card(page,done).getByRole('button',{name:/^Heat 1/})).toHaveAccessibleName('Heat 1, done');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('sections.png'),fullPage:true});
  // A finish line sees the same cards in its own step's words.
  await switchJob(page,'Finish line');
  await expect(status(page,busy)).toHaveText('Heat 1 needs the finishing order');
  await expect(card(page,busy).getByRole('button',{name:/^Heat 1/})).toHaveAccessibleName('Heat 1, needs the finishing order');
  // Another phone saves Ready's finishing order: the card says so, live.
  await writeOrder(request,sam,readyCode,[2003,2004]);
  await expect(card(page,ready).getByRole('button',{name:/^Heat 1/})).toHaveAccessibleName('Heat 1, needs the finishing order');
  const readyId=(await (await request.get('/api/races',{headers:{authorization:`Bearer ${sam}`}})).json()).groups.find((group:{event:{code:string}})=>group.event.code===readyCode).races[0].id;
  const markDone=(step:string)=>request.post(`/api/races/${readyId}/steps/${step}/done`,{headers:{authorization:`Bearer ${sam}`},data:{}});
  await markDone('positions');
  await expect(card(page,ready).getByRole('button',{name:/^Heat 1/})).toHaveAccessibleName('Heat 1, order saved',live);
  await expect(status(page,ready)).toHaveText('Heat 1 order saved');
  // The start line's own word once its check-in is done: checked in, not done, while the race still waits for times.
  await markDone('runners');
  await switchJob(page,'Start line');
  await expect(status(page,ready)).toHaveText('Heat 1 checked in');
  for(const code of [readyCode,busyCode,doneCode]) await deleteCurrentRace(request,code);
});
test('a Hurdles event stays under In progress after its heats are saved, and moves to Done once a lead marks it Event complete',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Medals hurdles ${project}`,code=await ownCode(),owner=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(request,code,name,'Girl Cubs','timed','hurdles');
  const w=await ownWristbands('Girl Cubs',2);
  await recordRace(request,owner,code,[w(1)],[1200]);
  await recordRace(request,owner,code,[w(2)],[1300]);
  const {page}=await openPhone(`Medals timer ${project}`,{job:'timer'});
  await tab(page,'Hurdles').click();
  const section=(heading:string)=>page.locator(`h2:text-is("${heading}") ~ article`);
  await expect(section('In progress').filter({hasText:name})).toHaveCount(1);
  await expect(status(page,name)).toHaveText('Heats 1 and 2 done');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('hurdles-in-progress.png'),fullPage:true});
  expect((await request.post(`/api/lead/events/${code}/complete-stage`,{headers:{authorization:`Bearer ${owner}`},data:{stage:'event'}})).ok()).toBe(true);
  await expect(section('In progress').filter({hasText:name})).toHaveCount(0,live);
  const done=page.locator('details',{hasText:/^Done \(\d+\)/});
  await done.locator('summary').click();
  await expect(done.getByRole('article',{name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(status(page,name)).toHaveText('Heats 1 and 2 done');
  await page.screenshot({path:info.outputPath('hurdles-done.png'),fullPage:true});
});

test('switching job on a race keeps the race open in the new view, and another job\'s step opens read-only',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Switch sprint ${project}`,code=await ownCode();
  await ownEvent(request,code,name);
  await writeCheckIn(request,process.env.E2E_OWNER_TOKEN!,code,[2001,2002]);
  const {page}=await openPhone(`Switch ${project}`);
  await openRace(page,name);
  await expect(page.getByRole('heading',{level:2,name:'Runner 3: wristband number?'})).toBeVisible();
  // Tapping Finishing order in the step strip shows it read-only, with the way back.
  await page.getByRole('tab',{name:'Finishing order, Not started. View read-only',exact:true}).click();
  const readOnly=page.getByRole('tabpanel',{name:'Finishing order, read-only'});
  await expect(readOnly.getByRole('status')).toHaveText(/Viewing Finishing order · read-only\. It's the Finish line's step; you're the Start line\./);
  await expect(readOnly.getByText('Nobody is placed yet.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('read-only.png'),fullPage:true});
  await readOnly.getByRole('button',{name:'Back to Runners',exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:'Runner 3: wristband number?'})).toBeVisible();
  // Switch job from the chip: the race stays open, in the finish line's view, and Races follows.
  await switchJob(page,'Finish line');
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();
  await expect(page.getByRole('heading',{level:2,name:'Who came 1st?'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Your job: Finish line. Change job',exact:true})).toBeVisible();
  // The step strip keeps one line per cell: an own step not started is "You · not yet".
  await expect(page.getByRole('tablist',{name:'Heat 1 progress'}).getByRole('tab')).toHaveText(['Runners2 so far','Finishing orderYou · not yet','TimesNot started']);
  expect(await lookProblems(page)).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading',{level:2,name:'Who came 1st?'})).toBeVisible();
  await deleteCurrentRace(request,code);
});
test('a saved race opens read-only for a volunteer, saying to ask a lead',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Saved sprint ${project}`,code=await ownCode();
  await ownEvent(request,code,name);
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2001,2002],[1200,1300]);
  const {page}=await openPhone(`Saved ${project}`);
  await openRace(page,name);
  await expect(page.getByRole('status').filter({hasText:'Heat 1 is saved. Ask a lead to change it.'})).toBeVisible();
  await expect(page.getByLabel('Wristband number',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:"That's everyone",exact:true})).toHaveCount(0);
  // It asks for nothing: the runners are listed, with nothing to remove.
  await expect(page.getByRole('heading',{level:2,name:'2 runners checked in'})).toBeVisible();
  await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText(['2001','2002']);
  await expect(page.getByRole('button',{name:/^Remove /})).toHaveCount(0);
  // Every step done: an own done step is "You · done", so the strip stays one line per cell.
  await expect(page.getByRole('tablist',{name:'Heat 1 progress'}).getByRole('tab')).toHaveText(['RunnersYou · done','Finishing order2 finished','Times2 of 2']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('saved.png'),fullPage:true});
});
