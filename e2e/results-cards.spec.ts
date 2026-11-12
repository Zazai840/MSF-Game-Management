import {eventTab,ownName,ownEvent,ownCode,recordRace,writeCheckIn,back,openLeadMenu,becomeLead,expect,join,lookProblems,notStartedCard,press,resultsCard,test,type Page} from './fixtures.js';

const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
/** The design system's event grid colours: a navy Done card, a cream Running card (navy ring), a see-through Not started card (dashed). */
const colours={done:'rgb(30, 43, 81)',running:'rgb(251, 247, 238)',notStarted:'rgba(0, 0, 0, 0)'};
const background=(card:ReturnType<Page['getByRole']>)=>card.evaluate(element=>getComputedStyle(element).backgroundColor);
/** Five events: one Done, a timed one with a wrong time and a heats one with a wristband to check (both in Action required), one running with nothing to check, one not started and switched off. */
async function events(page:Page,name:string,codes:Record<"D"|"R"|"H"|"U"|"N",string>) {
  const add=(code:string,section:string,format:"heats"|"timed")=>ownEvent(page.request,code,name,section,format);
  await add(`${codes.D}`,'Girl Cubs','timed');await add(`${codes.R}`,'Boy Cubs','timed');await add(`${codes.H}`,'Girl Scouts','heats');await add(`${codes.U}`,'Boy Beavers','heats');await add(`${codes.N}`,'Boy Scouts','timed');
  expect((await page.request.post(`/api/day/events/${codes.N}/enabled`,{headers:headers(),data:{enabled:false}})).ok()).toBe(true);
  const token=process.env.E2E_OWNER_TOKEN!;
  const done=await recordRace(page.request,token,`${codes.D}`,[2001,2002],[1000,1100],[2001,2002]);
  expect((await page.request.post(`/api/lead/events/${codes.D}/complete-stage`,{headers:headers(),data:{stage:'event'}})).ok()).toBe(true);
  const running=await recordRace(page.request,token,`${codes.R}`,[1001,1002],[1600,1305],[1001,1002]);
  const heats=[await recordRace(page.request,token,`${codes.H}`,[3001],[1200],[3001]),(await writeCheckIn(page.request,token,`${codes.H}`,[3002],[3002])).race as {id:string}];
  const quiet=[await recordRace(page.request,token,`${codes.U}`,[51,52],[1200,1300]),(await writeCheckIn(page.request,token,`${codes.U}`,[53,54])).race as {id:string}];
  return [done,running,...heats,...quiet];
}
const cleanUp=async(page:Page,races:{id:string}[])=>{for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:headers(),data:{permanent:true}});};

