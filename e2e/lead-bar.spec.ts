import {becomeLead,cellAt,cellOn as tabsCellOn,cellSlid,cellThen,cellTrace,deleteCurrentRace,expect,lookProblems,openRace,openRelays,ownCode,ownEvent,ownName,ownWristbands,press,raceAction,recordRace,resultsCard,stillTabs,switchJob,test,watchCell,writeCheckIn,type Page} from './fixtures.js';
const bar=(page:Page)=>page.getByRole('navigation',{name:'Lead screens',exact:true});
const tab=(page:Page,name:string)=>bar(page).getByRole('button',{name,exact:true});
const arrow=(page:Page)=>page.getByRole('banner').getByRole('button',{name:/^Back to /});
const title=(page:Page,name:string)=>expect(page.getByRole('banner').getByRole('heading',{level:1,name,exact:true})).toBeVisible();
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
/** The filled cell that marks the current tab: one element behind the bar's buttons. */
const cell=(page:Page)=>bar(page).locator('.rz-tab-cell');
// The page watches the bar's cell on every frame (fixtures, watchCell): 0 on Races, 1 on Results, 2 on Day setup.
const trace=cellTrace,slid=cellSlid;
const cellOn=(page:Page,name:string)=>tabsCellOn(bar(page),name);
/** The lead's bar on one of its three screens: the three tabs, each an icon and a word, this screen's marked, at the foot of the screen below `above`. */
async function onBar(page:Page,current:string,above:ReturnType<Page['locator']>) {
  await expect(bar(page).getByRole('button')).toHaveText(['Races','Results','Day setup']);
  for(const name of ['Races','Results','Day setup']) {
    if(name===current) await expect(tab(page,name)).toHaveAttribute('aria-current','page');else await expect(tab(page,name)).not.toHaveAttribute('aria-current');
    await expect(tab(page,name).locator('svg.rz-icon')).toHaveCount(1);
  }
  // The bar is the top header's surface: its navy with the pattern, light words; the current tab is the inverse, navy on a light cell.
  const paint=(of:ReturnType<Page['locator']>)=>of.evaluate(el=>{const style=getComputedStyle(el);return {ground:style.backgroundColor,ink:style.color};});
  const header=await paint(page.getByRole('banner'));
  expect(await paint(bar(page)),current).toEqual(header);
  await expect(bar(page).locator('svg.rz-pattern')).toHaveCount(1);
  // The light cell is one element behind the buttons, at rest on the current tab; the words follow its colour.
  await cellOn(page,current);
  for(const name of ['Races','Results','Day setup']) await expect(tab(page,name),name).toHaveCSS('color',name===current?header.ground:header.ink);
  await expect(cell(page),current).toHaveCSS('background-color',header.ink);
  // Nothing shows under the bar: it ends at the foot of the screen.
  const foot=await bar(page).evaluate(el=>el.getBoundingClientRect().bottom-window.innerHeight);
  expect(Math.abs(foot),current).toBeLessThanOrEqual(0.5);
  await expect(bar(page)).toBeInViewport({ratio:1});
  // The bar stays at the bottom while the screen scrolls under it: at the end of the screen, `above` is clear of it.
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const box=(await bar(page).boundingBox())!,over=(await above.boundingBox())!;
  expect(over.y+over.height,current).toBeLessThanOrEqual(box.y+0.5);
  expect(await lookProblems(page),current).toEqual([]);
}
/** The lead's bar on a deeper lead screen: the three tabs, `current` lit with the cell on it, at the foot of the screen. */
async function lit(page:Page,current:string) {
  await expect(bar(page).getByRole('button')).toHaveText(['Races','Results','Day setup']);
  await expect(bar(page).locator('[aria-current="page"]')).toHaveText(current);
  await cellOn(page,current);
  const foot=await bar(page).evaluate(el=>el.getBoundingClientRect().bottom-window.innerHeight);
  expect(Math.abs(foot),current).toBeLessThanOrEqual(0.5);
  expect(await lookProblems(page),current).toEqual([]);
}

