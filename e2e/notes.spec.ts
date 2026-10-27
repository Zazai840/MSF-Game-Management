import {becomeLead,join,expect,lookProblems,openLeadMenu,ownEvent,recordRace,test} from './fixtures.js';
const amber='rgb(255, 244, 220)';
test('a lead reads a kept wristband warning in the child\'s Notes, checks it with a note, and sees who checked it',async({page},info)=>{
  const code=`NO-${info.project.name.slice(0,3).toUpperCase()}`,lead=`Notes lead ${info.project.name}`;
  await ownEvent(page.request,code,'Notes','Girl Cubs','timed');
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{}});
  // The volunteer kept the out-of-range wristband at check-in, and the race was saved.
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2301,6000],[1100,1200],[6000]);
  await page.goto('/');await join(page,lead,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:`Open Heat ${race.number}`,exact:true}).click();
  // The warning shows in amber beside the child's number on the race page's Current record.
  const child=page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem').filter({hasText:'6000'});
  const warning=child.getByText('6000 is not a known wristband number',{exact:true});
  await expect(warning).toBeVisible();expect(await warning.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(amber);
  await child.getByRole('button',{name:'Runner 6000',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Actions for 6000',exact:true}),notes=sheet.getByRole('list',{name:'Notes',exact:true});
  await expect(notes.getByRole('listitem')).toHaveText(['6000 is not a known wristband numberNot checked yet']);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('notes-not-checked.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Mark checked',exact:true}).click();
  await sheet.getByLabel('Note (optional)',{exact:true}).fill('Saw the wristband, wrong band issued');
  await sheet.getByRole('button',{name:'Save check',exact:true}).click();await expect(sheet).toHaveCount(0);
  await child.getByRole('button',{name:'Runner 6000',exact:true}).click();
  // The check is on the warning's own line, with the note; its audit note is not repeated under it.
  await expect(notes.getByRole('listitem')).toHaveText([new RegExp(`^6000 is not a known wristband numberChecked by ${lead} · \\d{2}:\\d{2} - Saw the wristband, wrong band issued$`)]);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('notes-checked.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Close actions',exact:true}).click();
  // Back up one level, to the event's Results.
  await page.getByRole('navigation',{name:'Back',exact:true}).getByRole('button').click();
  const row=page.getByRole('button',{name:`Runner 6000 · Heat ${race.number}`,exact:true});
  await expect(row.locator('.checked-warning')).toHaveText(`Checked by ${lead}: 6000 is not a known wristband number`);
  await expect(row.locator('.note-tag')).toHaveText('note');
  const other=page.getByRole('button',{name:`Runner 2301 · Heat ${race.number}`,exact:true});await expect(other.locator('.note-tag')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('results-checked.png'),fullPage:true});
  // A sheet with nothing to say has no Notes; a disqualification shows in Notes straight away, with its time and comment.
  const otherSheet=page.getByRole('dialog',{name:'Actions for 2301',exact:true});
  await other.click();await expect(otherSheet.getByRole('list',{name:'Notes'})).toHaveCount(0);
  await otherSheet.getByRole('button',{name:'Disqualify',exact:true}).click();await otherSheet.getByLabel('Reason',{exact:true}).selectOption('Obstruction');
  await otherSheet.getByLabel('Comment (optional)',{exact:true}).fill('Blocked the inside lane');await otherSheet.getByRole('button',{name:'Save disqualification',exact:true}).click();await expect(otherSheet).toHaveCount(0);
  await expect(other.locator('.note-tag')).toHaveText('note');await other.click();
  await expect(otherSheet.getByRole('list',{name:'Notes',exact:true}).getByRole('listitem')).toHaveText([new RegExp(`^${lead} disqualified 2301 \\(Heat ${race.number}\\): Obstruction - Blocked the inside lane\\d{2}:\\d{2}$`)]);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('notes-disqualified.png'),fullPage:true});
});
