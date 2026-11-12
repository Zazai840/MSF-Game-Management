import {ownName,ownCode,ownEvent,ownRelay,ownWristbands,back,backToRaces,deleteCurrentRace,enterTime,expect,expectToast,flowPost,lookProblems,openRace,openRelays,press,recordRace,runHeat,saveFinal,test,writeCheckIn,writeOrder,writeTeam,writeTimes,type Page} from './fixtures.js';
/**
 * One race, one page (spec #313): for a lead, a saved race is always its race page, whichever way it is opened, and
 * Back returns to where the lead came from. A race not in Results yet keeps the Race screen with its steps, and a
 * volunteer sees a saved race as before.
 */
const owner=()=>process.env.E2E_OWNER_TOKEN!;
const title=(page:Page,name:string)=>expect(page.getByRole('banner').getByRole('heading',{level:1,name,exact:true})).toBeVisible();
/** The race page of that race: its address, its title, its record, and no steps or heat chips. */
async function onRacePage(page:Page,code:string,raceId:string,name:string) {
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${raceId}$`));
  await title(page,name);
  await expect(page.getByRole('list',{name:'Current record',exact:true})).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Heats'})).toHaveCount(0);
}
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();

test('a lead opens a saved heat as its race page from a chip on Races, from a chip on another heat\'s Race screen and from a typed address, and Back returns to where the lead came from',async({openPhone,request},info)=>{
  const name=ownName('One page'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','heats');
  const saved=await recordRace(request,owner(),code,[2001,2002],[1200,1300]);
  // Heat 2 is not in Results yet: checked in only.
  const {race:open}=await writeCheckIn(request,owner(),code,[2003,2004]);
  const {page}=await openPhone(ownName('One page lead'),{lead:true});
  // From Races.
  await openRace(page,name);
  await onRacePage(page,code,saved.id,'Heat 1');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('saved-race-from-races.png'),fullPage:true});
  // Who saved each step is under Saved versions.
  await press(page.getByText(/^Saved versions \(\d+\)$/));
  await expect(page.getByRole('list',{name:'Saved versions',exact:true}).getByRole('listitem').first()).toBeVisible();
  // The race page took the Race screen's place in the history: one Back is Races, by the arrow and by the phone.
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true})).toBeVisible();
  await page.goBack();await races(page);
  await openRace(page,name);await onRacePage(page,code,saved.id,'Heat 1');
  await backToRaces(page);
  // A race not in Results yet keeps the Race screen with its steps.
  await openRace(page,name,'Girl Cubs','H2');
  await expect(page).toHaveURL(new RegExp(`/races/${open.id}$`));
  await expect(page.getByRole('tablist',{name:'Heat 2 steps'})).toBeVisible();
  // From Heat 2's Race screen, Heat 1's chip opens the race page; Back returns to Heat 2.
  await press(page.getByRole('navigation',{name:'Heats'}).getByRole('button',{name:/^Heat 1,/}));
  await onRacePage(page,code,saved.id,'Heat 1');
  await back(page,'Heat 2');
  await expect(page.getByRole('tablist',{name:'Heat 2 steps'})).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/races/${open.id}$`));
  // A typed Race screen address: the race page, and with no history its arrow goes up to the event.
  await page.goto(`/races/${saved.id}`);
  await onRacePage(page,code,saved.id,'Heat 1');
  await back(page,`${name} · Girl Cubs`);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await deleteCurrentRace(request,code);
});

test('on the Race screen of a race not in Results yet a lead presses the three dots, sees only Delete, and deletes the race',async({openPhone,request},info)=>{
  const name=ownName('Dots delete'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','heats');
  const {race}=await writeCheckIn(request,owner(),code,[2021,2022]);
  const {page}=await openPhone(ownName('Dots delete lead'),{lead:true});
  await openRace(page,name);
  await expect(page).toHaveURL(new RegExp(`/races/${race.id}$`));
  await press(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true}));
  const actions=page.getByRole('dialog',{name:'Heat 1 · actions',exact:true});
  await expect(actions.getByText('Heat 1 is not saved yet. Finish its steps on this screen first.',{exact:true})).toBeVisible();
  // Only Delete: no correction, no Re-run, no Open.
  await expect(actions.locator('.rz-sheet__actions').getByRole('button')).toHaveText(['Delete Heat 1']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('unsaved-race-actions.png'),fullPage:true});
  await press(actions.getByRole('button',{name:'Delete Heat 1',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/races/${race.id}/delete$`));
  await title(page,'Delete race');
  expect(await lookProblems(page)).toEqual([]);
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 1',exact:true}));
  // The delete goes back past the race to Races, with its toast; the race is gone from its card.
  await races(page);
  await expectToast(page,'Heat 1 moved to Deleted races');
  await expect(page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true}).getByRole('button',{name:/^Heat 1,/})).toHaveCount(0);
});

test('a volunteer opens a saved heat as the Race screen, as before',async({openPhone,request})=>{
  const name=ownName('One page volunteer'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','heats');
  const saved=await recordRace(request,owner(),code,[2011,2012],[1200,1300]);
  const {page}=await openPhone(ownName('One page timer'),{job:'timer'});
  await openRace(page,name);
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/races/${saved.id}$`));
  await expect(page.getByRole('navigation',{name:'Heats'})).toBeVisible();
});

