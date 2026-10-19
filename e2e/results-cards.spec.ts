import { checkIn,recordRace,steps,trailBack,openDashboard,becomeLead,expect,createProfile,test,type Page } from './fixtures.js';

const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
const colours={
  done:{background:'rgb(227, 241, 232)',border:'rgb(47, 107, 71)'},
  running:{background:'rgb(255, 255, 255)',border:'rgb(27, 42, 81)'},
  notStarted:{background:'rgb(233, 236, 242)',border:'rgb(195, 202, 217)'}
};
async function look(card:ReturnType<Page['getByRole']>) {
  return card.evaluate(element=>{const style=getComputedStyle(element);return {background:style.backgroundColor,border:style.borderTopColor};});
}
/** Four events in one group: one Done, one timed and one heats event running, one not started. The running timed race has a wrong time, so To check has an item for it. */
async function events(page:Page,name:string,prefix:string) {
  const add=async(code:string,section:string,format:'heats'|'timed')=>page.request.post('/api/day/events',{headers:headers(),data:{code,name,section,format}});
  await add(`${prefix}D`,'Girl Cubs','timed');await add(`${prefix}R`,'Boy Cubs','timed');await add(`${prefix}H`,'Girl Scouts','heats');await add(`${prefix}N`,'Boy Scouts','timed');
  await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  const token=process.env.E2E_SCORING_TOKEN!;
  const done=await recordRace(page.request,token,`${prefix}D`,[2001,2002],[1000,1100],[2001,2002]);
  expect((await page.request.post(`/api/lead/events/${prefix}D/complete-stage`,{headers:headers(),data:{stage:'event'}})).ok()).toBe(true);
  const running=await recordRace(page.request,token,`${prefix}R`,[1001,1002],[1600,1305],[1001,1002]);
  const heats=[await checkIn(page.request,token,`${prefix}H`,[3001],[3001]),await checkIn(page.request,token,`${prefix}H`,[3002],[3002])];
  return [done,running,...heats];
}
const cleanUp=async(page:Page,races:{id:string}[])=>{for(const race of races) await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:headers(),data:{permanent:true}});};

test('Results shows each event as a card coloured by its state, with a legend and no to-check counts',async({page},info)=>{
  const name=`Cards ${info.project.name}`,prefix=`RC${info.project.name.slice(0,1).toUpperCase()}`,races=await events(page,name,prefix);
  try {
    await page.goto('/');await createProfile(page,`Cards lead ${info.project.name}`);await becomeLead(page);
    expect((await(await page.request.get('/api/lead',{headers:headers()})).json()).needsYou.some((item:any)=>item.event.code===`${prefix}R`)).toBe(true);
    await openDashboard(page,'Results');
    const legend=page.getByRole('list',{name:'Card colours'});
    for(const label of ['Done','Running','Not started']) await expect(legend.getByText(label,{exact:true})).toBeVisible();
    const group=page.getByRole('region',{name});
    await expect(group.getByRole('heading',{level:2,name,exact:true})).toBeVisible();
    const card=(code:string)=>group.getByRole('button',{name:new RegExp(`^${code} · `)});
    await expect(card(`${prefix}D`)).toContainText(`${prefix}D · Girl Cubs`);
    await expect(card(`${prefix}D`)).toContainText('Done · medals decided');
    await expect(card(`${prefix}D`).locator('svg')).toBeVisible();
    await expect(card(`${prefix}R`)).toContainText('Running · 1 race');
    await expect(card(`${prefix}H`)).toContainText('Heats running · 2 races');
    await expect(card(`${prefix}N`)).toContainText('Not started');
    expect(await look(card(`${prefix}D`))).toEqual(colours.done);
    expect(await look(card(`${prefix}R`))).toEqual(colours.running);
    expect(await look(card(`${prefix}H`))).toEqual(colours.running);
    expect(await look(card(`${prefix}N`))).toEqual(colours.notStarted);
    const results=page.locator('.results-view');
    await expect(results).not.toContainText(/to check|needing you/i);
    await expect(page.locator('.badge')).toHaveCount(0);
    await group.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('results-cards.png'),fullPage:true});

    await card(`${prefix}R`).click();
    await expect(steps(page)).toHaveText(new RegExp(`Results\\s*›\\s*${name} Boy Cubs$`));
    await expect(page.getByRole('button',{name:/^Back to event/})).toHaveCount(0);
    await expect(page.getByText('Running · 1 race',{exact:true})).toBeVisible();
    await expect(results).not.toContainText(/to check|needing you/i);
    await page.screenshot({path:info.outputPath('results-event.png'),fullPage:true});
    await page.getByRole('button',{name:'Open Race 1',exact:true}).click();
    await expect(steps(page)).toContainText('Race 1');
    await expect(page.getByRole('button',{name:/^Back to event/})).toHaveCount(0);
    await trailBack(page,`${name} Boy Cubs`);
    await expect(page.getByRole('button',{name:'Open Race 1',exact:true})).toBeVisible();
    await trailBack(page,'Results');
    await expect(legend).toBeVisible();
    await expect(steps(page)).toHaveText(/^Home\s*›\s*Dashboard\s*›\s*Results$/);
  } finally {await cleanUp(page,races);}
});
