import {eventTab,lookProblems,ownName,ownWristbands,ownEvent,ownCode,backToRaces,confirmTheMedals,deleteCurrentRace,live,medalPlaces,openRace,recordRace,openLeadsBarTab,becomeLead,expect,expectToast,join,test,raceAction,press,resultsCard} from './fixtures.js';
test('timed Event complete checks blockers, locks the event\'s races live, and reopens with a retained comment',async({page,openPhone},info)=>{
  const code=await ownCode(),name=ownName('Stage event');
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2601,2602],[1000,1100]);
  // A volunteer starts Heat 2 from the card and checks a runner in.
  const job=(await openPhone(ownName('Stage starter'))).page;
  const card=job.getByRole('article',{name:`${name} · Girl Cubs`});
  // Every heat saved, the event stays in progress: it reaches Done only once a lead confirms its medals.
  await expect(job.locator('details',{hasText:/^Done \(\d+\)/}).filter({has:card})).toHaveCount(0);
  await card.getByRole('button',{name:'Add heat 2',exact:true}).click();
  await job.getByRole('dialog',{name:'New race'}).getByRole('button',{name:'Create heat 2',exact:true}).click();
  const input=job.getByLabel('Wristband number',{exact:true});await input.fill('2603');await input.press('Enter');
  await expect(job.locator('.rz-prompt__meta')).toHaveText('Heat 2 · 1 runner so far');
  await page.goto('/');await join(page,ownName('Stage lead'),{job:'Start line'});
  await becomeLead(page);await openLeadsBarTab(page,'Results');
  await press(resultsCard(page,code));await press(page.getByRole('button',{name:'Confirm the medals',exact:true}));
  // The Confirm the medals screen: Heat 2 must be settled first, so the docked Confirm stays grey with the reason above it.
  await expect(page).toHaveURL(new RegExp(`/results/${code}/confirm-the-medals$`));
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · 2 heats · no final`);
  const settle=page.getByRole('list',{name:'Settle first',exact:true}).getByRole('listitem');
  await expect(settle).toHaveText(['Heat 2 is in progress (1 checked in) - finish its steps or delete itOpen Heat 2']);
  const footer=page.getByRole('contentinfo'),confirm=footer.getByRole('button',{name:'Confirm the medals',exact:true});
  await expect(footer.getByText('Settle 1 thing first.',{exact:true})).toBeVisible();await expect(confirm).toHaveAttribute('aria-disabled','true');
  await press(confirm,true);await expect(page).toHaveURL(new RegExp(`/results/${code}/confirm-the-medals$`));await expect(page.getByText(/^Medals confirmed/)).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('must-settle-first.png'),fullPage:true});
  // Open Heat 2 opens its race; once deleted, the lead is back on Confirm the medals with nothing left to settle.
  await press(settle.getByRole('button',{name:'Open Heat 2',exact:true}));await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Heat 2',exact:true})).toBeVisible();
  await raceAction(page,'Delete Heat 2');await press(page.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 2',exact:true}));await expectToast(page,'Heat 2 moved to Deleted races');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/confirm-the-medals$`));
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · 1 heat · no final`);
  await expect(page.getByRole('heading',{name:'Settle first',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Worth a look',exact:true})).toHaveCount(0);
  await expect(footer.locator('.rz-footer__reason')).toHaveCount(0);await expect(confirm).not.toHaveAttribute('aria-disabled');
  await expect(medalPlaces(page)).toHaveText([/^12601Heat 1 · 10\.00\s*Fix$/,/^22602Heat 1 · 11\.00\s*Fix$/,/^3-$/]);
  // The volunteer's Heat 2 is gone; they open the saved Heat 1.
  await expect(job.getByText('A lead deleted Heat 2',{exact:true})).toBeVisible(live);
  await backToRaces(job);await openRace(job,name);
  await expect(job.locator('.rz-needsband')).toHaveText('In Results. Ask a lead to change it.');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('confirm-the-medals.png'),fullPage:true});await confirmTheMedals(page);
  // Back on the event's Heats tab it was opened from, with the toast.
  await expectToast(page,`Medals confirmed`);await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(page.getByText('Day export 1st 2601 · 2nd 2602 · 3rd -',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('completed-event.png'),fullPage:true});
  // The volunteer's race locks live, and the event offers no new heat.
  await expect(job.getByRole('status').filter({hasText:'Girl Cubs heats are finished. Ask a lead to change this race.'})).toBeVisible(live);
  await expect(job.getByLabel('Wristband number',{exact:true})).toHaveCount(0);await expect(job.getByRole('button',{name:/^Add heat/})).toHaveCount(0);
  await job.screenshot({path:info.outputPath('locked-race.png'),fullPage:true});
  // Reopen event sits in Confirm the medals' place and opens its own screen: the warning, a required comment, docked Reopen event.
  await press(page.getByRole('button',{name:'Reopen event',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/reopen-event$`));
  await expect(page.getByRole('heading',{level:2,name:'Reopen the event?',exact:true})).toBeVisible();
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Reopen event',exact:true})).toBeVisible();
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · 1 heat · no final`);
  const reopen=footer.getByRole('button',{name:'Reopen event',exact:true});
  await expect(footer.locator('.rz-footer__reason')).toHaveText('Write a comment first.');await press(reopen,true);await expect(page).toHaveURL(new RegExp(`/results/${code}/reopen-event$`));
  await page.getByLabel('Comment',{exact:true}).fill('Late time correction');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('reopen-event.png'),fullPage:true});
  // A failed save stays on the screen with the comment kept.
  let failed=false;await page.route('**/api/lead/events/*/reopen-stage',async route=>{if(!failed){failed=true;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'This stage changed - try again'})});}else await route.continue();});
  await press(reopen);await expect(page.getByRole('main').getByRole('alert')).toContainText('Not saved - try again');await expect(page.getByLabel('Comment',{exact:true})).toHaveValue('Late time correction');
  await press(reopen);
  await expectToast(page,`Event reopened`);await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  // Reopened, the race is saved again rather than locked, and the event offers its next heat: Heat 2 again, as the deleted Heat 2 freed its number.
  await expect(job.getByRole('status').filter({hasText:'Girl Cubs heats are finished. Ask a lead to change this race.'})).toHaveCount(0,live);
  await expect(job.getByRole('button',{name:'Add heat 2',exact:true})).toBeVisible();
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('Late time correction');
  await deleteCurrentRace(page.request,code);
});
test('Confirm the medals: Fix opens the place\'s heat on Correct times and returns with the places brought up to date, and Settle tie returns too',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Medals fix'),w=await ownWristbands('Girl Cubs',4);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  // One runner per heat: a tie at 10.00 decides 3rd and 4th.
  for(const [wristband,time] of [[w(1),900],[w(2),950],[w(3),1000],[w(4),1000]]) await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[wristband],[time]);
  const {page}=await openPhone(ownName('Medals fix lead'),{lead:true});
  await openLeadsBarTab(page,'Results');await press(resultsCard(page,code));
  await press(page.getByRole('button',{name:'Confirm the medals',exact:true}));
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · 4 heats · no final`);
  const settle=page.getByRole('list',{name:'Settle first',exact:true}).getByRole('listitem');
  await expect(settle).toHaveCount(1);await expect(settle.getByRole('button')).toHaveText(['Settle tie']);
  await expect(page.getByRole('contentinfo').getByText('Settle 1 thing first.',{exact:true})).toBeVisible();
  const places=medalPlaces(page);
  await expect(places.nth(0)).toHaveText(new RegExp(`^1${w(1)}Heat 1 · 9\\.00\\s*Fix$`));await expect(places.nth(1)).toHaveText(new RegExp(`^2${w(2)}Heat 2 · 9\\.50\\s*Fix$`));
  await expect(places.nth(2).getByText('Tie',{exact:true})).toBeVisible();await expect(places.nth(1).getByText('Tie',{exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('confirm-the-medals-tie.png'),fullPage:true});
  // Fix on 2nd opens Heat 2 straight on Correct times; saved, the lead is back here and 2nd and 3rd are now the tie.
  await press(page.getByRole('button',{name:`Fix 2nd: ${w(2)}`,exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/[^/]+/correct-times$`));
  await expect(page.getByRole('heading',{level:1,name:'Correct times',exact:true})).toBeVisible();
  await press(page.getByRole('button',{name:'1st place · 9.50',exact:true}));
  const time=page.getByLabel('1st place time',{exact:true});await time.pressSequentially('1050');await time.press('Enter');
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Save times',exact:true}));
  await expectToast(page,'Times saved');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/confirm-the-medals$`));
  await expect(places.nth(1)).toHaveText(/^2\d+Heat [34] · 10\.00Tie\s*Fix$/);await expect(places.nth(2)).toHaveText(/^3\d+Heat [34] · 10\.00Tie\s*Fix$/);
  await expect(page.getByRole('list',{name:'Medal places',exact:true})).not.toContainText(String(w(2)));
  // Settle tie opens the tie screen, judged as the medals see it; saved, the lead is back here with nothing left to settle.
  await press(settle.getByRole('button',{name:'Settle tie',exact:true}));
  await expect(page.getByRole('heading',{level:1,name:'Tie at 10.00',exact:true})).toBeVisible();
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · decides 2nd and 3rd`);
  await press(page.getByRole('button',{name:'No run-off needed',exact:true}));await press(page.getByRole('button',{name:'Save tie',exact:true}));
  await expectToast(page,`Tie saved`);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/confirm-the-medals$`));
  await expect(page.getByRole('heading',{name:'Settle first',exact:true})).toHaveCount(0);
  await expect(page.getByRole('list',{name:'Medal places',exact:true}).getByText('Tie',{exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('confirm-the-medals-ready.png'),fullPage:true});
  await confirmTheMedals(page);
  await expectToast(page,`Medals confirmed`);await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(page.getByText(new RegExp(`^Day export 1st ${w(1)} · 2nd \\d+ · 3rd \\d+$`))).toBeVisible();
});
