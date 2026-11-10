import { clock } from '../src/shared/clock.js';
import {eventTab,ownName,ownEvent,ownCode,lookProblems,press,raceAction,recordRace,writeCheckIn,writeOrder,becomeLead,expect,expectToast,selected,join,openLeadMenu,test,type Page} from './fixtures.js';
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
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await eventTab(page,'Heats');await page.getByRole('button',{name:`Open Heat ${number}`,exact:true}).click();
}
const background=(element:{evaluate:(fn:(element:Element)=>string)=>Promise<string>})=>element.evaluate(element=>getComputedStyle(element).backgroundColor);

test('the race page is in the race-flow look: its meta line, a wrong time in amber with its reason, and "⋯" opening Race actions with Delete red and last; Correct times retypes on the number pad',async({page},info)=>{
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
  // "⋯" opens one Race actions sheet: the corrections, Re-run, then a red Delete set apart at the end.
  await press(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true}));
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

test('a race not saved yet says so on its race page with Open Heat 1; Race actions offers only Delete, a screen that moves it to Deleted races and goes back to the event',async({page},info)=>{
  const code=await ownCode(),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(page.request,code,'Race page','Girl Cubs','timed');
  await writeCheckIn(page.request,token,code,[2131,2132]);
  const {race}=await writeOrder(page.request,token,code,[2131,2132]);
  created.push(race.id!);
  await openRace(page,code,ownName('In progress lead'),race.number);
  const racePage=page.url();
  const notSaved=page.getByRole('status').filter({hasText:'Heat 1 is not saved yet. Open it to finish its steps.'});
  await expect(notSaved).toBeVisible();
  await expect(page.getByText(`Race page · Girl Cubs · checked in ${clock(race.checkedInAt)} · not saved yet`,{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-in-progress.png'),fullPage:true});
  // Open Heat 1 goes to the race screen to finish its steps; Back returns here.
  await press(notSaved.getByRole('button',{name:'Open Heat 1',exact:true}));
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(racePage);
  // Race actions: no corrections or Re-run until it is saved, only the red Delete.
  await press(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true}));
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
  // Back on the screen before the race, the event's Races tab; the next Back leaves the event.
  await expectToast(page,'Heat 1 moved to Deleted races · Girl Cubs');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await page.goBack();await expect(page).toHaveURL(/\/results$/);
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
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await eventTab(page,'Heats');await page.getByRole('button',{name:/^Open deleted Heat 1 · deleted\s\d\d:\d\d$/}).click();
  await expect(page.getByText(`Restore page · Girl Cubs · checked in ${clock(first.checkedInAt)} · deleted`,{exact:true})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:/^Deleted at /})).toHaveText(new RegExp(`^Deleted at ${clock(deletedAt)} by .+: Wrong section checked in\\. Its results do not count\\.$`));
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('deleted-race-page.png'),fullPage:true});
  await press(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true}));
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