test('a lead moves between Races, Results and Day setup by the bar at the bottom; deeper screens have the back arrow and the bar, the Race screen has none',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Bar walk'),event=`${name} · Girl Cubs`,w=await ownWristbands('Girl Cubs',3);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const race=await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1100,1200]);
  // Heat 2 is not in Results yet: a lead's Race screen.
  await writeCheckIn(request,process.env.E2E_OWNER_TOKEN!,code,[w(3)]);
  const lead=ownName('Bar lead'),{page}=await openPhone(lead,{lead:true});
  const updated=page.getByRole('contentinfo').getByText(/^Updated at \d/);
  // Races, on both of its tabs: the bar sits below New race.
  await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  await onBar(page,'Races',page.getByRole('button',{name:'New race',exact:true}));
  // The current tab's light cell sits inside the navy bar, not edge to edge.
  await expect(cell(page)).toHaveCSS('background-clip','padding-box');
  await page.screenshot({path:info.outputPath('races.png')});
  await openRelays(page);
  await onBar(page,'Races',page.getByRole('button',{name:'New relay',exact:true}));
  // The avatar opens Log out only, and says so.
  await press(page.getByRole('banner').getByRole('button',{name:`${lead}: Log out`,exact:true}));
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Log out']);
  expect(await lookProblems(page)).toEqual([]);
  await press(page.getByRole('banner').getByRole('button',{name:`${lead}: Log out`,exact:true}));
  // One tap opens Results: its own address, no back arrow, the bar below the Updated at line.
  await press(tab(page,'Results'));await title(page,'Results');await expect(page).toHaveURL(/\/results$/);
  await expect(arrow(page)).toHaveCount(0);
  await expect(updated).toBeVisible();await onBar(page,'Results',updated);
  await page.screenshot({path:info.outputPath('results.png')});
  // An event (with its Deleted races) and a race page: the bar with Results lit, and the back arrow names Results, then the event.
  await press(resultsCard(page,code));await title(page,event);
  await expect(updated).toBeVisible();await onBar(page,'Results',updated);await expect(arrow(page)).toHaveAccessibleName('Back to Results');
  await page.screenshot({path:info.outputPath('event.png')});
  await press(page.getByRole('button',{name:`Open Heat ${race.number}`,exact:true}));await title(page,`Heat ${race.number}`);
  await lit(page,'Results');await expect(arrow(page)).toHaveAccessibleName(`Back to ${event}`);
  await press(arrow(page));await title(page,event);await press(arrow(page));await title(page,'Results');
  // Results to Day setup in one tap, with no visit to Races.
  await press(tab(page,'Day setup'));await title(page,'Day setup');await expect(page).toHaveURL(/\/day$/);
  await expect(arrow(page)).toHaveCount(0);
  await expect(updated).toBeVisible();await onBar(page,'Day setup',updated);
  await page.screenshot({path:info.outputPath('day-setup.png')});
  // Each Day setup screen: the bar with Day setup lit, and the back arrow.
  for(const [row,screen] of [[/^Signed in today /,'Signed in today'],[/^Events /,'Events'],[/^This day/,'This day'],[/^Change Olympics password/,'Change Olympics password'],[/^Day export/,'Day export'],[/^Start a new day/,'Start a new day']] as const) {
    await press(page.getByRole('button',{name:row}));await title(page,screen);
    await lit(page,'Day setup');await expect(arrow(page)).toHaveAccessibleName('Back to Day setup');
    await press(arrow(page));await title(page,'Day setup');
  }
  // The phone's Back goes through the screens visited, and forward again.
  await page.goBack();await title(page,'Results');await expect(tab(page,'Results')).toHaveAttribute('aria-current','page');
  await page.goBack();await races(page);await expect(tab(page,'Races')).toHaveAttribute('aria-current','page');
  await page.goForward();await title(page,'Results');
  await press(tab(page,'Races'));await races(page);await expect(page).toHaveURL(/\/$/);
  // The Race screen has no bar.
  await press(page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:/^Races/}));
  await openRace(page,name,'Girl Cubs','H2');await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true})).toBeVisible();
  await deleteCurrentRace(request,code);
});

