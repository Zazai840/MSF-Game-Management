import {eventTab,ownName,ownCode,becomeLead,expect,join,leadMenuButton,lookProblems,openLeadMenu,openRace,ownEvent,ownWristbands,press,raceAction,recordRace,saveFinal,test,type Page} from './fixtures.js';

const arrow=(page:Page)=>page.getByRole('banner').getByRole('button',{name:/^Back to /});
async function onRaces(page:Page) {
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(arrow(page)).toHaveCount(0);
}
/**
 * A lead screen: its address, its title in the lead header, and the back arrow naming in gold the screen it goes to,
 * at the left of the header and 44px to tap. No lead screen has the job band.
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
  // The job band is on Races and on a race only.
  await expect(page.getByRole('button',{name:/Change job$/})).toHaveCount(0);
}
/** Results and Day setup: the address, the title and no back arrow. The lead's bar is the way to Races, and the phone's Back still works. */
async function onTop(page:Page,address:string,title:string) {
  await expect(page).toHaveURL(new RegExp(`${address}$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:title,exact:true})).toBeVisible();
  await expect(arrow(page)).toHaveCount(0);
  await expect(leadMenuButton(page).getByRole('button',{name:title,exact:true})).toHaveAttribute('aria-current','page');
}
const toRaces=(page:Page)=>press(leadMenuButton(page).getByRole('button',{name:'Races',exact:true}));
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

test('the full Back walk: on every lead screen and sheet the phone\'s Back and the back arrow go to the screen the lead came from, also after a reload',async({openPhone,request},info)=>{
  const owner=process.env.E2E_OWNER_TOKEN!,w=await ownWristbands('Girl Cubs',4);
  // A heats event with its final saved, so the medals wait on the lead.
  const code=await ownCode(),name=ownName('Back walk sprint'),event=`${name} · Girl Cubs`;
  await ownEvent(request,code,name);
  const {id:heat1}=await recordRace(request,owner,code,[w(1),w(2)],[1100,1200]);
  await saveFinal(request,code,[w(2),w(1)]);
  // A timed event whose two heats' runners tie on 10.00 (an open tie holds a heats event's final).
  const tieCode=await ownCode(),tieName=ownName('Back walk tie'),tieEvent=`${tieName} · Girl Cubs`;
  await ownEvent(request,tieCode,tieName,'Girl Cubs','timed');
  const {id:tieHeat}=await recordRace(request,owner,tieCode,[w(3)],[1000]);
  await recordRace(request,owner,tieCode,[w(4)],[1000]);
  const {page}=await openPhone(ownName('Back walk lead'),{lead:true});
  const races=()=>onRaces(page),results=()=>onTop(page,'/results','Results');
  const eventPage=(tab:string,at=code,title=event)=>onScreen(page,`/results/${at}/${tab}`,title,'Results');
  const tie=(to:string)=>onScreen(page,new RegExp(`/results/${tieCode}/ties/[^/]+$`),'Tie at 10.00',to);
  // Races' card opens Confirm the medals; Back returns to Races.
  await press(page.getByRole('article',{name:event,exact:true}).getByRole('button',{name:'Confirm the medals',exact:true}));
  await onScreen(page,`/results/${code}/confirm-the-medals`,event,'Races');
  await expect(page.getByRole('heading',{level:2,name:'Confirm the medals',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await bothGoBack(page,races);
  // The race screen's Open in Results opens the tie, and Back returns to the race.
  await openRace(page,tieName);
  const race=async()=>{await expect(page).toHaveURL(new RegExp(`/races/${tieHeat}$`));await expect(page.getByRole('tablist',{name:'Heat 1 steps'})).toBeVisible();};
  await page.getByRole('tablist',{name:'Heat 1 steps'}).getByRole('tab',{name:/^Times/}).click();
  await page.getByRole('alert').filter({hasText:'Runners tied on time'}).getByRole('button',{name:'Open in Results',exact:true}).click();
  await tie('Heat 1');
  await bothGoBack(page,race);
  await bothGoBack(page,races);
  // The lead's bar opens Results, which has no back arrow.
  await openLeadMenu(page,'Results');await results();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('results.png')});
  // The event opens on its Final tab; each tab has its own address, and its back arrow still goes to Results.
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();await eventPage('final');
  await expect(page.getByRole('banner').getByText(code,{exact:true})).toBeVisible();
  for(const tab of ['Heats','Notes','Final'] as const) {await eventTab(page,tab);await eventPage(tab.toLowerCase());expect(await lookProblems(page)).toEqual([]);}
  await page.screenshot({path:info.outputPath('event.png')});
  await bothGoBack(page,results);
  // A Heats tab's TIE tag opens the tie, which goes back to the tab; the runner sheet closes on Back and the tab stays.
  await page.getByRole('button',{name:new RegExp(`^${tieCode} · Girl Cubs`)}).click();await eventPage('heats',tieCode,tieEvent);
  await press(page.getByRole('button',{name:`TIE at 10.00 for ${w(3)}`,exact:true}));await tie(tieEvent);
  await bothGoBack(page,()=>eventPage('heats',tieCode,tieEvent));
  await bothGoBack(page,results);
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();await eventTab(page,'Heats');await eventPage('heats');
  const runner=page.getByRole('dialog',{name:`Runner ${w(2)}`,exact:true});
  await press(page.getByRole('button',{name:new RegExp(`${w(2)}.* · Heat 1$`)}));await expect(runner).toBeVisible();
  await page.goBack();await expect(runner).toHaveCount(0);await eventPage('heats');
  // The Races tab: a race page goes back to the tab, a correction to the race page, also after a reload on its address.
  await eventTab(page,'Heats');await press(page.getByRole('button',{name:'Open Heat 1',exact:true}));
  const racePage=()=>onScreen(page,`/results/${code}/races/${heat1}`,'Heat 1',event);
  await racePage();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('race-page.png')});
  await raceAction(page,'Correct times');
  const correction=()=>onScreen(page,`/results/${code}/races/${heat1}/correct-times`,'Correct times','Heat 1');
  await correction();
  await page.reload();await correction();
  await bothGoBack(page,racePage);
  await bothGoBack(page,()=>eventPage('heats'));
  await bothGoBack(page,results);
  await page.goBack();await races();
  // Day setup and its screens.
  await openLeadMenu(page,'Day setup');
  const day=()=>onTop(page,'/day','Day setup');
  await day();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:/^Events /}).click();
  const events=()=>onScreen(page,'/day/events','Events','Day setup');
  await events();
  await page.getByRole('button',{name:'Rename R4',exact:true}).click();await onScreen(page,'/day/events/R4/rename','Rename R4','Events');
  await bothGoBack(page,events);
  await page.getByRole('button',{name:'Add an event',exact:true}).click();await onScreen(page,'/day/events/new','Add an event','Events');
  await bothGoBack(page,events);
  await bothGoBack(page,day);
  await page.getByRole('button',{name:'Change Olympics password',exact:true}).click();await onScreen(page,'/day/olympics-password','Change Olympics password','Day setup');
  await bothGoBack(page,day);
  await page.getByRole('button',{name:/^Signed in today /}).click();await onScreen(page,'/day/signed-in-today','Signed in today','Day setup');
  expect(await lookProblems(page)).toEqual([]);
  await bothGoBack(page,day);
  await page.goBack();await races();
});

test('a lead screen opened at its address with no history goes up one level: a race page to its event\'s Races tab, then Results, where the lead\'s bar goes to Races',async({page,request})=>{
  const code=await ownCode(),name=ownName('Back up sprint'),event=`${name} · Girl Cubs`;
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {id:raceId}=await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2031],[1500]);
  await page.goto('/');await join(page,ownName('Back up lead'),{job:'Start line'});await becomeLead(page,'e2e-owner-fixture');
  await page.goto(`/results/${code}/races/${raceId}/correct-finishing-order`);
  await onScreen(page,`/results/${code}/races/${raceId}/correct-finishing-order`,'Correct finishing order','Heat 1');
  await press(arrow(page));await onScreen(page,`/results/${code}/races/${raceId}`,'Heat 1',event);
  await press(arrow(page));await onScreen(page,`/results/${code}/heats`,event,'Results');
  await press(arrow(page));await onTop(page,'/results','Results');
  await toRaces(page);await onRaces(page);
  await page.goto('/day/signed-in-today');await onScreen(page,'/day/signed-in-today','Signed in today','Day setup');
  await press(arrow(page));await onTop(page,'/day','Day setup');
  await toRaces(page);await onRaces(page);
  await page.goto('/day/olympics-password');await onScreen(page,'/day/olympics-password','Change Olympics password','Day setup');
  await press(arrow(page));await onTop(page,'/day','Day setup');
  await toRaces(page);await onRaces(page);  // Rename and Add an event go up to Events.
  await page.goto('/day/events/new');await onScreen(page,'/day/events/new','Add an event','Events');
  await press(arrow(page));await onScreen(page,'/day/events','Events','Day setup');
  await page.goto('/day/events/R4/rename');await onScreen(page,'/day/events/R4/rename','Rename R4','Events');
  await press(arrow(page));await onScreen(page,'/day/events','Events','Day setup');
});
