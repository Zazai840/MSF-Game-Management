import {eventTab,expectToast,ownName,ownCode,becomeLead,join,expect,lookProblems,openLeadsBarTab,ownEvent,press,recordRace,test,resultsCard} from './fixtures.js';
const amber='rgb(255, 241, 199)';
test('a lead reads a kept wristband warning in the child\'s Notes on the runner sheet, checks it at once, and sees who checked it',async({page},info)=>{
  const code=await ownCode(),lead=ownName('Notes lead');
  await ownEvent(page.request,code,'Notes','Girl Cubs','timed');
  // The volunteer kept the out-of-range wristband at check-in, and the race was saved.
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2301,6000],[1100,1200],[6000]);
  await page.goto('/');await join(page,lead,{job:'Start line'});await becomeLead(page);await openLeadsBarTab(page,'Results');
  await press(resultsCard(page,code));
  await eventTab(page,'Heats');await press(page.getByRole('listitem').getByRole('button',{name:`Open Heat ${race.number}`,exact:true}));
  const racePage=new RegExp(`/results/${code}/races/${race.id}$`);await expect(page).toHaveURL(racePage);
  // The warning shows on the child's row of the race page's Current record, the row amber while it is open.
  const child=page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem').filter({hasText:'6000'});
  await expect(child.getByText('6000 is not a known wristband number',{exact:true})).toBeVisible();
  expect(await child.getByRole('button',{name:'Runner 6000',exact:true}).evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(amber);
  // The same runner sheet opens from the race page, without "Open Heat" (this is that race).
  await press(child.getByRole('button',{name:'Runner 6000',exact:true}));
  const sheet=page.getByRole('dialog',{name:'Runner 6000',exact:true}),notes=sheet.getByRole('list',{name:'Notes',exact:true});
  await expect(notes.getByRole('listitem')).toHaveText(['6000 is not a known wristband numberNot checked yet']);
  await expect(sheet.getByRole('button',{name:/^Open /})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('notes-not-checked.png'),fullPage:true});
  await press(sheet.getByRole('button',{name:'Mark checked',exact:true}));await expectToast(page,'Warning checked · 6000');await expect(sheet).toHaveCount(0);
  await press(child.getByRole('button',{name:'Runner 6000',exact:true}));
  // The check is on the warning's own line, greyed; its audit note is not repeated under it.
  await expect(notes.getByRole('listitem')).toHaveText([new RegExp(`^6000 is not a known wristband numberChecked by ${lead} · \\d{2}:\\d{2}$`)]);
  await expect(sheet.getByRole('button',{name:'Mark checked',exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('notes-checked.png'),fullPage:true});
  await press(sheet.getByRole('button',{name:'Close',exact:true}));await expect(sheet).toHaveCount(0);
  // Back up one level, to the event's Races tab; on Heats the checked warning no longer says Check.
  await page.getByRole('banner').getByRole('button',{name:/^Back to /}).click();await eventTab(page,'Heats');
  const row=page.getByRole('button',{name:`Runner 6000 · Heat ${race.number}`,exact:true});
  await expect(row).toContainText('6000');await expect(row).not.toContainText('Check');
  await page.screenshot({path:info.outputPath('results-checked.png'),fullPage:true});
  // From Heats, "Open Heat N" goes to the runner's race page.
  const other=page.getByRole('button',{name:`Runner 2301 · Heat ${race.number}`,exact:true}),otherSheet=page.getByRole('dialog',{name:'Runner 2301',exact:true});
  await press(other);await expect(otherSheet.getByRole('list',{name:'Notes'})).toHaveCount(0);
  await press(otherSheet.getByRole('button',{name:`Open Heat ${race.number}`,exact:true}));await expect(page).toHaveURL(racePage);
  // A disqualification from the race page lands back on it, and shows in Notes straight away, with its time and comment.
  await press(page.getByRole('list',{name:'Current record',exact:true}).getByRole('button',{name:'Runner 2301',exact:true}));
  await press(otherSheet.getByRole('button',{name:'Disqualify 2301',exact:true}));
  await press(page.getByRole('button',{name:'Obstruction',exact:true}));await page.getByLabel('Comment (optional)',{exact:true}).fill('Blocked the inside lane');
  await press(page.getByRole('button',{name:'Disqualify 2301',exact:true}));await expectToast(page,'2301 disqualified · Obstruction');await expect(page).toHaveURL(racePage);
  await press(page.getByRole('list',{name:'Current record',exact:true}).getByRole('button',{name:'Runner 2301',exact:true}));
  await expect(otherSheet.getByRole('list',{name:'Notes',exact:true}).getByRole('listitem')).toHaveText([new RegExp(`^${lead} disqualified 2301 \\(Heat ${race.number}\\): Obstruction - Blocked the inside lane\\d{2}:\\d{2}$`)]);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('notes-disqualified.png'),fullPage:true});
});