test('a volunteer has no bar; it appears at once when the phone becomes a lead\'s, and stays in a volunteer role',async({openPhone})=>{
  const {page}=await openPhone(ownName('Bar volunteer'));
  await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  await expect(bar(page)).toHaveCount(0);
  // A lead screen's address shows Lead access needed, with its back arrow and no bar.
  await page.goto('/results');await title(page,'Lead access needed');
  await expect(bar(page)).toHaveCount(0);
  await press(page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true}));await races(page);
  await becomeLead(page);
  await expect(tab(page,'Races')).toHaveAttribute('aria-current','page',{timeout:2000});
  // A lead who takes a volunteer role for a race keeps the bar, and Results.
  await switchJob(page,'Finish line');
  await expect(page.getByRole('button',{name:'Your role is Finish line. Change job',exact:true})).toBeVisible();
  await expect(tab(page,'Races')).toHaveAttribute('aria-current','page');
  expect(await lookProblems(page)).toEqual([]);
  await press(tab(page,'Results'));await title(page,'Results');
  await expect(tab(page,'Results')).toHaveAttribute('aria-current','page');
  // The same on a deeper screen.
  await press(tab(page,'Day setup'));await title(page,'Day setup');
  await press(page.getByRole('button',{name:/^Events /}));await title(page,'Events');await lit(page,'Day setup');
});

test('on a deeper screen the lit tab is the section the lead came from, or the screen\'s own section with no history; a different tab opens its first screen, and the phone\'s Back returns',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Bar way in'),event=`${name} · Girl Cubs`,w=await ownWristbands('Girl Cubs',4);
  await ownEvent(request,code,name,'Girl Cubs','heats');
  // A tie between Heat 1 and Heat 2: a Decide the tie button on the event's card on Races.
  const race=await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1000,1100]);await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(3),w(4)],[1000,1100]);
  const page=await watched(openPhone,'Bar way in lead'),heat=`Heat ${race.number}`,open=page.getByRole('button',{name:`Open ${heat}`,exact:true});
  // From Races: the event, and the race page opened from it, light Races.
  await press(page.getByRole('article',{name:event,exact:true}).getByRole('button',{name:'Decide the tie',exact:true}));
  await title(page,event);await lit(page,'Races');
  await press(open);await title(page,heat);await lit(page,'Races');
  // A different tab opens that section's first screen, and the cell slides from the tab lit before.
  await trace(page);
  await press(tab(page,'Results'));await title(page,'Results');await expect(page).toHaveURL(/\/results$/);await expect(arrow(page)).toHaveCount(0);
  await cellOn(page,'Results');slid(await trace(page),0,1,'Results');
  // The phone's Back goes to the screen shown before.
  await page.goBack();await title(page,heat);await lit(page,'Races');
  await page.goForward();await title(page,'Results');
  // The same event and race page opened from Results light Results.
  await press(resultsCard(page,code));await title(page,event);await lit(page,'Results');
  await press(open);await title(page,heat);await lit(page,'Results');
  await press(tab(page,'Day setup'));await title(page,'Day setup');await expect(page).toHaveURL(/\/day$/);await expect(arrow(page)).toHaveCount(0);
  await press(page.getByRole('button',{name:/^Events /}));await title(page,'Events');await lit(page,'Day setup');
  // Results opens at its first screen, not at the race page the lead left there.
  await press(tab(page,'Results'));await title(page,'Results');await expect(page).toHaveURL(/\/results$/);
  await press(tab(page,'Races'));await races(page);
  // With no history, a screen lights the section it belongs to.
  await page.goto(`/results/${code}/races/${race.id}`);await title(page,heat);await lit(page,'Results');
  await page.goto(`/results/${code}`);await title(page,event);await lit(page,'Results');
  await page.goto('/day/events/new');await title(page,'Add an event');await lit(page,'Day setup');
});

