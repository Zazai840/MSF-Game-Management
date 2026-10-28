import {ownEvent,ownCode,recordRace,writeCheckIn,back,openLeadMenu,becomeLead,expect,join,test,type Page} from './fixtures.js';

const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
const colours={
  done:{background:'rgb(227, 241, 232)',border:'rgb(47, 107, 71)'},
  running:{background:'rgb(255, 255, 255)',border:'rgb(27, 42, 81)'},
  notStarted:{background:'rgb(233, 236, 242)',border:'rgb(195, 202, 217)'}
};
async function look(card:ReturnType<Page['getByRole']>) {
  return card.evaluate(element=>{const style=getComputedStyle(element);return {background:style.backgroundColor,border:style.borderTopColor};});
}
/** Four events in one group: one Done, one timed and one heats event running (Heat 1 saved, Heat 2 checking in), one not started. The running timed race has a wrong time, so To check has an item for it. */
async function events(page:Page,name:string,codes:Record<"D"|"R"|"H"|"N",string>) {
  const add=(code:string,section:string,format:"heats"|"timed")=>ownEvent(page.request,code,name,section,format);
  await add(`${codes.D}`,'Girl Cubs','timed');await add(`${codes.R}`,'Boy Cubs','timed');await add(`${codes.H}`,'Girl Scouts','heats');await add(`${codes.N}`,'Boy Scouts','timed');
  await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  const token=process.env.E2E_OWNER_TOKEN!;
  const done=await recordRace(page.request,token,`${codes.D}`,[2001,2002],[1000,1100],[2001,2002]);
  expect((await page.request.post(`/api/lead/events/${codes.D}/complete-stage`,{headers:headers(),data:{stage:'event'}})).ok()).toBe(true);
  const running=await recordRace(page.request,token,`${codes.R}`,[1001,1002],[1600,1305],[1001,1002]);
  const heats=[await recordRace(page.request,token,`${codes.H}`,[3001],[1200],[3001]),(await writeCheckIn(page.request,token,`${codes.H}`,[3002],[3002])).race as {id:string}];
  return [done,running,...heats];
}
const cleanUp=async(page:Page,races:{id:string}[])=>{for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:headers(),data:{permanent:true}});};

test('Results shows each event as a card coloured by its state, with a legend and no to-check counts',async({page},info)=>{
  const name=`Cards ${info.project.name}`,codes={D:await ownCode(),R:await ownCode(),H:await ownCode(),N:await ownCode()},races=await events(page,name,codes);
  try {
    await page.goto('/');await join(page,`Cards lead ${info.project.name}`,{job:'Start line'});await becomeLead(page);
    expect((await(await page.request.get('/api/lead',{headers:headers()})).json()).needsYou.some((item:any)=>item.event.code===`${codes.R}`)).toBe(true);
    await openLeadMenu(page,'Results');
    const legend=page.getByRole('list',{name:'Card colours'});
    for(const label of ['Done','Running','Not started']) await expect(legend.getByText(label,{exact:true})).toBeVisible();
    const group=page.getByRole('region',{name});
    await expect(group.getByRole('heading',{level:2,name,exact:true})).toBeVisible();
    const card=(code:string)=>group.getByRole('button',{name:new RegExp(`^${code} · `)});
    await expect(card(`${codes.D}`)).toContainText(`${codes.D} · Girl Cubs`);
    await expect(card(`${codes.D}`)).toContainText('Done · medals decided');
    await expect(card(`${codes.D}`).locator('svg')).toBeVisible();
    await expect(card(`${codes.R}`)).toContainText('Running · 1 race');
    await expect(card(`${codes.H}`)).toContainText('Heats running · 2 races');
    await expect(card(`${codes.N}`)).toContainText('Not started');
    expect(await look(card(`${codes.D}`))).toEqual(colours.done);
    expect(await look(card(`${codes.R}`))).toEqual(colours.running);
    expect(await look(card(`${codes.H}`))).toEqual(colours.running);
    expect(await look(card(`${codes.N}`))).toEqual(colours.notStarted);
    const results=page.locator('.results-view');
    await expect(results).not.toContainText(/to check|needing you/i);
    await expect(page.locator('.badge')).toHaveCount(0);
    await group.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('results-cards.png'),fullPage:true});

    await card(`${codes.R}`).click();
    await expect(page.getByRole('button',{name:'Back to Results',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:/^Back to event/})).toHaveCount(0);
    await expect(page.getByText('Running · 1 race',{exact:true})).toBeVisible();
    await expect(results).not.toContainText(/to check|needing you/i);
    await page.screenshot({path:info.outputPath('results-event.png'),fullPage:true});
    await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
    await expect(page.getByRole('button',{name:`Back to ${name} Boy Cubs`,exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:/^Back to event/})).toHaveCount(0);
    await back(page,`${name} Boy Cubs`);
    await expect(page.getByRole('button',{name:'Open Heat 1',exact:true})).toBeVisible();
    await back(page,'Results');
    await expect(legend).toBeVisible();
    await expect(page.getByRole('button',{name:'Back to Races',exact:true})).toBeVisible();
  } finally {await cleanUp(page,races);}
});
