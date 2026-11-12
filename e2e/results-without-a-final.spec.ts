import {ownName,ownCode,back,eventTab,expect,expectToast,live,lookProblems,makeFinal,medalPlaces,openLeadMenu,openRace,ownEvent,press,recordRace,test,type Page,resultsCard} from './fixtures.js';
/** The event's tabs: a Final tab only while the event runs a final. */
const tabs=(page:Page)=>page.getByRole('navigation',{name:'Event'}).getByRole('button');
/** The check-sheet buttons on the event's tab showing. */
const stageButtons=(page:Page)=>page.locator('main').getByRole('button',{name:/^(Confirm the medals|Results without a final|Reopen \w+)$/});
/** A medal decision screen's docked button, and the reason above it while it is grey. */
const docked=(page:Page,name:string)=>page.getByRole('contentinfo').getByRole('button',{name,exact:true});
const reason=(page:Page)=>page.getByRole('contentinfo').locator('.rz-footer__reason');
/** The Q and medal tags on a leaderboard's rows. */
const marks=(board:ReturnType<Page['getByRole']>)=>board.getByText(/^(Q|1st|2nd|3rd)$/);
test('a lead awards medals from heat times: a tie for 3rd settled for qualifying comes back, is settled, and a comment confirms it',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=await ownCode(),name=ownName('No final sprint');
  await ownEvent(page.request,code,name);
  // Each project's heats use Girl Cubs wristbands no other test types: heat 1 is w(1)..w(3), heat 2 is w(11)..w(13).
  const w=(number:number)=>2900+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2),w(3)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(11),w(12),w(13)],[935,980,1060]);
  const lead=(await openPhone(ownName('No final lead'),{lead:true})).page;
  await openLeadMenu(lead,'Results');
  await resultsCard(lead,code).click();
  // The tie for 3rd and 4th only decides qualifying for now: both qualify, so No run-off needed.
  await lead.getByRole('button',{name:`TIE at 9.80 for ${w(2)}`,exact:true}).click();
  await lead.getByRole('button',{name:'No run-off needed',exact:true}).click();await lead.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(lead.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  const stages=stageButtons(lead);
  await expect(stages).toHaveText(['Results without a final']);
  await lead.screenshot({path:info.outputPath('a1-heats-run.png'),fullPage:true});
  // Its own screen in the race-flow frame. Without a final the tie decides the bronze, so it comes back to settle first.
  await press(lead.getByRole('button',{name:'Results without a final',exact:true}));
  await expect(lead).toHaveURL(new RegExp(`/results/${code}/results-without-a-final$`));
  await expect(lead.getByRole('banner').getByRole('heading',{level:1,name:'Results without a final',exact:true})).toBeVisible();
  await expect(lead.getByRole('heading',{level:2,name:'Results without a final?',exact:true})).toBeVisible();
  await expect(lead.getByText('No final will be run. Medals go to the 3 fastest heat times.',{exact:true})).toBeVisible();
  await expect(lead.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · 2 heats · no final`);
  const settle=lead.getByRole('list',{name:'Settle first',exact:true}).getByRole('listitem');
  await expect(settle).toHaveText([`Tie: ${w(2)}, ${w(12)}Settle tie`]);
  await expect(reason(lead)).toHaveText('Settle 1 thing first.');await expect(docked(lead,'Confirm the medals')).toHaveAttribute('aria-disabled','true');
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  expect(await lookProblems(lead)).toEqual([]);
  await lead.screenshot({path:info.outputPath('a2-tie-comes-back.png'),fullPage:true});
  await press(settle.getByRole('button',{name:'Settle tie',exact:true}));
  // Opened from Results without a final, the tie decides the bronze.
  await expect(lead.getByRole('heading',{level:1,name:'Tie at 9.80',exact:true})).toBeVisible();
  await expect(lead.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · decides 3rd and 4th`);
  await lead.getByRole('button',{name:'No run-off needed',exact:true}).click();await lead.getByRole('button',{name:'Save tie',exact:true}).click();
  // Saved, the tie goes back to the screen, which reads the places again: nothing left to settle.
  await expect(lead).toHaveURL(new RegExp(`/results/${code}/results-without-a-final$`));
  await expect(lead.getByRole('heading',{name:'Settle first',exact:true})).toHaveCount(0);
  await expect(lead.getByRole('heading',{name:'Worth a look',exact:true})).toHaveCount(0);
  await expect(medalPlaces(lead)).toHaveText([new RegExp(`^1${w(1)}Heat 1 · 9\\.20\\s*Fix$`),new RegExp(`^2${w(11)}Heat 2 · 9\\.35\\s*Fix$`),new RegExp(`^3${w(2)}Heat 1 · 9\\.80\\s*Fix$`)]);
  // The comment is required: the docked button stays grey until there is one.
  await expect(reason(lead)).toHaveText('Write a comment first.');
  await press(docked(lead,'Confirm the medals'),true);
  await expect(lead).toHaveURL(new RegExp(`/results/${code}/results-without-a-final$`));
  await lead.getByLabel('Comment',{exact:true}).fill('Out of time');
  await expect(reason(lead)).toHaveCount(0);
  expect(await lookProblems(lead)).toEqual([]);
  await lead.screenshot({path:info.outputPath('a3-ready.png'),fullPage:true});
  await press(docked(lead,'Confirm the medals'));
  // Back on the event's Heats tab it was opened from, with the toast.
  await expectToast(lead,`Medals confirmed · ${name} Girl Cubs`);
  await expect(lead).toHaveURL(new RegExp(`/results/${code}/heats$`));
  // Done: no Final tab, medal marks instead of Q and no qualifying line, the Day export line and the audit note.
  await expect(tabs(lead)).toHaveText(['Heats','Notes']);
  await expect(lead.getByText('Medal places: 1st, 2nd, 3rd',{exact:true})).toBeVisible();
  const board=lead.getByRole('list',{name:'Official leaderboard'});
  await expect(marks(board)).toHaveText(['1st','2nd','3rd']);
  await expect(board.getByText('Qualifying line')).toHaveCount(0);
  await expect(lead.getByText(`Day export 1st ${w(1)} · 2nd ${w(11)} · 3rd ${w(2)}`,{exact:true})).toBeVisible();
  await expect(lead.getByRole('button',{name:'Heats complete',exact:true})).toHaveCount(0);
  await expect(lead.getByRole('button',{name:'Results without a final',exact:true})).toHaveCount(0);
  await eventTab(lead,'Notes');
  await expect(lead.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText(`${ownName('No final lead')} marked Results without a final - Out of time`);
  await lead.screenshot({path:info.outputPath('a4-done.png'),fullPage:true});
  await back(lead,'Results');
  await expect(resultsCard(lead,code)).toContainText('Medals decided');
});
test('once a lead decides without a final, a volunteer\'s Races shows the event done and its races offer no heat to work',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=await ownCode(),name=ownName('No final done');
  await ownEvent(page.request,code,name);
  // The numbers the other tests here leave free: heat 1 is w(8)..w(10), heat 2 is w(18), w(19) and w(4).
  const w=(number:number)=>2900+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(8),w(9),w(10)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(18),w(19),w(4)],[935,990,1060]);
  const volunteer=(await openPhone(ownName('No final volunteer'))).page;
  const card=volunteer.getByRole('article',{name:`${name} · Girl Cubs`});
  await expect(card.locator('.rz-racecard__status')).toHaveText('Heats 1 and 2 done');
  await expect(card.getByText('A lead makes the final once every heat has run.',{exact:true})).toBeVisible();
  expect((await page.request.post(`/api/lead/events/${code}/complete-stage`,{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{stage:'no-final',comment:'Out of time'}})).ok()).toBe(true);
  // Done: under Done on Races, with no next heat and no final to make.
  await expect(volunteer.locator('details',{hasText:/^Done \(\d+\)/})).toBeVisible(live);
  await volunteer.locator('details',{hasText:/^Done \(\d+\)/}).locator('summary').click();
  await expect(card.locator('.rz-racecard__status')).toHaveText('Heats 1 and 2 done');
  await expect(card.getByRole('button',{name:/^Add heat|^Create the final/})).toHaveCount(0);
  await expect(card.getByText('A lead makes the final once every heat has run.',{exact:true})).toHaveCount(0);
  await volunteer.screenshot({path:info.outputPath('a5-races-done.png'),fullPage:true});
  await openRace(volunteer,name,'Girl Cubs','H2');
  await expect(volunteer.getByRole('status').filter({hasText:'Girl Cubs heats are finished. Ask a lead to change this race.'})).toBeVisible();
  await expect(volunteer.getByLabel('Wristband number',{exact:true})).toHaveCount(0);
  await expect(volunteer.getByRole('button',{name:/^Add heat|^Create the final/})).toHaveCount(0);
  await volunteer.screenshot({path:info.outputPath('a6-race-done.png'),fullPage:true});
});
test('a lead reopens results with a comment: the medals clear, the heats open again and + Final builds a final',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=await ownCode(),name=ownName('Reopened sprint');
  await ownEvent(page.request,code,name);
  // The first test's wristbands with numbers it leaves free: heat 1 is w(5)..w(7), heat 2 is w(15)..w(17).
  const w=(number:number)=>2900+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(5),w(6),w(7)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(15),w(16),w(17)],[935,990,1060]);
  const lead=(await openPhone(ownName('Reopen lead'),{lead:true})).page;
  await openLeadMenu(lead,'Results');
  await resultsCard(lead,code).click();
  await press(lead.getByRole('button',{name:'Results without a final',exact:true}));
  await lead.getByLabel('Comment',{exact:true}).fill('Out of time');await press(docked(lead,'Confirm the medals'));
  await expectToast(lead,`Medals confirmed · ${name} Girl Cubs`);
  await expect(tabs(lead)).toHaveText(['Heats','Notes']);
  const stages=stageButtons(lead);
  await expect(stages).toHaveText(['Reopen results']);
  await lead.screenshot({path:info.outputPath('a5-reopen-offered.png'),fullPage:true});
  await press(stages);
  // Reopen results is its own screen too, and its address opens it again after a reload.
  await expect(lead).toHaveURL(new RegExp(`/results/${code}/reopen-results$`));
  await lead.reload();
  await expect(lead.getByRole('banner').getByRole('heading',{level:1,name:'Reopen results',exact:true})).toBeVisible();
  await expect(lead.getByRole('heading',{level:2,name:'Reopen the results?',exact:true})).toBeVisible();
  await expect(lead.getByText('This clears the medals and opens the heats again. You can then run a final or choose Results without a final again.',{exact:true})).toBeVisible();
  await expect(lead.getByRole('list',{name:'Medal places'})).toHaveCount(0);
  // The comment is required: the docked Reopen results stays grey until there is one. Back is the only way out.
  await expect(reason(lead)).toHaveText('Write a comment first.');
  await press(docked(lead,'Reopen results'),true);
  await expect(lead).toHaveURL(new RegExp(`/results/${code}/reopen-results$`));
  await expect(lead.getByRole('dialog')).toHaveCount(0);await expect(lead.getByRole('button',{name:/^Close/})).toHaveCount(0);
  await lead.getByLabel('Comment',{exact:true}).fill('The final fits after all');
  expect(await lookProblems(lead)).toEqual([]);
  await lead.screenshot({path:info.outputPath('a5-reopen-screen.png'),fullPage:true});
  await press(docked(lead,'Reopen results'));
  await expectToast(lead,`Results reopened · ${name} Girl Cubs`);
  // Heats open again: the Final tab, the qualifying line and Q marks, no medals, no Day export line, and the audit note.
  await expect(tabs(lead)).toHaveText(['Heats','Final','Notes']);
  await expect(lead.getByText('Fastest 6 go to the final',{exact:true})).toBeVisible();
  const board=lead.getByRole('list',{name:'Provisional leaderboard'});
  await expect(marks(board)).toHaveText(Array(6).fill('Q'));
  await expect(board.getByText('Qualifying line',{exact:true})).toBeVisible();
  await expect(lead.getByText(/^Day export/)).toHaveCount(0);
  await expect(stages).toHaveText(['Results without a final']);
  await eventTab(lead,'Notes');
  await expect(lead.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText(`${ownName('Reopen lead')} reopened Results without a final - The final fits after all`);
  await eventTab(lead,'Heats');
  await lead.screenshot({path:info.outputPath('a5-heats-open.png'),fullPage:true});
  await back(lead,'Races');await makeFinal(lead,name,'Girl Cubs');
  await openLeadMenu(lead,'Results');await resultsCard(lead,code).click();
  await expect(stageButtons(lead)).toHaveText(['Reopen heats','Results without a final']);
  await eventTab(lead,'Final');
  await expect(lead.getByText('The final\'s order appears here once its finishing order is saved.',{exact:true})).toBeVisible();
});
test('after + Final, a lead chooses Results without a final before the final starts: its line-up is discarded, and Reopen results then + Final builds a fresh final',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=await ownCode(),name=ownName('Late no final');
  await ownEvent(page.request,code,name);
  // Girl Cubs wristbands no other test types: heat 1 is w(1)..w(3), heat 2 is w(11)..w(13).
  const w=(number:number)=>2540+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2),w(3)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(11),w(12),w(13)],[935,990,1060]);
  const lead=(await openPhone(ownName('Late no final lead'),{lead:true})).page;
  await makeFinal(lead,name,'Girl Cubs');
  await openLeadMenu(lead,'Results');
  await resultsCard(lead,code).click();
  // The final is built and nobody has touched it: the option sits under Reopen heats, and Confirm the medals waits on the Final tab until the final has an order.
  const stages=stageButtons(lead);
  await expect(stages).toHaveText(['Reopen heats','Results without a final']);
  await eventTab(lead,'Final');
  await expect(lead.getByText('The final\'s order appears here once its finishing order is saved.',{exact:true})).toBeVisible();
  await expect(stages).toHaveCount(0);
  await eventTab(lead,'Heats');
  await lead.screenshot({path:info.outputPath('a6-final-built.png'),fullPage:true});
  // Back leaves the screen and changes nothing.
  await press(lead.getByRole('button',{name:'Results without a final',exact:true}));
  await expect(lead).toHaveURL(new RegExp(`/results/${code}/results-without-a-final$`));
  await back(lead,`${name} · Girl Cubs`);
  await expect(stages).toHaveText(['Reopen heats','Results without a final']);
  await press(lead.getByRole('button',{name:'Results without a final',exact:true}));
  await expect(lead.getByRole('heading',{name:'Settle first',exact:true})).toHaveCount(0);
  await expect(medalPlaces(lead)).toHaveText([new RegExp(`^1${w(1)}Heat 1`),new RegExp(`^2${w(11)}Heat 2`),new RegExp(`^3${w(2)}Heat 1`)]);
  await expect(lead.getByText("The final's line-up will be discarded.",{exact:true})).toBeVisible();
  await expect(lead.getByText('No final will be run. Medals go to the 3 fastest heat times.',{exact:true})).toBeVisible();
  await lead.getByLabel('Comment',{exact:true}).fill('Out of time');
  expect(await lookProblems(lead)).toEqual([]);
  await lead.screenshot({path:info.outputPath('a6-discard-screen.png'),fullPage:true});
  await press(docked(lead,'Confirm the medals'));
  await expectToast(lead,`Medals confirmed · ${name} Girl Cubs`);
  await expect(tabs(lead)).toHaveText(['Heats','Notes']);
  await expect(marks(lead.getByRole('list',{name:'Official leaderboard'}))).toHaveText(['1st','2nd','3rd']);
  await expect(stages).toHaveText(['Reopen results']);
  await lead.screenshot({path:info.outputPath('a6-done.png'),fullPage:true});
  await press(stages);
  await lead.getByLabel('Comment',{exact:true}).fill('The final fits after all');await press(docked(lead,'Reopen results'));
  await expectToast(lead,`Results reopened · ${name} Girl Cubs`);
  // Heats open again, not complete: + Final on Races builds a fresh final.
  await expect(tabs(lead)).toHaveText(['Heats','Final','Notes']);
  await expect(stages).toHaveText(['Results without a final']);
  await back(lead,'Races');await makeFinal(lead,name,'Girl Cubs');
  await openLeadMenu(lead,'Results');await resultsCard(lead,code).click();
  await expect(stageButtons(lead)).toHaveText(['Reopen heats','Results without a final']);
  await eventTab(lead,'Final');
  await expect(lead.getByText('The final\'s order appears here once its finishing order is saved.',{exact:true})).toBeVisible();
});