test('Delete opened from a Race screen lights the tab the lead came to the race from: Races from Races, Results from Results',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Bar race way in'),event=`${name} · Girl Cubs`,w=await ownWristbands('Girl Cubs',3);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1100,1200]);
  // Heat 2 is not in Results yet: a lead's Race screen, whose Delete is the screen under it.
  const {race}=await writeCheckIn(request,process.env.E2E_OWNER_TOKEN!,code,[w(3)]);
  const {page}=await openPhone(ownName('Bar race way in lead'),{lead:true});
  const toDelete=async()=>{
    await expect.poll(()=>new URL(page.url()).pathname).toBe(`/races/${race.id}`);await expect(bar(page)).toHaveCount(0);
    await raceAction(page,'Delete Heat 2');await title(page,'Delete race');
    await expect.poll(()=>new URL(page.url()).pathname).toBe(`/races/${race.id}/delete`);
  };
  await openRace(page,name,'Girl Cubs','H2');await toDelete();await lit(page,'Races');
  await press(tab(page,'Results'));await title(page,'Results');
  await press(resultsCard(page,code));await title(page,event);
  await press(page.getByRole('button',{name:'Open Heat 2',exact:true}));await toDelete();await lit(page,'Results');
  // Back goes to the Race screen, then to the event, with Results still lit.
  await press(arrow(page));await expect(bar(page)).toHaveCount(0);
  await page.goBack();await title(page,event);await lit(page,'Results');
});

/** A lead on Races, the page watching the cell from its first frame. */
async function watched(openPhone:(name:string,options?:{lead?:boolean})=>Promise<{page:Page}>,name:string) {
  const {page}=await openPhone(ownName(name),{lead:true});
  await page.addInitScript(watchCell,'Lead screens');await page.reload();
  await races(page);await cellOn(page,'Races');
  return page;
}

test('the current tab\'s cell slides to the tapped tab while the new screen shows at once; with reduced motion it is there at once',async({openPhone})=>{
  const page=await watched(openPhone,'Cell lead');
  // The first screen after the app opens: the cell is on the current tab and never moved.
  expect(await trace(page)).toEqual([{tab:'Races',at:0}]);
  // The cell is decoration, and it moves by a transition on its transform: 200ms, fast start, soft stop.
  await expect(cell(page)).toHaveAttribute('aria-hidden','true');
  await expect(cell(page)).toHaveCSS('transition-property','transform');
  await expect(cell(page)).toHaveCSS('transition-duration','0.2s');
  await expect(cell(page)).toHaveCSS('transition-timing-function','cubic-bezier(0.23, 1, 0.32, 1)');
  // A tab's words and icon change colour with the cell, and the tab still shrinks while pressed.
  expect(await tab(page,'Results').evaluate(el=>{const style=getComputedStyle(el);return Object.fromEntries(style.transitionProperty.split(', ').map((property,index)=>[property,style.transitionDuration.split(', ')[index]]));})).toEqual({scale:'0.14s',color:'0.2s'});
  await press(tab(page,'Results'));await title(page,'Results');
  await cellOn(page,'Results');
  slid(await trace(page),0,1,'Results');
  expect(await lookProblems(page)).toEqual([]);
  // Reduced motion: the cell is on the new tab in the first frame of the new screen.
  await page.emulateMedia({reducedMotion:'reduce'});
  await stillTabs(bar(page));
  await press(tab(page,'Day setup'));await title(page,'Day setup');
  await cellOn(page,'Day setup');
  expect(await trace(page)).toEqual([{tab:'Results',at:1},{tab:'Day setup',at:2}]);
  await expect(tab(page,'Day setup')).toHaveCSS('color',await page.getByRole('banner').evaluate(el=>getComputedStyle(el).backgroundColor));
});

