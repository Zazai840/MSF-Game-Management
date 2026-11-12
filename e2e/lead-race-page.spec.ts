import { clock } from '../src/shared/clock.js';
import {eventTab,ownName,ownEvent,ownCode,lookProblems,press,raceAction,recordRace,submitRace,writeCheckIn,writeOrder,writeTimes,ownRelay,ownWristbands,writeTeam,tickTeam,writeTeamOrder,becomeLead,expect,expectToast,selected,join,openLeadMenu,test,type Page,resultsCard} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
// The race flow's amber, on the race page and in Correct times.
const amber='rgb(255, 241, 199)',red='rgb(196, 30, 58)';
const created:string[]=[];
test.afterEach(async({request})=>{for(const id of created.splice(0)) await request.post(`/api/lead/races/${id}/delete`,{headers:headers(),data:{permanent:true}});});
/** A timed event with one race of these runners, finished in that order with these times; `keptWarnings` are the wristbands whose warnings the starter kept. */
async function recordedRace(page:Page,code:string,runners:number[],places:number[],keptWarnings?:number[],name='Race page') {
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,runners,places,keptWarnings);
  created.push(race.id);
  return race;
}
async function openRace(page:Page,code:string,name:string,number:number) {
  await page.goto('/');await join(page,name,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await press(resultsCard(page,code));
  await eventTab(page,'Heats');await press(page.getByRole('listitem').getByRole('button',{name:`Open Heat ${number}`,exact:true}));
}
const background=(element:{evaluate:(fn:(element:Element)=>string)=>Promise<string>})=>element.evaluate(element=>getComputedStyle(element).backgroundColor);

test('the race page is in the race-flow look: its meta line, a wrong time in amber with its reason, and "Correct or delete Heat 1" below the record opening Race actions with Delete red and last; Correct times retypes on the number pad',async({page},info)=>{
  const code=await ownCode(),race=await recordedRace(page,code,[2101,2102,2103],[1200,1100,1250]);
  await openRace(page,code,ownName('Wrong time lead'),race.number);
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:`Heat ${race.number}`,exact:true})).toBeVisible();
  await expect(page.getByText(`Race page · Girl Cubs · checked in ${clock(race.checkedInAt)} · saved`,{exact:true})).toBeVisible();
  const record=page.getByRole('list',{name:'Current record',exact:true});
  const second=page.getByRole('button',{name:'Runner 2102',exact:true});
  await expect(second).toContainText('Faster than 1st place');
  expect(await background(second)).toBe(amber);
  await expect(page.getByRole('button',{name:'Runner 2103',exact:true})).not.toContainText('Faster');
  await expect(page.getByText('3 times · 3 finishers',{exact:true})).toBeVisible();
  // A wrong time's amber outline must not nudge its row's content off the line the plain rows keep.
  expect(new Set(await record.getByText(/^(1st|2nd|3rd)$/).evaluateAll(places=>places.map(place=>place.getBoundingClientRect().left)))).toHaveProperty('size',1);
  await expect(page.getByText(/^Saved versions \(\d+\)$/)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-wrong-time.png'),fullPage:true});
  // No "⋯" in the header: a full-width button with words, below the record, opens the one Race actions sheet: the
  // corrections, Re-run, then a red Delete set apart at the end.
  await expect(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true})).toHaveCount(0);
  const corrections=page.getByRole('main').getByRole('button',{name:`Correct or delete Heat ${race.number}`,exact:true});
  const recordBox=(await record.boundingBox())!,button=(await corrections.boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(recordBox.y+recordBox.height);expect(button.width).toBe(recordBox.width);
  await press(corrections);
  const actions=page.getByRole('dialog',{name:`Heat ${race.number} · actions`,exact:true});
  await expect(actions.getByRole('button')).toHaveText(['','Correct times','Correct finishing order','Correct runner list','Re-run race',`Delete Heat ${race.number}`]);
  expect(await background(actions.getByRole('button',{name:`Delete Heat ${race.number}`,exact:true}))).toBe(red);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-actions.png'),fullPage:false});
  await press(actions.getByRole('button',{name:'Close',exact:true}));await expect(actions).toHaveCount(0);

  const racePage=page.url();
  await raceAction(page,'Correct times');
  await expect(page).toHaveURL(`${racePage}/correct-times`);
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Correct times',exact:true})).toBeVisible();
  // Nothing changed yet: the docked Save says why it cannot save, and no box (not even the comment) takes focus.
  const footer=page.getByRole('contentinfo'),save=footer.getByRole('button',{name:'Save times',exact:true});
  await expect(footer.getByText('Change a time to save.',{exact:true})).toBeVisible();await expect(save).toHaveAttribute('aria-disabled','true');
  await expect(page.getByLabel('Comment (optional)',{exact:true})).not.toBeFocused();await expect(page.locator('input:focus,textarea:focus')).toHaveCount(0);
  const wrongRow=page.getByRole('button',{name:'2nd place · 11.00 · Faster than 1st place',exact:true});
  expect(await background(wrongRow)).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('correct-times-wrong.png'),fullPage:true});
  await press(wrongRow);
  const input=page.getByLabel('2nd place time',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).toHaveAttribute('enterkeyhint','next');
  await expect(input).toBeFocused();
  // The race flow's one time box: the time itself, filling from the right, selected so typing replaces it.
  await expect(input).toHaveValue('11.00');await expect.poll(()=>selected(page,'2nd place time')).toBe('11.00');
  await expect(page.getByText('Type the digits on the timer. They fill from the right: 1 2 3 4 shows 12.34.',{exact:true})).toBeVisible();
  await expect(page.getByText(/Shows as|Digits only/)).toHaveCount(0);await expect(input).not.toHaveAttribute('placeholder');
  await input.pressSequentially('12.2-0');await expect(input).toHaveValue('12.20');
  await input.press('3');await input.press('Backspace');await expect(input).toHaveValue('12.20');
  await expect(input).toMatchAriaSnapshot('- textbox "2nd place time": "12.20"');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('correct-times-typing.png'),fullPage:false});
  await input.press('Enter');
  await expect(page.getByRole('button',{name:'2nd place · 12.20',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Accept these out-of-order times',exact:true})).toHaveCount(0);
  await expect(footer.locator('.rz-footer__reason')).toHaveCount(0);
  // Save lands back on the race page it was opened from, with one toast.
  await press(save);
  await expectToast(page,`Times saved · Girl Cubs Heat ${race.number}`);await expect(page).toHaveURL(racePage);
  await expect(second).toContainText('12.20');await expect(second).not.toContainText('Faster');
  expect(await background(second)).not.toBe(amber);
});

test('Correct times refuses a time no one can run in the amber callout under the time box, the digits selected, as the Timer does',async({page},info)=>{
  // The race's distance comes from its event name.
  const code=await ownCode(),race=await recordedRace(page,code,[2111,2112],[1200,1300],undefined,'60m race page');
  await openRace(page,code,ownName('Refusing lead'),race.number);
  const racePage=page.url();await raceAction(page,'Correct times');
  await press(page.getByRole('button',{name:'2nd place · 13.00',exact:true}));
  const input=page.getByLabel('2nd place time',{exact:true});
  await input.pressSequentially('21');await input.press('Enter');
  const refusal=page.getByRole('alert').filter({hasText:'0.21 is too fast for 60m race page. No one runs 60m in under 6.00. For 21 seconds, type 2100.'});
  await expect(refusal).toBeVisible();
  await expect(input).toBeFocused();await expect(input).toHaveValue('0.21');await expect.poll(()=>selected(page,'2nd place time')).toBe('0.21');
  expect((await refusal.boundingBox())!.y).toBeGreaterThan((await input.boundingBox())!.y);
  // The race flow's amber callout, and only the refusal: 0.21 would be out of order too, but it is no time at all.
  expect(await background(refusal)).toBe('rgb(255, 241, 199)');
  await expect(page.getByText(/Times are out of order/)).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('correct-times-refused.png'),fullPage:true});
  // The next digit replaces the refused digits, and the refusal goes.
  await input.pressSequentially('1');await expect(input).toHaveValue('0.01');await expect(refusal).toHaveCount(0);
  await input.pressSequentially('9234');await input.press('Enter');
  await expect(page.getByRole('alert').filter({hasText:'Seconds go up to 59, so 1:92.34 is not a time. Check the timer and type it again.'})).toBeVisible();
  // Save with refused digits in the box saves nothing: the refusal stays.
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Save times',exact:true}));
  await expect(page).toHaveURL(`${racePage}/correct-times`);await expect(page.getByRole('alert').filter({hasText:'Seconds go up to 59'})).toBeVisible();
  await input.pressSequentially('1350');await input.press('Enter');
  await expect(page.getByRole('button',{name:'2nd place · 13.50',exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Save times',exact:true}));
  await expectToast(page,`Times saved · Girl Cubs Heat ${race.number}`);await expect(page).toHaveURL(racePage);
});

test('a slow time the timer kept shows in amber with its reason on the race page and in Correct times, as on the Timer',async({page},info)=>{
  // 45.00 is slower than 1.5 m/s for 60m (over 40.00).
  const code=await ownCode(),race=await recordedRace(page,code,[2121,2122],[1200,4500],undefined,'60m slow page');
  await openRace(page,code,ownName('Slow time lead'),race.number);
  const slow=page.getByRole('button',{name:'Runner 2122',exact:true});
  await expect(slow).toContainText('Slow for 60m slow page');expect(await background(slow)).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-slow-time.png'),fullPage:true});
  await raceAction(page,'Correct times');
  const row=page.getByRole('button',{name:'2nd place · 45.00 · Slow for 60m slow page',exact:true});
  expect(await background(row)).toBe(amber);
});

test('a single child\'s warnings show beside their number on the Current record, amber while open and grey once checked or settled by a Wrong section or age disqualification',async({page},info)=>{
  const code=await ownCode(),race=await recordedRace(page,code,[5141,3141,2141,3142],[1300,1310,1320,1330],[5141,3141,3142]);
  const lead=ownName('Warning lead');
  await openRace(page,code,lead,race.number);
  // Each row is the runner's button; its warnings sit on the row, amber while one is open.
  const row=(number:number)=>page.getByRole('button',{name:`Runner ${number}`,exact:true});
  await expect(row(5141)).toContainText('5141 is not a known wristband number');
  await expect(row(3141)).toContainText('3141 belongs to Boy Scouts - this race is Girl Cubs');
  for(const number of [5141,3141]) expect(await background(row(number))).toBe(amber);
  await expect(row(2141)).toHaveText(/^3rd\s*2141\s*13\.20$/);expect(await background(row(2141))).not.toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-open-warnings.png'),fullPage:true});

  // Checked by a lead: grey, worded as on the leaderboards. Tapping the number still opens the runner sheet.
  await row(3141).click();
  const sheet=page.getByRole('dialog',{name:'Runner 3141',exact:true});
  await sheet.getByRole('button',{name:'Mark checked',exact:true}).click();await expectToast(page,'Warning checked · 3141');await expect(sheet).toHaveCount(0);
  await expect(row(3141)).toContainText(`Checked by ${lead}: 3141 belongs to Boy Scouts - this race is Girl Cubs`);
  expect(await background(row(3141))).not.toBe(amber);
  // Settled by a Wrong section or age disqualification.
  await row(3142).click();
  await page.getByRole('button',{name:'Disqualify 3142',exact:true}).click();
  await page.getByRole('button',{name:'Wrong section or age',exact:true}).click();
  await page.getByRole('button',{name:'Disqualify 3142',exact:true}).click();await expectToast(page,'3142 disqualified · Wrong section or age');
  await expect(row(3142)).toContainText('Checked: 3142 belongs to Boy Scouts - this race is Girl Cubs');
  expect(await background(row(3142))).not.toBe(amber);
  await expect(row(5141)).toContainText('5141 is not a known wristband number');expect(await background(row(5141))).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-checked-warnings.png'),fullPage:true});
});

test('a lead corrects a number on its screen with the phone number pad: digits only, Enter saves, a warning closes the keyboard and Fix clears it; the save lands back on the race page',async({page},info)=>{
  const code=await ownCode(),race=await recordedRace(page,code,[2111,2112],[1300,1400]);
  await openRace(page,code,ownName('Number lead'),race.number);
  const racePage=page.url();
  await press(page.getByRole('button',{name:'Runner 2112',exact:true}));
  await press(page.getByRole('dialog',{name:'Runner 2112',exact:true}).getByRole('button',{name:'Correct number',exact:true}));
  await expect(page.getByRole('banner').getByRole('button',{name:`Back to Heat ${race.number}`,exact:true})).toBeVisible();
  const input=page.getByLabel('New wristband number',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).not.toBeFocused();
  await press(input);await input.pressSequentially('40-45');await expect(input).toHaveValue('4045');
  await page.screenshot({path:info.outputPath('correct-number-typing.png'),fullPage:false});
  await input.press('Enter');
  const held=page.getByRole('alert').filter({hasText:'4045 belongs to Girl Scouts - this race is Girl Cubs'});
  await expect(held).toBeVisible();await expect(input).not.toBeFocused();
  await expect(page.getByText('Fix the number or keep it.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('correct-number-warning.png'),fullPage:false});
  await press(held.getByRole('button',{name:'Fix number',exact:true}));
  await expect(input).toHaveValue('');await expect(input).toBeFocused();
  await input.fill('2115');await input.press('Enter');
  await expectToast(page,`Number saved · 2115 in Heat ${race.number}`);await expect(page).toHaveURL(racePage);
  await expect(page.getByRole('list',{name:'Current record',exact:true})).toContainText('2115');
  // The race's history: the saved runners, order and times, then the lead's correction. Taps before saving are not kept.
  await page.getByText('Saved versions (4)',{exact:true}).click();
  const versions=page.getByRole('list',{name:'Saved versions',exact:true}).getByRole('listitem');
  await expect(versions.nth(3)).toContainText(`${ownName('Number lead')} · Runners · `);
  expect(await versions.allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/ · Finishing order · \d/),expect.stringMatching(/ · Times · \d/)]));
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('saved-versions.png'),fullPage:true});
});

