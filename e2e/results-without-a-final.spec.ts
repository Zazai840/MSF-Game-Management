import { back,expect,live,openDashboard,openRaceScreen,ownEvent,recordRace,test } from './fixtures.js';
test('a lead awards medals from heat times: a tie for 3rd settled for qualifying comes back, is settled, and a comment confirms it',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=`RWF-${project.toUpperCase()}`,name=`No final sprint ${project}`;
  await ownEvent(page.request,code,name);
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{}});
  // Each project's heats use Girl Cubs wristbands no other test types: heat 1 is w(1)..w(3), heat 2 is w(11)..w(13).
  const w=(number:number)=>2900+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2),w(3)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(11),w(12),w(13)],[935,980,1060]);
  const lead=(await openPhone(`No final lead ${project}`,{lead:true})).page;
  await openDashboard(lead,'Results');
  await lead.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  // The tie for 3rd and 4th only decides qualifying for now: both qualify, so No run-off needed.
  await lead.getByRole('button',{name:`TIE at 9.80 for ${w(2)}`,exact:true}).click();
  await lead.getByRole('button',{name:'No run-off needed',exact:true}).click();await lead.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  const stages=lead.locator('.stage-actions').getByRole('button');
  await expect(stages).toHaveText(['Heats complete','Results without a final']);
  await lead.screenshot({path:info.outputPath('a1-heats-run.png'),fullPage:true});
  // Without a final it decides the bronze, so it comes back.
  await lead.getByRole('button',{name:'Results without a final',exact:true}).click();
  const blocked=lead.getByRole('dialog',{name:'Results without a final',exact:true});
  await expect(blocked.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
  await expect(blocked).toContainText('No final will be run. Medals go to the 3 fastest heat times.');
  await lead.screenshot({path:info.outputPath('a2-tie-comes-back.png')});
  await blocked.getByRole('button',{name:`Tie: ${w(2)}, ${w(12)}`,exact:true}).click();
  const tie=lead.getByRole('dialog',{name:'Tie at 9.80',exact:true});
  await tie.getByRole('button',{name:'No run-off needed',exact:true}).click();await tie.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  await lead.getByRole('button',{name:'Results without a final',exact:true}).click();
  const sheet=lead.getByRole('dialog',{name:'Results without a final',exact:true});
  await expect(sheet).toContainText('Nothing to settle');await expect(sheet).toContainText('No open warnings');
  await expect(sheet.locator('.stage-creates li')).toHaveText([`1st: ${w(1)}`,`2nd: ${w(11)}`,`3rd: ${w(2)}`]);
  // The comment is required: Confirm without one stays on the sheet.
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(sheet.getByLabel('Comment',{exact:true})).toBeFocused();
  await sheet.getByLabel('Comment',{exact:true}).fill('Out of time');
  await lead.screenshot({path:info.outputPath('a3-ready.png')});
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  // Done: the medal line under 3rd, medal marks instead of Q, the podium for Input - Running and the audit note.
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Done · medals decided, no final');
  await expect(lead.getByText('Top 6 highlighted · Medal places: 1st, 2nd, 3rd',{exact:true})).toBeVisible();
  const board=lead.getByRole('list',{name:'Official leaderboard'});
  await expect(board.locator('.result-mark')).toHaveText(['1st','2nd','3rd']);
  await expect(board.locator('.result-line')).toHaveText('Medal line');
  await expect(board.locator('li').nth(3)).toHaveText('Medal line');
  await expect(lead.getByRole('table',{name:'Input - Running'}).getByRole('row').nth(1)).toHaveText(`${code}${w(1)}${w(11)}${w(2)}`);
  await expect(lead.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText(`No final lead ${project} marked Results without a final - Out of time`);
  await expect(lead.getByRole('button',{name:'Heats complete',exact:true})).toHaveCount(0);
  await expect(lead.getByRole('button',{name:'Results without a final',exact:true})).toHaveCount(0);
  await lead.screenshot({path:info.outputPath('a4-done.png'),fullPage:true});
  await back(lead,'Results');
  await expect(lead.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)})).toContainText('Done · medals decided, no final');
});
test('once a lead decides without a final, a volunteer\'s Home shows the event done and its race screen offers no heat to work',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=`RWV-${project.toUpperCase()}`,name=`No final done ${project}`;
  await ownEvent(page.request,code,name);
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{}});
  // The numbers the other tests here leave free: heat 1 is w(8)..w(10), heat 2 is w(18), w(19) and w(4).
  const w=(number:number)=>2900+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(8),w(9),w(10)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(18),w(19),w(4)],[935,990,1060]);
  const volunteer=(await openPhone(`No final volunteer ${project}`)).page;
  const tile=volunteer.getByRole('region',{name,exact:true}).getByRole('button',{name:new RegExp(`^${name} Girl Cubs · `)});
  await expect(tile).toHaveText(/^Girl CubsHeat 3/);
  expect((await page.request.post(`/api/lead/events/${code}/complete-stage`,{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{stage:'no-final',comment:'Out of time'}})).ok()).toBe(true);
  await expect(tile).toHaveText('Girl CubsDone',live);
  await volunteer.screenshot({path:info.outputPath('a5-home-done.png'),fullPage:true});
  await openRaceScreen(volunteer,name);
  await expect(volunteer.getByRole('status').filter({hasText:'Stage complete - ask a lead'})).toBeVisible();
  // No further heat and no final: the screen names neither and offers no job to take.
  await expect(volunteer.locator('.race-line')).toHaveText('Done · medals decided, no final');
  await expect(volunteer.getByText(/Heat 3|Final/)).toHaveCount(0);
  await expect(volunteer.getByRole('button',{name:/^Check-in Wristbands/})).toHaveCount(0);
  await expect(volunteer.getByRole('button',{name:'Submit Race'})).toHaveCount(0);
  await volunteer.screenshot({path:info.outputPath('a6-race-screen-done.png'),fullPage:true});
});
test('a lead reopens results with a comment: the medals clear, the heats open again and Heats complete builds a final',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=`RRO-${project.toUpperCase()}`,name=`Reopened sprint ${project}`;
  await ownEvent(page.request,code,name);
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{}});
  // The first test's wristbands with numbers it leaves free: heat 1 is w(5)..w(7), heat 2 is w(15)..w(17).
  const w=(number:number)=>2900+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(5),w(6),w(7)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(15),w(16),w(17)],[935,990,1060]);
  const lead=(await openPhone(`Reopen lead ${project}`,{lead:true})).page;
  await openDashboard(lead,'Results');
  await lead.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await lead.getByRole('button',{name:'Results without a final',exact:true}).click();
  const sheet=lead.getByRole('dialog',{name:'Results without a final',exact:true});
  await sheet.getByLabel('Comment',{exact:true}).fill('Out of time');await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Done · medals decided, no final');
  const stages=lead.locator('.stage-actions').getByRole('button');
  await expect(stages).toHaveText(['Reopen results']);
  await lead.screenshot({path:info.outputPath('a5-reopen-offered.png'),fullPage:true});
  await stages.click();
  const reopen=lead.getByRole('dialog',{name:'Reopen results',exact:true});
  await expect(reopen).toContainText('This clears the medals and opens the heats again. You can then run a final or choose Results without a final again.');
  // The comment is required: Reopen without one stays on the sheet.
  await reopen.getByRole('button',{name:'Reopen',exact:true}).click();
  await expect(reopen.getByLabel('Comment',{exact:true})).toBeFocused();
  await reopen.getByLabel('Comment',{exact:true}).fill('The final fits after all');
  await lead.screenshot({path:info.outputPath('a5-reopen-sheet.png')});
  await reopen.getByRole('button',{name:'Reopen',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  // Heats open again: the qualifying line and Q marks, no medals, no Input - Running, and the audit note.
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Heats running · 2 races');
  await expect(lead.getByText('Top 8 highlighted · Q: fastest 6',{exact:true})).toBeVisible();
  const board=lead.getByRole('list',{name:'Provisional leaderboard'});
  await expect(board.locator('.result-mark')).toHaveText(Array(6).fill('Q'));
  await expect(board.locator('.result-line')).toHaveText('Qualifying line');
  await expect(lead.getByRole('table',{name:'Input - Running'})).toHaveCount(0);
  await expect(lead.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText(`Reopen lead ${project} reopened Results without a final - The final fits after all`);
  await expect(stages).toHaveText(['Heats complete','Results without a final']);
  await lead.screenshot({path:info.outputPath('a5-heats-open.png'),fullPage:true});
  await lead.getByRole('button',{name:'Heats complete',exact:true}).click();
  await lead.getByRole('dialog',{name:'Heats complete',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Heats done · final to run');
  await expect(lead.locator('.final-panel')).toBeVisible();
});
test('after Heats complete, a lead chooses Results without a final before the final starts: its line-up is discarded, and Reopen results then Heats complete builds a fresh final',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=`RWH-${project.toUpperCase()}`,name=`Late no final ${project}`;
  await ownEvent(page.request,code,name);
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{}});
  // Girl Cubs wristbands no other test types: heat 1 is w(1)..w(3), heat 2 is w(11)..w(13).
  const w=(number:number)=>2540+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2),w(3)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(11),w(12),w(13)],[935,990,1060]);
  const lead=(await openPhone(`Late no final lead ${project}`,{lead:true})).page;
  await openDashboard(lead,'Results');
  await lead.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await lead.getByRole('button',{name:'Heats complete',exact:true}).click();
  await lead.getByRole('dialog',{name:'Heats complete',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Heats done · final to run');
  // The final is built and nobody has touched it: the option sits under Final complete and Reopen heats.
  const stages=lead.locator('.stage-actions').getByRole('button');
  await expect(stages).toHaveText(['Final complete','Reopen heats','Results without a final']);
  await lead.screenshot({path:info.outputPath('a6-final-built.png'),fullPage:true});
  await lead.getByRole('button',{name:'Results without a final',exact:true}).click();
  const sheet=lead.getByRole('dialog',{name:'Results without a final',exact:true});
  await expect(sheet).toContainText('Nothing to settle');
  await expect(sheet.locator('.stage-creates li')).toHaveText([`1st: ${w(1)}`,`2nd: ${w(11)}`,`3rd: ${w(2)}`]);
  await expect(sheet.getByRole('status')).toHaveText("The final's line-up will be discarded.");
  await expect(sheet).toContainText('No final will be run. Medals go to the 3 fastest heat times.');
  await sheet.getByLabel('Comment',{exact:true}).fill('Out of time');
  await lead.screenshot({path:info.outputPath('a6-discard-sheet.png')});
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Done · medals decided, no final');
  await expect(lead.locator('.final-panel')).toHaveCount(0);
  await expect(lead.getByRole('list',{name:'Official leaderboard'}).locator('.result-mark')).toHaveText(['1st','2nd','3rd']);
  await expect(stages).toHaveText(['Reopen results']);
  await lead.screenshot({path:info.outputPath('a6-done.png'),fullPage:true});
  await stages.click();
  const reopen=lead.getByRole('dialog',{name:'Reopen results',exact:true});
  await reopen.getByLabel('Comment',{exact:true}).fill('The final fits after all');await reopen.getByRole('button',{name:'Reopen',exact:true}).click();
  // Heats open again, not complete: Heats complete builds a fresh final.
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Heats running · 2 races');
  await expect(stages).toHaveText(['Heats complete','Results without a final']);
  await lead.getByRole('button',{name:'Heats complete',exact:true}).click();
  await lead.getByRole('dialog',{name:'Heats complete',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Heats done · final to run');
  await expect(lead.locator('.final-panel')).toBeVisible();
});