test('the cell slides from the tab shown before on the phone\'s Back and Forward, and stays still through a deeper screen of the same section',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Cell event'),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1100,1200]);
  const page=await watched(openPhone,'Cell back lead');
  await press(tab(page,'Results'));await title(page,'Results');await cellOn(page,'Results');
  await press(tab(page,'Day setup'));await title(page,'Day setup');await cellOn(page,'Day setup');
  await trace(page);
  // No tap on the bar: Back and Forward change the tab, and the cell slides from the tab shown before.
  await page.goBack();await title(page,'Results');await cellOn(page,'Results');
  slid(await trace(page),2,1,'Results');
  await page.goForward();await title(page,'Day setup');await cellOn(page,'Day setup');
  slid(await trace(page),1,2,'Day setup');
  // A deeper screen, then back to the same tab: the cell is where it was and does not move.
  await press(page.getByRole('button',{name:/^Events /}));await title(page,'Events');await cellOn(page,'Day setup');
  await press(arrow(page));await title(page,'Day setup');await cellOn(page,'Day setup');
  expect(await trace(page)).toEqual([{tab:'Day setup',at:2}]);
  // The same from Results, through an event: the cell stays on Results.
  await press(tab(page,'Results'));await title(page,'Results');await cellOn(page,'Results');
  await trace(page);
  await press(resultsCard(page,code));await title(page,`${name} · Girl Cubs`);await cellOn(page,'Results');
  await press(arrow(page));await title(page,'Results');await cellOn(page,'Results');
  expect(await trace(page)).toEqual([{tab:'Results',at:1}]);
});

test('a problem on a Races card opens the event with Races still lit; its back arrow returns to Races, and the cell has not moved',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Cell card'),w=await ownWristbands('Girl Cubs',4);
  await ownEvent(request,code,name,'Girl Cubs','heats');
  // Two times, each shared by a runner of Heat 1 and a runner of Heat 2: one Decide the tie button on the card.
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1000,1100]);await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(3),w(4)],[1000,1100]);
  const page=await watched(openPhone,'Cell card lead');
  await trace(page);
  await press(page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true}).getByRole('button',{name:'Decide the tie',exact:true}));
  await title(page,`${name} · Girl Cubs`);await cellOn(page,'Races');
  // The arrow names Races, where the lead came from: the cell is on Races, where it was.
  await expect(arrow(page)).toHaveAccessibleName('Back to Races');
  await press(arrow(page));await races(page);await cellOn(page,'Races');
  expect(await trace(page)).toEqual([{tab:'Races',at:0}]);
  expect(await lookProblems(page)).toEqual([]);
});

test('a second tap while the cell moves sends it straight to the last tab from where it is',async({openPhone})=>{
  const page=await watched(openPhone,'Cell twice lead');
  await trace(page);
  // A slow cell for this test, so each frame is a small step and a jump shows. The page presses Day setup when the cell is a fifth of its way to Results.
  await page.addStyleTag({content:'.rz-tab-cell { transition-duration: 3s !important; }'});
  await cellThen(page,'Day setup');
  await press(tab(page,'Results'));await title(page,'Day setup');
  await expect.poll(()=>cellAt(page),{timeout:10000}).toBe(2);
  await cellOn(page,'Day setup');
  const samples=await trace(page),places=samples.map(sample=>sample.at),second=samples.findIndex(sample=>sample.tab==='Day setup'),seen=JSON.stringify(samples);
  // At the second tap the cell was between Races and Results; it goes on from that place, never back and never by a jump to Results.
  expect(places[second-1],seen).toBeGreaterThan(0.2);expect(places[second-1],seen).toBeLessThan(0.6);
  expect(Math.abs(places[second]-places[second-1]),seen).toBeLessThanOrEqual(0.15);
  expect(places,seen).toEqual([...places].sort((a,b)=>a-b));
  expect(places.at(-1),seen).toBe(2);
  expect(await lookProblems(page)).toEqual([]);
});

