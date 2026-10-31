import {eventTab,ownName,ownEvent,ownCode,recordRace,writeCheckIn,back,openLeadMenu,becomeLead,expect,join,lookProblems,test,type Page} from './fixtures.js';

const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
/** The design system's event grid colours: a navy Done card, a cream Running card (navy ring), a see-through Not started card (dashed). */
const colours={done:'rgb(30, 43, 81)',running:'rgb(251, 247, 238)',notStarted:'rgba(0, 0, 0, 0)'};
const background=(card:ReturnType<Page['getByRole']>)=>card.evaluate(element=>getComputedStyle(element).backgroundColor);
/** Four events in one group: one Done, one timed and one heats event running (Heat 1 saved, Heat 2 checking in), one not started and switched off. The running timed race has a wrong time, so To check has an item for it. */
async function events(page:Page,name:string,codes:Record<"D"|"R"|"H"|"N",string>) {
  const add=(code:string,section:string,format:"heats"|"timed")=>ownEvent(page.request,code,name,section,format);
  await add(`${codes.D}`,'Girl Cubs','timed');await add(`${codes.R}`,'Boy Cubs','timed');await add(`${codes.H}`,'Girl Scouts','heats');await add(`${codes.N}`,'Boy Scouts','timed');
  expect((await page.request.post(`/api/day/events/${codes.N}/enabled`,{headers:headers(),data:{enabled:false}})).ok()).toBe(true);
  await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  const token=process.env.E2E_OWNER_TOKEN!;
  const done=await recordRace(page.request,token,`${codes.D}`,[2001,2002],[1000,1100],[2001,2002]);
  expect((await page.request.post(`/api/lead/events/${codes.D}/complete-stage`,{headers:headers(),data:{stage:'event'}})).ok()).toBe(true);
  const running=await recordRace(page.request,token,`${codes.R}`,[1001,1002],[1600,1305],[1001,1002]);
  const heats=[await recordRace(page.request,token,`${codes.H}`,[3001],[1200],[3001]),(await writeCheckIn(page.request,token,`${codes.H}`,[3002],[3002])).race as {id:string}];
  return [done,running,...heats];
}
const cleanUp=async(page:Page,races:{id:string}[])=>{for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:headers(),data:{permanent:true}});};

test('Results is the event grid: a key, events by distance, each card in its Races card\'s words, a switched-off event still marked',async({page},info)=>{
  const name=ownName('Cards'),codes={D:await ownCode(),R:await ownCode(),H:await ownCode(),N:await ownCode()},races=await events(page,name,codes);
  try {
    await page.goto('/');await join(page,ownName('Cards lead'),{job:'Start line'});await becomeLead(page);
    // Races says it first: Results must say the same.
    const racesWords=(section:string)=>page.getByRole('article',{name:`${name} · ${section}`,exact:true}).locator('.rz-racecard__status');
    await expect(racesWords('Boy Cubs')).toHaveText('Heat 1: 1 time to check');
    await expect(racesWords('Girl Scouts')).toHaveText('Heat 1: 1 wristband to check');
    const words={R:await racesWords('Boy Cubs').innerText(),H:await racesWords('Girl Scouts').innerText()};
    await openLeadMenu(page,'Results');
    const key=page.getByRole('list',{name:'Key'});
    await expect(key.getByRole('listitem')).toHaveText(['Done','Running','Not started']);
    const group=page.getByRole('region',{name});
    await expect(group.getByRole('heading',{level:2,name,exact:true})).toBeVisible();
    const card=(code:string)=>group.getByRole('button',{name:new RegExp(`^${code} · `)});
    await expect(card(codes.D)).toHaveText(new RegExp(`^${codes.D} · Girl CubsMedals decidedLatest note \\d\\d:\\d\\d$`));
    await expect(card(codes.D).locator('svg')).toBeVisible();
    await expect(card(codes.R)).toHaveText(`${codes.R} · Boy Cubs${words.R}`);
    await expect(card(codes.H)).toHaveText(`${codes.H} · Girl Scouts${words.H}`);
    await expect(card(codes.N)).toHaveText(`${codes.N} · Boy ScoutsNo races yet · Switched off`);
    expect(await background(card(codes.D))).toBe(colours.done);
    expect(await background(card(codes.R))).toBe(colours.running);
    expect(await background(card(codes.H))).toBe(colours.running);
    expect(await background(card(codes.N))).toBe(colours.notStarted);
    await expect(page.locator('.rz-refresh')).toHaveText(/^Updated at \d\d:\d\d:\d\d Refresh$/);
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await expect(card(codes.R)).toHaveText(`${codes.R} · Boy Cubs${words.R}`);
    await group.scrollIntoViewIfNeeded();
    expect(await lookProblems(page)).toEqual([]);
    await page.screenshot({path:info.outputPath('results-cards.png'),fullPage:true});

    await card(codes.R).click();
    await expect(page.getByRole('button',{name:'Back to Results',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{level:1,name:`${name} · Boy Cubs`,exact:true})).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/to check|needing you/i);
    await page.screenshot({path:info.outputPath('results-event.png'),fullPage:true});
    await eventTab(page,'Races');
    await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
    await expect(page.getByRole('button',{name:`Back to ${name} · Boy Cubs`,exact:true})).toBeVisible();
    await back(page,`${name} · Boy Cubs`);
    await expect(page.getByRole('button',{name:'Open Heat 1',exact:true})).toBeVisible();
    await back(page,'Results');
    await expect(key).toBeVisible();
    await expect(page.getByRole('button',{name:'Back to Races',exact:true})).toBeVisible();
  } finally {await cleanUp(page,races);}
});