test('Correct runner list is a screen: tap a runner to retype on the number pad, Add runner, Review runner list then Save runner list, one toast and one Notes line, back on the race page',async({page},info)=>{
  const code=await ownCode(),race=await recordedRace(page,code,[2121,2122,2123,2124,2125,2126],[1300,1310,1320,1330,1340,1350]);
  await openRace(page,code,ownName('Runner list lead'),race.number);
  const racePage=page.url(),docked=page.getByRole('contentinfo');
  await raceAction(page,'Correct runner list');
  await expect(page).toHaveURL(`${racePage}/correct-runner-list`);
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Correct runner list',exact:true})).toBeVisible();
  // Nothing to review until a runner changes, and no field takes focus on its own.
  await expect(docked.getByText('Change, add or remove a runner first.',{exact:true})).toBeVisible();
  await expect(docked.getByRole('button',{name:'Review runner list',exact:true})).toHaveAttribute('aria-disabled','true');
  expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('runner-list-editor.png'),fullPage:false});
  // Retyping a number keeps the child's row (and so their place and time).
  await page.getByRole('button',{name:'Runner 2 · 2122',exact:true}).click();
  const second=page.getByLabel('Wristband for runner 2',{exact:true});
  await expect(second).toHaveAttribute('inputmode','numeric');await expect(second).toBeFocused();
  await second.pressSequentially('21-27');await expect(second).toHaveValue('2127');await second.press('Enter');
  await expect(page.getByRole('button',{name:'Runner 2 · 2127',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add runner',exact:true}).click();
  const seventh=page.getByLabel('Wristband for runner 7',{exact:true});await expect(seventh).toBeFocused();
  await seventh.fill('2128');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('runner-list-adding.png'),fullPage:false});
  await press(docked.getByRole('button',{name:'Done',exact:true}));
  await expect(page.getByRole('button',{name:'Runner 7 · 2128',exact:true})).toBeVisible();
  await press(docked.getByRole('button',{name:'Review runner list',exact:true}));
  await expect(page.getByRole('heading',{level:2,name:'7 runners. Is that right?',exact:true})).toBeVisible();
  await press(page.getByRole('button',{name:'New runners did not finish',exact:true}));
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('runner-list-review.png'),fullPage:true});
  await press(docked.getByRole('button',{name:'Save runner list',exact:true}));
  await expectToast(page,`Runner list saved · Girl Cubs Heat ${race.number}`);await expect(page).toHaveURL(racePage);
  await expect(page.getByRole('button',{name:'Runner 2127',exact:true})).toHaveText(/^2nd\s*2127\s*13\.10$/);
  // One save, one Notes line.
  await page.getByRole('button',{name:'Back to Race page · Girl Cubs',exact:true}).click();await eventTab(page,'Notes');
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').filter({hasText:'corrected the runners'})).toHaveText([/corrected the runners for Heat \d+: 2121, 2127, 2123, 2124, 2125, 2126, 2128$/]);
});
// The report from the demonstration run: every later child got the time of the child above, and one time was left over.
test('a lead removes the 4th of 6 children from a saved race, then gives the 2nd Did not finish: every other child keeps their own time and no time is left over',async({page},info)=>{
  test.setTimeout(60000);
  const code=await ownCode(),race=await recordedRace(page,code,[2151,2152,2153,2154,2155,2156],[1300,1310,1320,1330,1340,1350],undefined,'Removed place');
  await openRace(page,code,ownName('Removed place lead'),race.number);
  const racePage=page.url(),docked=page.getByRole('contentinfo'),record=page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem');
  await raceAction(page,'Correct runner list');
  await press(page.getByRole('button',{name:'Remove runner 4',exact:true}));
  await press(docked.getByRole('button',{name:'Review runner list',exact:true}));
  await press(docked.getByRole('button',{name:'Save runner list',exact:true}));
  await expectToast(page,`Runner list saved · Girl Cubs Heat ${race.number}`);await expect(page).toHaveURL(racePage);
  await expect(record).toHaveText([/^1st\s*2151\s*13\.00$/,/^2nd\s*2152\s*13\.10$/,/^3rd\s*2153\s*13\.20$/,/^4th\s*2155\s*13\.40$/,/^5th\s*2156\s*13\.50$/]);
  await expect(page.getByText('5 times · 5 finishers',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('removed-place-runner-list.png'),fullPage:true});
  // Did not finish: the screen shows each child below with their own time before Save, and the race page after.
  await raceAction(page,'Correct finishing order');
  await press(page.getByRole('button',{name:'No place for 2152',exact:true}));
  await press(page.getByRole('dialog',{name:'No place for 2152',exact:true}).getByRole('button',{name:'Did not finish',exact:true}));
  await expect(page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem')).toHaveText(['1st215113.00No place','2nd215313.20No place','3rd215513.40No place','4th215613.50No place']);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('removed-place-order.png'),fullPage:true});
  await press(docked.getByRole('button',{name:'Save finishing order',exact:true}));
  await expectToast(page,`Finishing order saved · Girl Cubs Heat ${race.number}`);await expect(page).toHaveURL(racePage);
  await expect(record).toHaveText([/^1st\s*2151\s*13\.00$/,/^2nd\s*2153\s*13\.20$/,/^3rd\s*2155\s*13\.40$/,/^4th\s*2156\s*13\.50$/,/^–\s*2152\s*Did not finish$/]);
  await expect(page.getByText('4 times · 4 finishers',{exact:true})).toBeVisible();
});

test('leaving Correct runner list without Save changes nothing, by the phone\'s Back or the back arrow',async({page})=>{
  const code=await ownCode(),race=await recordedRace(page,code,[2141,2142],[1300,1310]);
  await openRace(page,code,ownName('Runner list leaver'),race.number);
  const racePage=page.url(),record=page.getByRole('list',{name:'Current record',exact:true});
  const versions=await page.getByText(/^Saved versions \(\d+\)$/).textContent();
  for(const leave of ['phone','arrow'] as const) {
    await raceAction(page,'Correct runner list');
    await page.getByRole('button',{name:'Runner 2 · 2142',exact:true}).click();
    await page.getByLabel('Wristband for runner 2',{exact:true}).fill('2149');await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Remove runner 1',exact:true}).click();
    await expect(page.getByRole('button',{name:'Runner 1 · 2149',exact:true})).toBeVisible();
    if(leave==='phone') await page.goBack();else await page.getByRole('button',{name:`Back to Heat ${race.number}`,exact:true}).click();
    await expect(page).toHaveURL(racePage);
    await expect(record.getByRole('button')).toHaveText([/2141/,/2142/]);
    await expect(page.getByText(versions!,{exact:true})).toBeVisible();
  }
});

test('a race not saved yet says so on its race page with Open Heat 1; its "Delete Heat 1" button opens Race actions with only Delete, a screen that moves it to Deleted races and goes back to the event',async({page},info)=>{
  const code=await ownCode(),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(page.request,code,'Race page','Girl Cubs','timed');
  await writeCheckIn(page.request,token,code,[2131,2132]);
  const {race}=await writeOrder(page.request,token,code,[2131,2132]);
  created.push(race.id!);
  // Its Results row opens the race screen (results.spec.ts); the race page is at its own address.
  await page.goto('/');await join(page,ownName('In progress lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await press(resultsCard(page,code));
  await eventTab(page,'Heats');await page.goto(`/results/${code}/races/${race.id}`);
  const racePage=page.url();
  const notSaved=page.getByRole('status').filter({hasText:'Heat 1 is not saved yet. Open it to finish its steps.'});
  await expect(notSaved).toBeVisible();
  await expect(page.getByText(`Race page · Girl Cubs · checked in ${clock(race.checkedInAt)} · not saved yet`,{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-in-progress.png'),fullPage:true});
  // Open Heat 1 goes to the race screen to finish its steps; Back returns here.
  await press(notSaved.getByRole('button',{name:'Open Heat 1',exact:true}));
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(racePage);
  // Race actions, behind a button that names what it holds: no corrections or Re-run until it is saved, only the red Delete.
  await expect(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true})).toHaveCount(0);
  await press(page.getByRole('main').getByRole('button',{name:'Delete Heat 1',exact:true}));
  const actions=page.getByRole('dialog',{name:'Heat 1 · actions',exact:true});
  await expect(actions.getByText('Heat 1 is not saved yet. Open it to finish its steps.',{exact:true})).toBeVisible();
  await expect(actions.getByRole('button')).toHaveText(['','Open Heat 1','Delete Heat 1']);
  expect(await lookProblems(page)).toEqual([]);
  await press(actions.getByRole('button',{name:'Close',exact:true}));
  await page.getByRole('button',{name:'Runner 2132',exact:true}).click();
  await page.getByRole('button',{name:'Disqualify 2132',exact:true}).click();
  await page.getByRole('button',{name:'Obstruction',exact:true}).click();
  await page.getByRole('button',{name:'Disqualify 2132',exact:true}).click();
  await expectToast(page,'2132 disqualified · Obstruction');
  // Delete is a screen of its own: Move to Deleted races by default, or Delete for good, on a red docked button.
  await raceAction(page,'Delete Heat 1');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${race.id}/delete$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Delete race',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{level:2,name:'Delete Heat 1?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/^Move to Deleted races/})).toHaveAttribute('aria-pressed','true');
  const footer=page.getByRole('contentinfo'),remove=footer.getByRole('button',{name:'Delete Heat 1',exact:true});
  expect(await background(remove)).toBe(red);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('delete-race.png'),fullPage:true});
  await press(page.getByRole('button',{name:/^Delete for good/}));
  await expect(footer.getByRole('button',{name:'Delete Heat 1 for good',exact:true})).toBeVisible();
  await press(page.getByRole('button',{name:/^Move to Deleted races/}));
  await page.getByLabel('Comment (optional)',{exact:true}).fill('Opened by mistake');
  await press(remove);
  // Back on the event's Heats tab. (Back from there is event-tabs.spec.ts's: this race page was opened by its address.)
  await expectToast(page,'Heat 1 moved to Deleted races · Girl Cubs');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
});

