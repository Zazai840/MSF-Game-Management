import {eventTab,ownName,ownEvent,ownCode,lookProblems,press,recordRace,writeCheckIn,writeOrder,becomeLead,expect,expectToast,join,openLeadMenu,test,type Page} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
const amber='rgb(255, 244, 220)';
const created:string[]=[];
test.afterEach(async({request})=>{for(const id of created.splice(0)) await request.post(`/api/lead/races/${id}/delete`,{headers:headers(),data:{permanent:true}});});
/** A timed event with one race of these runners, finished in that order with these times; `keptWarnings` are the wristbands whose warnings the starter kept. */
async function recordedRace(page:Page,code:string,runners:number[],places:number[],keptWarnings?:number[]) {
  await ownEvent(page.request,code,'Race page','Girl Cubs','timed');
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,runners,places,keptWarnings);
  created.push(race.id);
  return race;
}
async function openRace(page:Page,code:string,name:string,number:number) {
  await page.goto('/');await join(page,name,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await eventTab(page,'Races');await page.getByRole('button',{name:`Open Heat ${number}`,exact:true}).click();
}
const background=(element:{evaluate:(fn:(element:Element)=>string)=>Promise<string>})=>element.evaluate(element=>getComputedStyle(element).backgroundColor);

test('the race page highlights a wrong time in amber with its reason, and the times editor retypes it on the phone number pad',async({page},info)=>{
  const code=await ownCode(),race=await recordedRace(page,code,[2101,2102,2103],[1200,1100,1250]);
  await openRace(page,code,ownName('Wrong time lead'),race.number);
  const record=page.getByRole('list',{name:'Current record',exact:true});
  const second=record.getByRole('listitem').filter({hasText:'2102'});
  await expect(second).toContainText('Faster than 1st place');
  expect(await background(second)).toBe(amber);
  await expect(record.getByRole('listitem').filter({hasText:'2103'})).not.toContainText('Faster');
  await expect(page.getByText('3 times · 3 finishers',{exact:true})).toBeVisible();
  // A wrong time's amber outline must not nudge its row's content off the line the plain rows keep.
  expect(new Set(await page.locator('.record-row').evaluateAll(rows=>rows.map(row=>row.querySelector('.record-place')!.getBoundingClientRect().left)))).toHaveProperty('size',1);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-wrong-time.png'),fullPage:true});

  await page.getByRole('button',{name:'Correct times',exact:true}).click();
  const sheet=page.getByRole('dialog');
  const wrongRow=sheet.getByRole('button',{name:'2nd place · 11.00 · Faster than 1st place',exact:true});
  expect(await background(wrongRow)).toBe(amber);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('times-editor-wrong.png'),fullPage:true});
  await wrongRow.click();
  const input=sheet.getByLabel('2nd place time',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).toHaveAttribute('enterkeyhint','next');
  await expect(input).toBeFocused();
  await input.pressSequentially('12.2-0');await expect(input).toHaveValue('1220');
  await expect(sheet.getByText('Shows as 12.20',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('times-editor-typing.png'),fullPage:false});
  await input.press('Enter');
  await expect(sheet.getByRole('button',{name:'2nd place · 12.20',exact:true})).toBeVisible();
  await expect(sheet.getByLabel('Accept these out-of-order times',{exact:true})).toHaveCount(0);
  await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
  await expectToast(page,`Times saved · Girl Cubs Heat ${race.number}`);
  await expect(second).toContainText('12.20');await expect(second).not.toContainText('Faster');
  expect(await background(second)).not.toBe(amber);
});