/** The screen scrolled down, then a tap on the lit tab: each place the screen was at on its way to the top. */
async function toTop(page:Page,name:string) {
  await expect.poll(()=>page.evaluate(()=>{window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});return window.scrollY;}),name).toBeGreaterThan(100);
  // The places start at the tap: a scroll before it (the way down, a list that grew) is not on the way to the top.
  await page.evaluate(()=>{
    const seen=window as unknown as {places:number[]};seen.places=[];window.onscroll=()=>seen.places.push(window.scrollY);
    window.addEventListener('click',()=>{seen.places=[];},{capture:true,once:true});
  });
  await press(tab(page,name));
  await expect.poll(()=>page.evaluate(()=>window.scrollY),name).toBe(0);
  return page.evaluate(()=>(window as unknown as {places:number[]}).places);
}

test('a tap on the lit tab opens the first screen of its section from a deeper screen, and on the first screen goes to the top; the phone\'s Back goes to the screen shown before',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Bar lit tap'),event=`${name} · Girl Cubs`,w=await ownWristbands('Girl Cubs',8);
  await ownEvent(request,code,name,'Girl Cubs','heats');
  // A tie between Heat 1 and Heat 2: a Decide the tie button on the event's card on Races.
  const race=await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1000,1100]);await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(3),w(4)],[1000,1100]);
  // Two more events with a result, so Races and Results are longer than a short screen.
  for(const [at,words] of [[5,'Bar lit tap two'],[7,'Bar lit tap three']] as const) {
    const other=await ownCode();await ownEvent(request,other,ownName(words),'Girl Cubs','timed');
    await recordRace(request,process.env.E2E_OWNER_TOKEN!,other,[w(at),w(at+1)],[1100,1200]);
  }
  const {page}=await openPhone(ownName('Bar lit tap lead'),{lead:true}),heat=`Heat ${race.number}`;
  await races(page);
  // A race page opened from Races: a tap on Races, the lit tab, opens Races, and Back goes to the race page.
  await press(page.getByRole('article',{name:event,exact:true}).getByRole('button',{name:'Decide the tie',exact:true}));await title(page,event);
  await press(page.getByRole('button',{name:`Open ${heat}`,exact:true}));await title(page,heat);await lit(page,'Races');
  await press(tab(page,'Races'));await races(page);await expect(page).toHaveURL(/\/$/);await cellOn(page,'Races');
  await page.goBack();await title(page,heat);await lit(page,'Races');
  // An event opened from Results: a tap on Results, the lit tab, opens the Results list, and Back goes to the event.
  await press(tab(page,'Results'));await title(page,'Results');
  await press(resultsCard(page,code));await title(page,event);await lit(page,'Results');
  await press(tab(page,'Results'));await title(page,'Results');await expect(page).toHaveURL(/\/results$/);await expect(arrow(page)).toHaveCount(0);
  await page.goBack();await title(page,event);await lit(page,'Results');
  // A short screen, so each first screen scrolls. Scrolled down, a tap on the lit tab scrolls to the top, through the places between.
  const {width}=page.viewportSize()!;await page.setViewportSize({width,height:420});
  await press(tab(page,'Results'));await title(page,'Results');
  for(const [section,address] of [['Results',/\/results$/],['Day setup',/\/day$/],['Races',/\/$/]] as const) {
    await press(tab(page,section));await expect(page).toHaveURL(address);await cellOn(page,section);
    const places=await toTop(page,section);
    expect(places.some(place=>place>0),`${section} ${JSON.stringify(places)}`).toBe(true);
    await expect(page).toHaveURL(address);await expect(tab(page,section)).toHaveAttribute('aria-current','page');
    expect(await lookProblems(page),section).toEqual([]);
  }
  // The tap added no screen: Back from Races goes to Day setup, the screen shown before.
  await page.goBack();await title(page,'Day setup');
  await page.goBack();await title(page,'Results');
  // Reduced motion: the screen is at the top at once, with no place between.
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const section of ['Results','Day setup','Races']) {
    await press(tab(page,section));await cellOn(page,section);
    expect((await toTop(page,section)).filter(place=>place>0),section).toEqual([]);
  }
});