test('Results puts Action required first, then Running and Done, each card in its Races card\'s words with its code, and the events with no races in one closed line',async({page},info)=>{
  const name=ownName('Cards'),codes={D:await ownCode(),R:await ownCode(),H:await ownCode(),U:await ownCode(),N:await ownCode()},races=await events(page,name,codes);
  try {
    await page.goto('/');await join(page,ownName('Cards lead'),{job:'Start line'});await becomeLead(page);
    // Races says it first: Results must say the same, and hold the same events in Action required.
    const racesCard=(section:string)=>page.getByRole('article',{name:`${name} · ${section}`,exact:true}),racesWords=(section:string)=>racesCard(section).locator('.rz-racecard__status');
    await expect(racesWords('Boy Cubs')).toHaveText('Heat 1: 1 time to check');
    await expect(racesWords('Girl Scouts')).toHaveText('Heat 1: 1 wristband to check');
    await expect(racesWords('Boy Beavers')).toHaveText(/Heat 2/);
    const words={R:await racesWords('Boy Cubs').innerText(),H:await racesWords('Girl Scouts').innerText(),U:await racesWords('Boy Beavers').innerText()};
    const racesOrder=await page.locator('main').locator('h2.rz-section,article.rz-racecard').evaluateAll(nodes=>nodes.map(node=>node.tagName==='H2'?node.textContent:node.getAttribute('aria-label')));
    const actionOnRaces=racesOrder.slice(racesOrder.indexOf('Action required')+1,racesOrder.indexOf('In progress'));
    expect(actionOnRaces).toEqual(expect.arrayContaining([`${name} · Boy Cubs`,`${name} · Girl Scouts`]));
    expect(actionOnRaces).not.toContain(`${name} · Boy Beavers`);
    await openLeadMenu(page,'Results');
    await expect(page.getByRole('list',{name:'Key'})).toHaveCount(0);
    await expect(page.getByRole('heading',{level:2,name,exact:true})).toHaveCount(0);
    await expect(page.locator('main').locator('h2.rz-section,summary')).toHaveText(['Action required','Running','Done',/^Not started \(\d+\)$/]);
    const section=(title:string)=>page.getByRole('region',{name:title,exact:true}),card=(code:string)=>resultsCard(page,code);
    await expect(section('Action required').getByRole('button').filter({hasText:name})).toHaveText([`${name} · Boy Cubs${codes.R}${words.R}`,`${name} · Girl Scouts${codes.H}${words.H}`]);
    await expect(section('Running').getByRole('button').filter({hasText:name})).toHaveText([`${name} · Boy Beavers${codes.U}${words.U}`]);
    await expect(section('Done').getByRole('button').filter({hasText:name})).toHaveText([new RegExp(`^${name} · Girl Cubs${codes.D}Medals decidedLatest note \\d\\d:\\d\\d$`)]);
    await expect(card(codes.D).locator('.rz-event__status svg')).toBeVisible();
    expect(await background(card(codes.D))).toBe(colours.done);
    expect(await background(card(codes.R))).toBe(colours.running);
    expect(await background(card(codes.H))).toBe(colours.running);
    expect(await background(card(codes.U))).toBe(colours.running);
    if(info.project.name==='desktop') expect((await section('Action required').getByRole('list').boundingBox())!.width,'the wide card grid on a laptop').toBeGreaterThan(900);
    await expect(page.locator('.rz-refresh')).toHaveText(/^Updated at \d\d:\d\d:\d\d Refresh$/);
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await expect(card(codes.R)).toContainText(words.R);
    await section('Action required').scrollIntoViewIfNeeded();
    expect(await lookProblems(page)).toEqual([]);
    await page.screenshot({path:info.outputPath('results-cards.png'),fullPage:true});

    // The events with no races: one closed line with their count; opened, their cards.
    const notStarted=page.locator('details').filter({has:page.locator('summary',{hasText:/^Not started \(\d+\)$/})});
    await expect(card(codes.N)).toBeHidden();
    await expect(await notStartedCard(page,codes.N)).toHaveText(`${name} · Boy Scouts${codes.N}No races yet · Switched off`);
    expect(await background(card(codes.N))).toBe(colours.notStarted);
    await expect(notStarted.locator('summary')).toHaveText(`Not started (${await notStarted.getByRole('button').count()})`);
    await card(codes.N).scrollIntoViewIfNeeded();
    expect(await lookProblems(page)).toEqual([]);
    await page.screenshot({path:info.outputPath('results-not-started.png'),fullPage:true});
    await press(card(codes.N));
    await expect(page.getByRole('heading',{level:1,name:`${name} · Boy Scouts`,exact:true})).toBeVisible();
    await back(page,'Results');

    await card(codes.R).click();
    await expect(page.getByRole('button',{name:'Back to Results',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{level:1,name:`${name} · Boy Cubs`,exact:true})).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/to check|needing you/i);
    await page.screenshot({path:info.outputPath('results-event.png'),fullPage:true});
    await eventTab(page,'Heats');
    await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
    await expect(page.getByRole('button',{name:`Back to ${name} · Boy Cubs`,exact:true})).toBeVisible();
    await back(page,`${name} · Boy Cubs`);
    await expect(page.getByRole('button',{name:'Open Heat 1',exact:true})).toBeVisible();
    await back(page,'Results');
    await expect(section('Action required')).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button',{name:/^Back to /})).toHaveCount(0);
  } finally {await cleanUp(page,races);}
});

test('a section with no events does not show',async({page})=>{
  const code=await ownCode(),name=ownName('Only running'),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(page.request,code,name,'Boy Scouts');
  const races=[await recordRace(page.request,token,code,[3061,3062],[1200,1300]),(await writeCheckIn(page.request,token,code,[3063,3064])).race as {id:string}];
  try {
    // Other tests' events share the day: the list is cut down to this test's one running event.
    await page.route('**/api/lead/results',async route=>{
      const response=await route.fetch(),read=await response.json() as {groups:Array<{events:Array<{event:{code:string}}>}>};
      await route.fulfill({response,json:{...read,groups:read.groups.map(group=>({...group,events:group.events.filter(item=>item.event.code===code)}))}});
    });
    await page.addInitScript(owner=>localStorage.setItem('msf:token',owner),token);
    await page.goto('/results');
    await expect(resultsCard(page,code)).toBeVisible();
    await expect(page.locator('main').locator('h2,summary')).toHaveText(['Running']);
    expect(await lookProblems(page)).toEqual([]);
  } finally {await cleanUp(page,races);}
});

test('a running card whose line wraps keeps its state dot round',async({page})=>{
  const code=await ownCode(),name=ownName('Dot'),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(page.request,code,name,'Boy Scouts');
  const races=[await recordRace(page.request,token,code,[3051,3052],[1200,1300]),(await writeCheckIn(page.request,token,code,[3053,3054])).race as {id:string}];
  try {
    await page.addInitScript(owner=>localStorage.setItem('msf:token',owner),token);
    await page.goto('/results');
    const line=resultsCard(page,code).locator('.rz-event__status').first();
    await expect(line).toContainText('Heat 2');
    const {dot,lines}=await line.evaluate(element=>{const dot=getComputedStyle(element,'::before');return {dot:[dot.width,dot.height],lines:Math.round(element.getBoundingClientRect().height/parseFloat(getComputedStyle(element).lineHeight))};});
    expect(lines,'the line wraps on a phone').toBeGreaterThan(test.info().project.name==='desktop'?0:1);
    expect(dot).toEqual(['8px','8px']);
  } finally {await cleanUp(page,races);}
});