test('a single child\'s warnings show beside their number on the Current record, amber while open and grey once checked or settled by a Wrong section or age disqualification',async({page},info)=>{
  const code=await ownCode(),race=await recordedRace(page,code,[5141,3141,2141,3142],[1300,1310,1320,1330],[5141,3141,3142]);
  const lead=ownName('Warning lead');
  await openRace(page,code,lead,race.number);
  const record=page.getByRole('list',{name:'Current record',exact:true}),row=(number:number)=>record.getByRole('listitem').filter({hasText:String(number)});
  const warning=(number:number)=>row(number).locator('.record-warning');
  await expect(warning(5141)).toHaveText('5141 is not a known wristband number');
  await expect(warning(3141)).toHaveText('3141 belongs to Boy Scouts - this race is Girl Cubs');
  for(const number of [5141,3141]) expect(await background(warning(number))).toBe(amber);
  await expect(row(2141).locator('.record-note')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-open-warnings.png'),fullPage:true});

  // Checked by a lead: grey, worded as on the leaderboards. Tapping the number still opens the runner sheet.
  await page.getByRole('button',{name:'Runner 3141',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Runner 3141',exact:true});
  await sheet.getByRole('button',{name:'Mark checked',exact:true}).click();await expectToast(page,'Warning checked · 3141');await expect(sheet).toHaveCount(0);
  await expect(warning(3141)).toHaveText(`Checked by ${lead}: 3141 belongs to Boy Scouts - this race is Girl Cubs`);
  expect(await background(warning(3141))).not.toBe(amber);
  // Settled by a Wrong section or age disqualification.
  await page.getByRole('button',{name:'Runner 3142',exact:true}).click();
  await page.getByRole('button',{name:'Disqualify 3142',exact:true}).click();
  await page.getByRole('button',{name:'Wrong section or age',exact:true}).click();
  await page.getByRole('button',{name:'Disqualify 3142',exact:true}).click();await expectToast(page,'3142 disqualified · Wrong section or age');
  await expect(warning(3142)).toHaveText('Checked: 3142 belongs to Boy Scouts - this race is Girl Cubs');
  expect(await background(warning(3142))).not.toBe(amber);
  await expect(warning(5141)).toHaveText('5141 is not a known wristband number');expect(await background(warning(5141))).toBe(amber);
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
  const versions=page.locator('.race-page details li');
  await expect(versions.nth(3)).toContainText(`${ownName('Number lead')} · Runners · `);
  expect(await versions.allTextContents()).toEqual(expect.arrayContaining([expect.stringMatching(/ · Finishing order · \d/),expect.stringMatching(/ · Times · \d/)]));
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('saved-versions.png'),fullPage:true});
});

test('the runner list editor keeps Add runner on screen and types numbers on the phone number pad',async({page},info)=>{
  const code=await ownCode(),race=await recordedRace(page,code,[2121,2122,2123,2124,2125,2126],[1300,1310,1320,1330,1340,1350]);
  await openRace(page,code,ownName('Runner list lead'),race.number);
  await page.getByRole('button',{name:'Correct runner list',exact:true}).click();
  const sheet=page.getByRole('dialog');
  await expect(sheet.getByRole('button',{name:'Add runner',exact:true})).toBeInViewport();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('runner-list-editor.png'),fullPage:false});
  // Retyping a number keeps the child's row (and so their place and time).
  await sheet.getByRole('button',{name:'Runner 2 · 2122',exact:true}).click();
  const second=sheet.getByLabel('Wristband for runner 2',{exact:true});
  await expect(second).toHaveAttribute('inputmode','numeric');await expect(second).toBeFocused();
  await second.pressSequentially('21-27');await expect(second).toHaveValue('2127');await second.press('Enter');
  await expect(sheet.getByRole('button',{name:'Runner 2 · 2127',exact:true})).toBeVisible();
  await sheet.getByRole('button',{name:'Add runner',exact:true}).click();
  const seventh=sheet.getByLabel('Wristband for runner 7',{exact:true});await expect(seventh).toBeFocused();
  await seventh.fill('2128');
  await page.screenshot({path:info.outputPath('runner-list-adding.png'),fullPage:false});
  await sheet.getByRole('button',{name:'Done',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Runner 7 · 2128',exact:true})).toBeVisible();
  await sheet.getByRole('button',{name:'Review runner list',exact:true}).click();
  await expect(sheet.getByRole('heading',{name:'7 runners. Is that right?',exact:true})).toBeVisible();
  await sheet.getByLabel('New runners did not finish',{exact:true}).check();
  await sheet.getByRole('button',{name:'Save runner list',exact:true}).click();await expect(sheet).toHaveCount(0);
  await expectToast(page,`Runner list saved · Girl Cubs Heat ${race.number}`);
  await expect(page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem').filter({hasText:'2127'})).toHaveText(/^2nd\s*2127\s*13\.10$/);
});

test('a race not saved yet shows In progress on the lead race page, with the correction tools and Re-run hidden, while Disqualify and Delete still work',async({page},info)=>{
  const code=await ownCode(),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(page.request,code,'Race page','Girl Cubs','timed');
  await writeCheckIn(page.request,token,code,[2131,2132]);
  const {race}=await writeOrder(page.request,token,code,[2131,2132]);
  created.push(race.id!);
  await openRace(page,code,ownName('In progress lead'),race.number);
  await expect(page.getByText('Heat 1 is in progress - finish its steps on Races',{exact:true})).toBeVisible();
  for(const tool of ['Correct times','Correct finishing order','Correct runner list','Re-run race']) await expect(page.getByRole('button',{name:tool,exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('race-page-in-progress.png'),fullPage:true});
  await page.getByRole('button',{name:'Runner 2132',exact:true}).click();
  await page.getByRole('button',{name:'Disqualify 2132',exact:true}).click();
  await page.getByRole('button',{name:'Obstruction',exact:true}).click();
  await page.getByRole('button',{name:'Disqualify 2132',exact:true}).click();
  await expectToast(page,'2132 disqualified · Obstruction');
  await page.getByRole('button',{name:'Delete race',exact:true}).click();
  await page.getByRole('button',{name:'Move to Deleted races',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Deleted race',{exact:true})).toBeVisible();
});
