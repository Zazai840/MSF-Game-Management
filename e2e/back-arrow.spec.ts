import {ownName,ownCode,becomeLead,expect,join,lookProblems,openLeadMenu,openRace,ownEvent,press,recordRace,test,type Page} from './fixtures.js';

const arrow=(page:Page)=>page.getByRole('banner').getByRole('button',{name:/^Back to /});
async function onRaces(page:Page) {
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(arrow(page)).toHaveCount(0);
}
/**
 * A lead screen: its address, its title in the lead header, and the back arrow naming in gold the screen it goes to,
 * at the left of the header and 44px to tap. The job chip shows on every lead screen.
 */
async function onScreen(page:Page,address:string|RegExp,title:string,to:string) {
  await expect(page).toHaveURL(typeof address==='string'?new RegExp(`${address.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`):address);
  const header=page.getByRole('banner');
  await expect(header.getByRole('heading',{level:1,name:title,exact:true})).toBeVisible();
  const back=header.getByRole('button',{name:`Back to ${to}`,exact:true});
  await expect(back).toHaveText(to);
  const box=(await back.boundingBox())!,title1=(await header.getByRole('heading',{level:1}).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeLessThan(page.viewportSize()!.width/4);
  expect(box.y+box.height/2).toBeLessThan(title1.y+title1.height/2);
  await expect(header.getByRole('button',{name:/^Your job: .*\. Change job$/})).toBeVisible();
}
/** The phone's Back and the back arrow land on the same screen: Back, then forward again, then the arrow. */
async function bothGoBack(page:Page,check:()=>Promise<void>) {
  const here=page.url();
  await page.goBack();await check();
  await page.goForward();await expect(page).toHaveURL(here);
  await press(arrow(page));await check();
}

test('Races has no back arrow; a race goes back to Races',async({page,request},info)=>{
  const name=ownName('Back arrow heat'),code=await ownCode();
  await ownEvent(request,code,name);
  await page.goto('/');await join(page,ownName('Back arrow volunteer'),{job:'Start line'});
  await onRaces(page);
  await request.post('/api/races',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{eventCode:code,kind:'heat',number:1}});
  // A race's back link sits at the left of its app bar, 44px to tap.
  await openRace(page,name);
  const link=page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true}),box=(await link.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeLessThan(page.viewportSize()!.width/4);
  await page.screenshot({path:info.outputPath('race.png')});
  await link.click();await onRaces(page);
});

test('each lead screen has its address; the phone\'s Back and the back arrow go to the screen the lead came from, also after a reload',async({page,request},info)=>{
  const code=await ownCode(),name=ownName('Back walk sprint'),event=`${name} · Girl Cubs`;
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2021,2022],[1600,1305]);
  await page.goto('/');await join(page,ownName('Back walk lead'),{job:'Start line'});await becomeLead(page,'e2e-owner-fixture');
  const results=()=>onScreen(page,'/results','Results','Races');
  const eventPage=()=>onScreen(page,`/results/${code}/heats`,event,'Results');
  await openLeadMenu(page,'Results');await results();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('results.png')});
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();await eventPage();
  await expect(page.getByRole('banner').getByText(code,{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('event.png')});
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  const racePage=()=>onScreen(page,new RegExp(`/results/${code}/races/[^/]+$`),'Heat 1',event);
  await racePage();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('race-page.png')});
  // A reload stays on the race page, and Back still goes where it went before.
  await page.reload();await racePage();
  await bothGoBack(page,eventPage);
  await bothGoBack(page,results);
  await bothGoBack(page,()=>onRaces(page));
  // The avatar menu keeps Results, Day setup and Log out.
  await page.getByRole('button',{name:/: Results, Day setup and Log out$/}).click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Results','Day setup','Log out']);
  await page.getByRole('menu').getByRole('menuitem',{name:'Day setup',exact:true}).click();
  const day=()=>onScreen(page,'/day','Day setup','Races');
  await day();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:/^Events /}).click();await onScreen(page,'/day/events','Events','Day setup');
  await bothGoBack(page,day);
  await page.getByRole('button',{name:/^Phones /}).click();await onScreen(page,'/day/signed-in-today','Signed in today','Day setup');
  expect(await lookProblems(page)).toEqual([]);
  // The job chip opens the job sheet on a lead screen too.
  await press(page.getByRole('banner').getByRole('button',{name:'Your job: Zone lead. Change job',exact:true}));
  await expect(page.getByRole('radiogroup',{name:'Your job'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.keyboard.press('Escape');await expect(page.getByRole('radiogroup',{name:'Your job'})).toHaveCount(0);
  await bothGoBack(page,day);
  await bothGoBack(page,()=>onRaces(page));
});

test('a lead screen opened at its address with no history goes up one level: a race page to its event\'s Races tab, then Results, then Races',async({page,request})=>{
  const code=await ownCode(),name=ownName('Back up sprint'),event=`${name} · Girl Cubs`;
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {id:raceId}=await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2031],[1500]);
  await page.goto('/');await join(page,ownName('Back up lead'),{job:'Start line'});await becomeLead(page,'e2e-owner-fixture');
  await page.goto(`/results/${code}/races/${raceId}`);
  await onScreen(page,`/results/${code}/races/${raceId}`,'Heat 1',event);
  await press(arrow(page));await onScreen(page,`/results/${code}/races`,event,'Results');
  await press(arrow(page));await onScreen(page,'/results','Results','Races');
  await press(arrow(page));await onRaces(page);
  await page.goto('/day/signed-in-today');await onScreen(page,'/day/signed-in-today','Signed in today','Day setup');
  await press(arrow(page));await onScreen(page,'/day','Day setup','Races');
  await press(arrow(page));await onRaces(page);
});
