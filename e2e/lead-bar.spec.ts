import {becomeLead,deleteCurrentRace,expect,lookProblems,openRace,openRelays,ownCode,ownEvent,ownName,ownWristbands,press,recordRace,resultsCard,switchJob,test,writeCheckIn,type Page} from './fixtures.js';
const bar=(page:Page)=>page.getByRole('navigation',{name:'Lead screens',exact:true});
const tab=(page:Page,name:string)=>bar(page).getByRole('button',{name,exact:true});
const arrow=(page:Page)=>page.getByRole('banner').getByRole('button',{name:/^Back to /});
const title=(page:Page,name:string)=>expect(page.getByRole('banner').getByRole('heading',{level:1,name,exact:true})).toBeVisible();
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
/** The lead's bar on one of its three screens: the three tabs, each an icon and a word, this screen's marked, at the foot of the screen below `above`. */
async function onBar(page:Page,current:string,above:ReturnType<Page['locator']>) {
  await expect(bar(page).getByRole('button')).toHaveText(['Races','Results','Day setup']);
  for(const name of ['Races','Results','Day setup']) {
    if(name===current) await expect(tab(page,name)).toHaveAttribute('aria-current','page');else await expect(tab(page,name)).not.toHaveAttribute('aria-current');
    await expect(tab(page,name).locator('svg')).toHaveCount(1);
  }
  await expect(bar(page)).toBeInViewport({ratio:1});
  // The bar stays at the bottom while the screen scrolls under it: at the end of the screen, `above` is clear of it.
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  const box=(await bar(page).boundingBox())!,over=(await above.boundingBox())!;
  expect(over.y+over.height,current).toBeLessThanOrEqual(box.y+0.5);
  expect(await lookProblems(page),current).toEqual([]);
}

test('a lead moves between Races, Results and Day setup by the bar at the bottom; deeper screens have the back arrow and no bar',async({openPhone,request},info)=>{
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
  // An event and a race page: no bar, and the back arrow names Results, then the event.
  await press(resultsCard(page,code));await title(page,event);
  await expect(bar(page)).toHaveCount(0);await expect(arrow(page)).toHaveAccessibleName('Back to Results');
  await press(page.getByRole('button',{name:`Open Heat ${race.number}`,exact:true}));await title(page,`Heat ${race.number}`);
  await expect(bar(page)).toHaveCount(0);await expect(arrow(page)).toHaveAccessibleName(`Back to ${event}`);
  await press(arrow(page));await title(page,event);await press(arrow(page));await title(page,'Results');
  // Results to Day setup in one tap, with no visit to Races.
  await press(tab(page,'Day setup'));await title(page,'Day setup');await expect(page).toHaveURL(/\/day$/);
  await expect(arrow(page)).toHaveCount(0);
  await expect(updated).toBeVisible();await onBar(page,'Day setup',updated);
  await page.screenshot({path:info.outputPath('day-setup.png')});
  for(const [row,screen] of [[/^Signed in today /,'Signed in today'],[/^Events /,'Events']] as const) {
    await press(page.getByRole('button',{name:row}));await title(page,screen);
    await expect(bar(page)).toHaveCount(0);await expect(arrow(page)).toHaveAccessibleName('Back to Day setup');
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
});