test('a deleted race says when and by whom, Restore brings it back on its race page, and a heat whose number is taken comes back with the next one, named in the toast',async({page},info)=>{
  const code=await ownCode(),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(page.request,code,'Restore page','Girl Cubs','heats');
  const first=await recordRace(page.request,token,code,[2161,2162],[1200,1300]);created.push(first.id);
  const deleted=await page.request.post(`/api/lead/races/${first.id}/delete`,{headers:headers(),data:{permanent:false,comment:'Wrong section checked in'}});expect(deleted.ok()).toBe(true);
  // A new Heat 1 runs in its place.
  const second=await recordRace(page.request,token,code,[2163,2164],[1250,1350]);created.push(second.id);expect(second.number).toBe(1);
  const deletedAt=((await (await page.request.get(`/api/lead/races/${first.id}`,{headers:headers()})).json()) as {race:{deletedAt:string}}).race.deletedAt;
  await page.goto('/');await join(page,ownName('Restore lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await press(resultsCard(page,code));
  await eventTab(page,'Heats');await press(page.getByRole('button',{name:/^Open deleted Heat 1 · deleted\s\d\d:\d\d$/}));
  await expect(page.getByText(`Restore page · Girl Cubs · checked in ${clock(first.checkedInAt)} · deleted`,{exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:/^Deleted at /})).toHaveText(new RegExp(`^Deleted at ${clock(deletedAt)} by .+: Wrong section checked in\\. Its results do not count\\.$`));
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('deleted-race-page.png'),fullPage:true});
  await press(page.getByRole('main').getByRole('button',{name:'Restore or delete Heat 1',exact:true}));
  const actions=page.getByRole('dialog',{name:'Heat 1 · actions',exact:true});
  await expect(actions.getByRole('button')).toHaveText(['','Restore Heat 1','Delete for good']);
  expect(await lookProblems(page)).toEqual([]);
  await press(actions.getByRole('button',{name:'Restore Heat 1',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${first.id}/restore$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Restore race',exact:true})).toBeVisible();
  await expect(page.getByText('Its results count again. Heat 1 is taken now, so it comes back as Heat 2.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('restore-race.png'),fullPage:true});
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Restore Heat 1',exact:true}));
  // It stays on the restored race page, now Heat 2.
  await expectToast(page,'Heat 2 restored · Girl Cubs');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${first.id}$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Heat 2',exact:true})).toBeVisible();
  await expect(page.getByText(`Restore page · Girl Cubs · checked in ${clock(first.checkedInAt)} · saved`,{exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:/^Deleted at /})).toHaveCount(0);
});

test('a saved race\'s To check problems are at the top of its race page, each row it is about in amber with its reason; Fix opens the correction that fits, and It\'s right clears each and records who accepted it',async({openPhone,request},info)=>{
  test.setTimeout(60000);
  const code=await ownCode(),token=process.env.E2E_OWNER_TOKEN!,lead=ownName('Problems lead');
  await ownEvent(request,code,'Page problems','Girl Cubs','timed');
  // A kept wrong-section number, a runner added at the finish, and a kept wrong time.
  await writeCheckIn(request,token,code,[3045,2001],[3045]);
  await writeOrder(request,token,code,[3045,2001,2002],{added:[2002]});
  await writeTimes(request,token,code,[1500,1300,1600],[1]);
  const {race}=await submitRace(request,token,code);created.push(race.id);
  const {page}=await openPhone(lead,{lead:true});
  await page.goto(`/results/${code}/races/${race.id}`);
  const racePage=page.url(),problems=page.getByRole('alert'),record=page.getByRole('list',{name:'Current record',exact:true});
  const row=(number:number)=>page.getByRole('button',{name:`Runner ${number}`,exact:true});
  const kept=problems.filter({hasText:'3045'}),added=problems.filter({hasText:'2002'}),time=problems.filter({hasText:'A time looks wrong'});
  await expect(kept).toContainText('A wristband number needs checking. 3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999. Correct it or mark it checked.');
  await expect(added).toContainText('A runner was added at the finish. 2002 crossed the line but was not checked in at the start. Check they ran in this race.');
  await expect(time).toContainText('A time looks wrong. 2nd place (13.00) is faster than 1st (15.00). The timer kept it as typed.');
  await expect(problems).toHaveCount(3);
  // On top: every problem is above the record.
  const top=(await record.boundingBox())!.y;
  for(const problem of await problems.all()) {const box=(await problem.boundingBox())!;expect(box.y+box.height).toBeLessThanOrEqual(top);}
  // The row each problem is about is amber, with its reason.
  await expect(row(3045)).toContainText('3045 belongs to');await expect(row(2002)).toContainText('Added at the finish');await expect(row(2001)).toContainText('Faster than 1st place');
  for(const number of [3045,2002,2001]) expect(await background(row(number))).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-problems.png'),fullPage:true});
  // Fix opens the correction that fits the problem, and Back returns to the race page.
  for(const [problem,fix,address,title] of [[time,'Fix time','correct-times','Correct times'],[kept,'Fix','correct-runner-list','Correct runner list'],[added,'Fix','correct-runner-list','Correct runner list']] as const) {
    await press(problem.getByRole('button',{name:fix,exact:true}));
    await expect(page).toHaveURL(`${racePage}/${address}`);
    await expect(page.getByRole('banner').getByRole('heading',{level:1,name:title,exact:true})).toBeVisible();
    await press(page.getByRole('banner').getByRole('button',{name:'Back to Heat 1',exact:true}));await expect(page).toHaveURL(racePage);
  }
  // It's right clears a problem at once; the row turns grey and names who checked it.
  await press(kept.getByRole('button',{name:"It's right",exact:true}));await expect(kept).toHaveCount(0);
  await expect(row(3045)).toContainText(`Checked by ${lead}: 3045 belongs to`);expect(await background(row(3045))).not.toBe(amber);
  await press(added.getByRole('button',{name:"It's right",exact:true}));await expect(added).toHaveCount(0);
  await expect(row(2002)).toContainText(`Checked by ${lead}: Added at the finish`);expect(await background(row(2002))).not.toBe(amber);
  await press(time.getByRole('button',{name:"It's right",exact:true}));await expect(problems).toHaveCount(0);
  await expect(page.getByText('Out-of-order times accepted by a lead',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-problems-accepted.png'),fullPage:true});
  const notes=(await (await request.get(`/api/lead/events/${code}/results`,{headers:headers()})).json()).auditNotes.map((note:{action:string})=>note.action);
  expect(notes).toEqual(expect.arrayContaining(['mark-warning-checked','mark-added-checked','accept-times']));
  // A tap on a runner's row still opens the runner sheet.
  await press(row(2001));await expect(page.getByRole('dialog',{name:'Runner 2001',exact:true})).toBeVisible();
});

test('a child who ran twice has Fix on the race page, which opens the screen to choose the counted result; a tie has Decide the tie, which opens the tie; neither has It\'s right',async({openPhone,request},info)=>{
  test.setTimeout(60000);
  const twice=await ownCode(),tied=await ownCode(),token=process.env.E2E_OWNER_TOKEN!;
  // 2001 has a result in two races of one event.
  await ownEvent(request,twice,'Page twice','Girl Cubs','timed');
  created.push((await recordRace(request,token,twice,[2001,2002],[1200,1300])).id);
  const second=await recordRace(request,token,twice,[2001],[1250],[2001]);created.push(second.id);
  // 2041 in Heat 1 and 2043 in Heat 2 of another event share a time.
  await ownEvent(request,tied,'Page tie','Girl Cubs','heats');
  const first=await recordRace(request,token,tied,[2041,2042],[1000,1100]);created.push(first.id);
  created.push((await recordRace(request,token,tied,[2043],[1000])).id);
  const {page}=await openPhone(ownName('Fix targets lead'),{lead:true});
  await page.goto(`/results/${twice}/races/${second.id}`);
  const ranTwice=page.getByRole('alert').filter({hasText:'A runner ran twice'});
  await expect(ranTwice).toContainText('2001 has a result in more than one race of this event. Choose which result counts.');
  await expect(ranTwice.getByRole('button')).toHaveText(['Fix']);
  const runner=page.getByRole('button',{name:'Runner 2001',exact:true});
  await expect(runner).toContainText('Ran twice in this event');expect(await background(runner)).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-ran-twice.png'),fullPage:true});
  await press(ranTwice.getByRole('button',{name:'Fix',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/${twice}/races/${second.id}/runners/[^/]+/choose-result$`));
  await press(page.getByRole('button',{name:/^Heat 2 · /}));
  await press(page.getByRole('button',{name:'Save counted result',exact:true}));await expectToast(page,'Result counts · 2001 Heat 2');
  await expect(page).toHaveURL(new RegExp(`/results/${twice}/races/${second.id}$`));await expect(ranTwice).toHaveCount(0);

  await page.goto(`/results/${tied}/races/${first.id}`);
  const tie=page.getByRole('alert').filter({hasText:'Runners tied on time'});
  await expect(tie).toContainText('2041 and 2043 both have 10.00. Decide whether a run-off is needed.');
  await expect(tie.getByRole('button')).toHaveText(['Decide the tie']);
  expect(await background(page.getByRole('button',{name:'Runner 2041',exact:true}))).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-tie.png'),fullPage:true});
  await press(tie.getByRole('button',{name:'Decide the tie',exact:true}));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Tie at 10.00',exact:true})).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/results/${tied}/ties/`));
  await press(page.getByRole('banner').getByRole('button',{name:'Back to Heat 1',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/${tied}/races/${first.id}$`));
});

test('on a relay\'s race page and on its event a team that ran short and a kept number name the team with its four children, and Fix opens Correct teams',async({openPhone,request},info)=>{
  test.setTimeout(60000);
  const code=await ownCode();
  await ownRelay(code,ownName('Page relay'),'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',7),cub=await ownWristbands('Boy Cubs',1);
  const {page,token}=await openPhone(ownName('Relay problems lead'),{lead:true});
  // Team 1 opens with a Boy Cub (kept); Team 2 runs short, with three children.
  await writeTeam(request,token,code,[cub(1),w(12),w(13),w(14)],{keptWarnings:[cub(1)]});
  await writeTeam(request,token,code,[w(21),w(22),w(23),null]);
  for(const team of [1,2]) await tickTeam(request,token,code,team);
  await writeTeamOrder(request,token,code,[2,1]);await writeTimes(request,token,code,[1400,1500]);
  const {race}=await submitRace(request,token,code);created.push(race.id);
  // On the event each problem names its team as on the race page, with the one button to that race's page.
  await page.goto(`/results/${code}/heats`);
  const onEvent=page.getByRole('main').getByRole('alert');
  await expect(onEvent.filter({hasText:'A team ran short'})).toContainText(`A team ran short. Team 2 ran with 3 of 4 children marked here.Team 2 · ${w(21)} · ${w(22)} · ${w(23)} · –`);
  await expect(onEvent.filter({hasText:'A wristband number needs checking'})).toContainText(`Team 1 · ${cub(1)} · ${w(12)} · ${w(13)} · ${w(14)}`);
  await expect(onEvent.filter({hasText:'A team ran short'}).getByRole('button')).toHaveText(['Open Heat 1']);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('event-relay-problems.png'),fullPage:true});
  await page.goto(`/results/${code}/races/${race.id}`);
  const racePage=page.url(),short=page.getByRole('alert').filter({hasText:'A team ran short'}),kept=page.getByRole('alert').filter({hasText:'A wristband number needs checking'});
  await expect(short).toContainText(`A team ran short. Team 2 ran with 3 of 4 children marked here.Team 2 · ${w(21)} · ${w(22)} · ${w(23)} · –`);
  await expect(kept).toContainText(`Team 1 · ${cub(1)} · ${w(12)} · ${w(13)} · ${w(14)}`);
  const rows=page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem');
  await expect(rows.filter({hasText:'Team 2'})).toContainText('Team 2 ran with 3 of 4 children marked here.');
  for(const team of ['Team 1','Team 2']) expect(await background(rows.filter({hasText:team}).getByRole('button'))).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-relay-problems.png'),fullPage:true});
  for(const problem of [short,kept]) {
    await press(problem.getByRole('button',{name:'Fix',exact:true}));
    await expect(page).toHaveURL(`${racePage}/correct-teams`);
    await press(page.getByRole('banner').getByRole('button',{name:'Back to Heat 1',exact:true}));await expect(page).toHaveURL(racePage);
  }
  await press(short.getByRole('button',{name:"It's right",exact:true}));await expect(short).toHaveCount(0);
  await press(kept.getByRole('button',{name:"It's right",exact:true}));await expect(kept).toHaveCount(0);
  for(const team of ['Team 1','Team 2']) await expect(rows.filter({hasText:team}).locator('.rz-lead-row--warn')).toHaveCount(0);
});