test('the Race screen a lead has open changes to the race page when the race saves itself, and Undo on the lead\'s own saved toast brings the Race screen back at that step',async({openPhone,request},info)=>{
  const name=ownName('One page live'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {race}=await writeCheckIn(request,owner(),code,[2021,2022]);
  await flowPost(request,owner(),`/api/races/${race.id}/steps/runners/done`,{});
  await writeOrder(request,owner(),code,[2021,2022]);
  await flowPost(request,owner(),`/api/races/${race.id}/steps/positions/done`,{});
  const {page}=await openPhone(ownName('One page live lead'),{lead:true});
  await openRace(page,name);
  const tabs=page.getByRole('tablist',{name:'Heat 1 steps'});
  await expect(tabs).toBeVisible();
  // The Timer types the times and marks them done on another phone: the race is saved.
  await writeTimes(request,owner(),code,[1200,1300]);
  await flowPost(request,owner(),`/api/races/${race.id}/steps/times/done`,{});
  await onRacePage(page,code,race.id,'Heat 1');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('saved-while-open.png'),fullPage:true});
  await backToRaces(page);
  // The lead's own last mark: a second heat, saved by its last time, lands on Races with the toast.
  const second=(await writeCheckIn(request,owner(),code,[2023])).race;
  await flowPost(request,owner(),`/api/races/${second.id}/steps/runners/done`,{});
  await writeOrder(request,owner(),code,[2023]);
  await flowPost(request,owner(),`/api/races/${second.id}/steps/positions/done`,{});
  await openRace(page,name,'Girl Cubs','H2');
  const steps=page.getByRole('tablist',{name:'Heat 2 steps'});
  await press(steps.getByRole('tab',{name:/^Times/}));
  await enterTime(page,'1400');
  await races(page);
  await expect(page.locator('.rz-toast')).toHaveText('Times savedUndo');
  // Undo un-saves the race: the Race screen again, at Times.
  await press(page.locator('.rz-toast').getByRole('button',{name:'Undo',exact:true}));
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(steps.getByRole('tab',{name:/^Times/})).toHaveAttribute('aria-selected','true');
  await expect(page).toHaveURL(new RegExp(`/races/${second.id}$`));
  expect(await lookProblems(page)).toEqual([]);
  await deleteCurrentRace(request,code);
});

test('a saved final and a saved relay heat open as their race pages for a lead',async({openPhone,request},info)=>{
  const name=ownName('One page final'),code=await ownCode(),relay=ownName('One page relay'),relayCode=await ownCode(),w=await ownWristbands('Girl Cubs',4);
  await ownEvent(request,code,name,'Girl Cubs','heats');
  await recordRace(request,owner(),code,[2031,2032],[1200,1300]);
  await saveFinal(request,code,[2032,2031]);
  await ownRelay(relayCode,relay,'Girl Cubs');
  await writeTeam(request,owner(),relayCode,[w(1),w(2),w(3),w(4)]);
  const heat=await runHeat(request,owner(),relayCode,1);
  const {page}=await openPhone(ownName('One page final lead'),{lead:true});
  await openRace(page,name,'Girl Cubs','Final');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/[^/]+$`));
  await title(page,'Final');
  await expect(page.getByRole('list',{name:'Current record',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('saved-final.png'),fullPage:true});
  await backToRaces(page);
  await openRelays(page);
  await openRace(page,relay);
  await onRacePage(page,relayCode,heat.race.id,'Heat 1');
  expect(await lookProblems(page)).toEqual([]);
  await backToRaces(page);
});
