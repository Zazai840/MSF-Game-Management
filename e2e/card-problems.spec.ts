import {back,expect,lookProblems,ownCode,ownEvent,ownName,press,recordRace,submitRace,test,writeCheckIn,writeOrder,writeTimes,type Page} from './fixtures.js';
/**
 * A problem on a lead's Races card is a large button in the shape of Confirm the medals: "Check Heat 1 · 1 time" opens
 * that race's page, "Decide the tie" the tie. One button per heat: a heat with more than one kind of problem counts
 * them ("Check Heat 1 · 3 problems"). Two buttons at most, then a line that counts the rest and opens the event
 * in Results. The card's status line and a final reason about the same problems give way to the buttons.
 */
const card=(page:Page,name:string)=>page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
const owner=()=>process.env.E2E_OWNER_TOKEN!;
const problems=(page:Page,name:string)=>card(page,name).locator('button.rz-btn--primary.rz-btn--block');

test('a kept wrong time is one button on the lead\'s card, in place of the status line and the final reason, and it opens the race page',async({openPhone,request},info)=>{
  const name=ownName('Card time'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','heats');
  const race=await recordRace(request,owner(),code,[2001,2002],[1600,1305]);
  const {page}=await openPhone(ownName('Card time lead'),{lead:true});
  await expect(problems(page,name)).toHaveText(['Check Heat 1 · 1 time']);
  await expect(card(page,name).locator('.rz-racecard__status')).toHaveCount(0);
  // The final waits on this same time: the button says it, so the line under the chips does not.
  await expect(card(page,name).locator('.rz-heat-reason')).toHaveCount(0);
  // The heat chips and "+ Final" stay.
  await expect(card(page,name).getByRole('button',{name:'Heat 1, saved',exact:true})).toBeVisible();
  const plusFinal=card(page,name).getByRole('button',{name:'Create the final from the fastest 6',exact:true});
  await expect(plusFinal).toHaveAttribute('aria-disabled','true');
  await plusFinal.dispatchEvent('click');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('card-problem-button.png'),fullPage:true});
  await press(problems(page,name));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${race.id}$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Heat 1',exact:true})).toBeVisible();
  await back(page,'Races');
  await expect(problems(page,name)).toHaveCount(1);
});

test('a heat with more than one kind of problem is one button that counts them and opens the race page',async({openPhone,request},info)=>{
  const name=ownName('Card kinds'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');
  // A kept wrong-section number, a runner added at the finish, and a kept wrong time: three kinds on Heat 1.
  await writeCheckIn(request,owner(),code,[3045,2001],[3045]);
  await writeOrder(request,owner(),code,[3045,2001,2002],{added:[2002]});
  await writeTimes(request,owner(),code,[1500,1300,1600],[1]);
  const {race}=await submitRace(request,owner(),code);
  const {page}=await openPhone(ownName('Card kinds lead'),{lead:true});
  await expect(problems(page,name)).toHaveText(['Check Heat 1 · 3 problems']);
  await expect(card(page,name).getByRole('button',{name:/ more$/})).toHaveCount(0);
  await expect(card(page,name).locator('.rz-racecard__status')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('card-problems-one-heat.png'),fullPage:true});
  await press(problems(page,name));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${race.id}$`));
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(3);
});

test('a card shows two problem buttons, one per heat, then a line that counts the rest and opens the event in Results',async({openPhone,request},info)=>{
  const name=ownName('Card more'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');
  // Three heats, each with a kept wrong time and no time shared between them.
  await recordRace(request,owner(),code,[2001,2002],[1600,1305]);await recordRace(request,owner(),code,[2003,2004],[1610,1315]);await recordRace(request,owner(),code,[2005,2006],[1620,1325]);
  const {page}=await openPhone(ownName('Card more lead'),{lead:true});
  await expect(problems(page,name)).toHaveCount(2);
  await expect(problems(page,name)).toHaveText([/^Check Heat \d · 1 time$/,/^Check Heat \d · 1 time$/]);
  const more=card(page,name).getByRole('button',{name:'1 more',exact:true});
  await expect(more).toBeVisible();
  await expect(card(page,name).locator('.rz-racecard__status')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('card-problems-more.png'),fullPage:true});
  await press(more);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
});

test('two ties on one event are one Decide the tie button, which opens the event in Results',async({openPhone,request})=>{
  const name=ownName('Card ties'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','heats');
  // Two times, each shared by a runner of Heat 1 and a runner of Heat 2.
  await recordRace(request,owner(),code,[2001,2002],[1000,1100]);await recordRace(request,owner(),code,[2003,2004],[1000,1100]);
  const {page}=await openPhone(ownName('Card ties lead'),{lead:true});
  await expect(problems(page,name)).toHaveText(['Decide the tie']);
  expect(await lookProblems(page)).toEqual([]);
  await press(problems(page,name));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
});
