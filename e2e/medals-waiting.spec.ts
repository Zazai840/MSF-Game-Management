import {back,confirmTheMedals,ownName,expect,expectToast,live,lookProblems,medalPlaces,ownCode,ownEvent,ownWristbands,press,recordRace,saveFinal,test,writeCheckIn,type Page} from './fixtures.js';
/**
 * Medals waiting on the lead: once an event's medals wait on the lead's Confirm in Results (Final complete, or Event
 * complete on a timed event), the lead's Races home lists it in Action required saying so, with Confirm the medals, which
 * opens the Confirm the medals screen; Back returns to Races. After the Confirm the lead is back on Races with the toast
 * and the card is in Done as "Medals decided". Volunteers see no change.
 */
const card=(page:Page,name:string)=>page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
const status=(page:Page,name:string)=>card(page,name).locator('.rz-racecard__status');
const section=(page:Page,heading:string)=>page.locator(`h2:text-is("${heading}") ~ article`);
const owner=()=>process.env.E2E_OWNER_TOKEN!;

/** Confirms the medals on their screen, lands back on Races with the toast and finds the card in Done as Medals decided. */
async function confirmAndFindDone(page:Page,name:string) {
  await confirmTheMedals(page);
  await expectToast(page,`Medals confirmed`);
  await expect(page).toHaveURL(/\/$/);
  const done=page.locator('details',{hasText:/^Done \(\d+\)/});
  await done.locator('summary').click();
  await expect(done.getByRole('article',{name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(status(page,name)).toHaveText('Medals decided');
  await expect(card(page,name).getByRole('button',{name:'Confirm the medals',exact:true})).toHaveCount(0);
}

test('a saved 60m final waits in the lead\'s Action required; Confirm the medals opens its screen, Fix opens Correct finishing order and returns, and the card moves to Done',async({openPhone,request},info)=>{
  const name=ownName('Medals final'),code=await ownCode(),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name);
  await recordRace(request,owner(),code,[w(1),w(2)],[1100,1200]);
  await saveFinal(request,code,[w(2),w(1)]);
  const volunteer=(await openPhone(ownName('Medals final start'))).page;
  const {page}=await openPhone(ownName('Medals final lead'),{lead:true});
  await expect(section(page,'Action required').filter({hasText:name})).toHaveCount(1);
  await expect(status(page,name)).toHaveText('Final saved · confirm the medals');
  await expect(card(page,name).getByRole('button',{name:/^Final/})).toHaveAccessibleName('Final, saved');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-waiting.png'),fullPage:true});
  // A volunteer's card is as before: done, under In progress, with no confirm.
  await expect(section(volunteer,'In progress').filter({hasText:name})).toHaveCount(1);
  await expect(status(volunteer,name)).toHaveText('Heat 1 and the final done');
  await expect(card(volunteer,name).getByRole('button',{name:'Confirm the medals',exact:true})).toHaveCount(0);
  await press(card(page,name).getByRole('button',{name:'Confirm the medals',exact:true}));
  // The screen, at its own address, in the race-flow frame: nothing to settle, the final's medal places, each with Fix.
  await expect(page).toHaveURL(new RegExp(`/results/${code}/confirm-the-medals$`));
  // The bar names the action; the event is named in the body, and is the back arrow's fallback.
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Confirm the medals',exact:true})).toBeVisible();
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · 1 heat · final`);
  await expect(page.getByRole('heading',{name:'Settle first',exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(medalPlaces(page)).toHaveText([new RegExp(`^1${w(2)}Final\\s*Fix$`),new RegExp(`^2${w(1)}Final\\s*Fix$`),/^3-$/]);
  await expect(page.getByText('A place is wrong? Tap Fix beside it.',{exact:true})).toBeVisible();
  await expect(page.locator('.rz-footer__reason')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('confirm-the-medals-final.png'),fullPage:true});
  // Back returns to Races.
  await back(page,'Races');
  await expect(page).toHaveURL(/\/$/);
  await press(card(page,name).getByRole('button',{name:'Confirm the medals',exact:true}));
  // Fix on a final's place opens the final straight on Correct finishing order; Back returns to the screen.
  await press(page.getByRole('button',{name:`Fix 1st: ${w(2)}`,exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/[^/]+/correct-finishing-order$`));
  await expect(page.getByRole('heading',{level:1,name:'Correct finishing order',exact:true})).toBeVisible();
  // The phone's Back returns to the screen as the back arrow would.
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Confirm the medals',exact:true})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/results/${code}/confirm-the-medals$`));
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true})).toBeVisible();
  await expect(medalPlaces(page).first()).toContainText(String(w(2)));
  await confirmAndFindDone(page,name);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-done.png'),fullPage:true});
});

test('a timed event waits on Event complete only while every race so far is saved, and moves to Done once confirmed',async({openPhone,request},info)=>{
  const name=ownName('Medals timed'),code=await ownCode(),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,owner(),code,[w(1)],[1200]);
  const {page}=await openPhone(ownName('Medals timed lead'),{lead:true});
  await expect(section(page,'Action required').filter({hasText:name})).toHaveCount(1);
  await expect(status(page,name)).toHaveText('Every race saved · confirm the medals after the last race');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('timed-waiting.png'),fullPage:true});
  // Another heat is running: the card waits on it, not on the lead.
  await writeCheckIn(request,owner(),code,[w(2)]);
  await expect(section(page,'In progress').filter({hasText:name})).toHaveCount(1,live);
  await expect(card(page,name).getByRole('button',{name:'Confirm the medals',exact:true})).toHaveCount(0);
  await recordRace(request,owner(),code,[w(2)],[1300]);
  await expect(status(page,name)).toHaveText('Every race saved · confirm the medals after the last race',live);
  await press(card(page,name).getByRole('button',{name:'Confirm the medals',exact:true}));
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · 2 heats · no final`);
  await expect(medalPlaces(page)).toHaveText([new RegExp(`^1${w(1)}Heat 1 · 12\\.00\\s*Fix$`),new RegExp(`^2${w(2)}Heat 2 · 13\\.00\\s*Fix$`),/^3-$/]);
  expect(await lookProblems(page)).toEqual([]);
  await confirmAndFindDone(page,name);
});
