import { clock } from '../src/shared/clock.js';
import type { RaceRead } from '../src/shared/races.js';
import {eventTab,ownName,ownEvent,ownWristbands,writeCheckIn,ownCode,deleteCurrentRace,recordRace,back,openLeadMenu,becomeLead,expect,expectToast,join,dragTo,lookProblems,press,raceAction,test} from './fixtures.js';
test('a lead repairs a race, keeps failed corrections, deletes and restores it, then calls a prefilled re-run',async({page},info)=>{
  // The test day is shared and projects run at once: each names its own event, so its race screen tile is its alone.
  const code=await ownCode(),name=ownName('Race corrections');
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2001,2002],[1300,1200]);
  await page.goto('/');await join(page,ownName('Race lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await eventTab(page,'Races');const racesTab=page.url();await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();const racePage=page.url();await raceAction(page,'Correct times');
  const save=page.getByRole('contentinfo').getByRole('button',{name:'Save times',exact:true});
  await press(page.getByRole('button',{name:/^2nd place · /}));await page.getByLabel('2nd place time',{exact:true}).fill('1400');
  // A refused save keeps the screen and what was typed, and says why.
  let failed=true;await page.route('**/api/lead/races/*/times',async route=>{if(failed){failed=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'The server is busy'})});}else await route.continue();});
  await press(save);await expect(page.getByRole('alert')).toHaveText('Not saved - try again. The server is busy');await expect(page.getByLabel('2nd place time',{exact:true})).toHaveValue('14.00');
  await press(save);await expectToast(page,'Times saved · Girl Cubs Heat 1');await expect(page).toHaveURL(racePage);
  // Out-of-order times need the lead's explicit acceptance, taken back by any change to a time.
  await raceAction(page,'Correct times');await press(page.getByRole('button',{name:/^1st place · /}));await page.getByLabel('1st place time',{exact:true}).fill('1500');
  const accept=page.getByRole('button',{name:'Accept these out-of-order times',exact:true});
  await press(accept);await expect(accept).toHaveAttribute('aria-pressed','true');await page.getByLabel('1st place time',{exact:true}).fill('1600');await expect(accept).toHaveAttribute('aria-pressed','false');
  await press(accept);expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('lead-time-acceptance.png'),fullPage:true});
  await press(save);await expectToast(page,'Times saved · Girl Cubs Heat 1');await expect(page).toHaveURL(racePage);
  const sheet=page.getByRole('dialog');
  await raceAction(page,'Correct runner list');await sheet.getByRole('button',{name:'Runner 2 · 2002',exact:true}).click();await sheet.getByLabel('Wristband for runner 2',{exact:true}).fill('4045');await sheet.getByRole('button',{name:'Review runner list',exact:true}).click();await expect(sheet.getByText('4045 belongs to Girl Scouts - this race is Girl Cubs',{exact:true})).toBeVisible();await sheet.getByRole('button',{name:'Fix runners',exact:true}).click();await sheet.getByRole('button',{name:'Review runner list',exact:true}).click();await sheet.getByRole('button',{name:'Keep warnings',exact:true}).click();await page.screenshot({path:info.outputPath('lead-runner-review.png'),fullPage:true});await sheet.getByRole('button',{name:'Save runner list',exact:true}).click();await expect(sheet).toHaveCount(0);await expect(page.getByRole('button',{name:'Runner 4045',exact:true})).toHaveText(/^2nd\s*4045\s*14\.00/);
  await page.screenshot({path:info.outputPath('race-corrected.png'),fullPage:true});
  // Delete goes back to the event's Races tab; Restore stays on the restored race page.
  await raceAction(page,'Delete Heat 1');await press(page.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 1',exact:true}));await expectToast(page,'Heat 1 moved to Deleted races · Girl Cubs');await expect(page).toHaveURL(racesTab);
  await page.getByRole('button',{name:/^Open deleted Heat 1 · deleted\s\d\d:\d\d$/}).click();const deletedPage=page.url();
  await raceAction(page,'Restore Heat 1');await expect(page.getByText('Its results count again.',{exact:true})).toBeVisible();await press(page.getByRole('contentinfo').getByRole('button',{name:'Restore Heat 1',exact:true}));await expectToast(page,'Heat 1 restored · Girl Cubs');await expect(page).toHaveURL(deletedPage);
  // Re-run lands on the new heat, its runners pre-filled; the phone's Back goes where Back from the old race went.
  await raceAction(page,'Re-run race');await page.getByLabel('Comment (optional)',{exact:true}).fill('Recording lost');await press(page.getByRole('contentinfo').getByRole('button',{name:'Re-run Heat 1',exact:true}));await expectToast(page,'Re-run made · Girl Cubs Heat 1');
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'}).getByRole('tab',{name:/^Runners/})).toContainText('2 so far');
  await expect(page.getByRole('list',{name:'Wristbands entered'}).getByRole('button')).toHaveText(['2001','4045']);
  await page.screenshot({path:info.outputPath('race-rerun.png'),fullPage:true});
  await page.goBack();await expect(page).toHaveURL(racesTab);
  // The replaced heat can only be deleted for good: a screen with no choice, back to the Races tab.
  await page.getByRole('button',{name:/^Open deleted Heat 1 · deleted\s\d\d:\d\d$/}).click();await raceAction(page,'Delete for good');
  await expect(page.getByText('It is already in Deleted races. Deleting it for good cannot be undone. Notes stay.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^Move to Deleted races/})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await press(page.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 1 for good',exact:true}));await expectToast(page,'Heat 1 deleted for good · Girl Cubs');await expect(page).toHaveURL(racesTab);
  await expect(page.getByRole('button',{name:/^Open deleted Heat 1/})).toHaveCount(0);await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('permanently deleted');await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('called a re-run of Heat 1');
  await deleteCurrentRace(page.request,code);
});
test('two deleted Heat 1s are told apart by when each was deleted',async({page},info)=>{
  const code=await ownCode(),name=ownName('Two deleted heats'),owner=process.env.E2E_OWNER_TOKEN!,lead={authorization:`Bearer ${owner}`};
  await ownEvent(page.request,code,name);
  const child=await ownWristbands('Girl Cubs',2),deletedAt=new Map<string,string>();
  for(const key of [1,2]) {
    const {race}=await writeCheckIn(page.request,owner,code,[child(key)]);expect(race.number).toBe(1);
    const deleted=await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:lead,data:{permanent:false}});expect(deleted.ok()).toBe(true);
    for(const row of await (await page.request.get(`/api/lead/events/${code}/deleted-races`,{headers:lead})).json() as RaceRead[]) deletedAt.set(row.id,row.deletedAt!);
  }
  await page.goto('/');await join(page,ownName('Two deleted heats lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await eventTab(page,'Races');const rows=page.getByRole('heading',{name:'Deleted races',exact:true}).locator('..').getByRole('button',{name:/^Open deleted/});
  const names=[...deletedAt.values()].reverse().map(at=>`Open deleted Heat 1 · deleted ${clock(at)}`);await expect(rows).toHaveCount(names.length);
  for(const [index,name] of names.entries()) await expect(rows.nth(index)).toHaveAccessibleName(name);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('deleted-races-times.png'),fullPage:true});
});
test('a lead can correct times again straight after saving, even when the race is slow to re-read',async({page})=>{
  const code=await ownCode(),headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await ownEvent(page.request,code,'Quick corrections','Girl Cubs','timed');
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2001,2002],[1200,1300]);
  await page.goto('/');await join(page,ownName('Quick lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await eventTab(page,'Races');await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();await raceAction(page,'Correct times');
  const save=page.getByRole('contentinfo').getByRole('button',{name:'Save times',exact:true});
  await press(page.getByRole('button',{name:/^2nd place · /}));await page.getByLabel('2nd place time',{exact:true}).fill('1400');
  // A slow re-read of the race must not let the lead reopen Correct times on the version just replaced.
  await page.route(`**/api/lead/races/${race.id}`,async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.continue();});
  await press(save);await expectToast(page,'Times saved · Girl Cubs Heat 1');
  await raceAction(page,'Correct times');
  await expect(page.getByRole('button',{name:'2nd place · 14.00',exact:true})).toBeVisible();
  await press(page.getByRole('button',{name:/^2nd place · /}));await page.getByLabel('2nd place time',{exact:true}).fill('1500');await press(save);await expectToast(page,'Times saved · Girl Cubs Heat 1');
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
test('a lead corrects a saved race\'s finishing order on its screen: a drag without Save changes nothing; one Save is one toast and one Notes line',async({page},info)=>{
  // The screen twice, a sheet and the Notes tab: more than the default 30 s on a busy machine.
  test.setTimeout(60000);
  const code=await ownCode(),headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await ownEvent(page.request,code,'Order corrections','Girl Cubs','timed');
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2001,2002,2003],[1200,1300,1400]);
  // The race page at its address: the walk there from Results is the first test's (this one is long enough).
  await page.goto('/');await join(page,ownName('Order lead'),{job:'Start line'});await becomeLead(page);
  await page.goto(`/results/${code}/races/${race.id}`);const racePage=page.url();
  const record=page.getByRole('list',{name:'Current record',exact:true}).getByRole('button');
  await expect(record).toHaveText([/^1st\s*2001/,/^2nd\s*2002/,/^3rd\s*2003/]);
  await raceAction(page,'Correct finishing order');
  await expect(page).toHaveURL(`${racePage}/correct-finishing-order`);
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Correct finishing order',exact:true})).toBeVisible();
  const rows=page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem'),footer=page.getByRole('contentinfo');
  const save=footer.getByRole('button',{name:'Save finishing order',exact:true});
  await expect(rows).toHaveText(['1st200112.00No place','2nd200213.00No place','3rd200314.00No place']);
  await expect(footer.getByText('Change the order to save.',{exact:true})).toBeVisible();await expect(save).toHaveAttribute('aria-disabled','true');
  await expect(page.locator('input:focus,textarea:focus')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('order-screen.png'),fullPage:true});
  // Times stay by place: 2003 dragged to 1st takes 1st place's time. Back without Save changes nothing.
  await dragTo(page,page.getByRole('button',{name:'Move 2003',exact:true}),rows.first());
  await expect(rows).toHaveText(['1st200312.00No place','2nd200113.00No place','3rd200214.00No place']);
  await expect(footer.locator('.rz-footer__reason')).toHaveCount(0);
  await back(page,'Heat 1');await expect(page).toHaveURL(racePage);
  await expect(record).toHaveText([/^1st\s*2001/,/^2nd\s*2002/,/^3rd\s*2003/]);
  await raceAction(page,'Correct finishing order');
  await dragTo(page,page.getByRole('button',{name:'Move 2003',exact:true}),rows.first());
  await expect(rows).toHaveText(['1st200312.00No place','2nd200113.00No place','3rd200214.00No place']);
  // No place asks what happened; "No place" stays on one line beside the number.
  const noPlace=page.getByRole('button',{name:'No place for 2002',exact:true});
  expect((await noPlace.boundingBox())!.height).toBeLessThan(50);
  await press(noPlace);
  const ask=page.getByRole('dialog',{name:'No place for 2002',exact:true});
  await expect(ask.getByText('2002 has no place. What happened?',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('order-no-place.png'),fullPage:true});
  await press(ask.getByRole('button',{name:'Did not finish',exact:true}));await expect(ask).toHaveCount(0);
  await expect(rows).toHaveText(['1st200312.00No place','2nd200113.00No place']);
  await expect(page.getByRole('list',{name:'No place',exact:true}).getByRole('listitem')).toHaveText(['2002Did not finishGive a place']);
  await page.getByLabel('Comment (optional)',{exact:true}).fill('Checked the video');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('order-corrected.png'),fullPage:true});
  await press(save);
  await expectToast(page,'Finishing order saved · Girl Cubs Heat 1');await expect(page).toHaveURL(racePage);
  await expect(record.first()).toHaveText(/^1st\s*2003[\s\S]*12\.00/);
  await back(page,'Order corrections · Girl Cubs');
  await expect(page.getByRole('button',{name:'Open Heat 1',exact:true})).toHaveAccessibleDescription(/ · finishers and times don't agree$/);
  await eventTab(page,'Notes');const notes=page.getByRole('list',{name:'Audit notes'}).getByRole('listitem');
  await expect(notes.filter({hasText:'corrected the finishing order'})).toHaveText([/corrected the finishing order for Heat 1: 2003, 2001; Did not finish 2002 - Checked the video/]);
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
test('Correct finishing order sends one save with the versions it was read at: a change made meanwhile is a clash, said with its reason',async({page})=>{
  const code=await ownCode(),headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await ownEvent(page.request,code,'Order clash','Girl Cubs','timed');
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2001,2002],[1200,1300]);
  await page.goto('/');await join(page,ownName('Order clash lead'),{job:'Start line'});await becomeLead(page);
  await page.goto(`/results/${code}/races/${race.id}/correct-finishing-order`);
  const rows=page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
  await expect(rows).toHaveText(['1st200112.00No place','2nd200213.00No place']);
  // Another lead saves a new order while this screen is open.
  const saved=(await (await page.request.get(`/api/lead/races/${race.id}`,{headers})).json()).race;
  expect((await page.request.post(`/api/lead/races/${race.id}/finish-order`,{headers,data:{baseVersion:saved.parts.finish.version,runnersVersion:saved.parts.runners.version,order:[2002,2001],didNotFinish:[],didNotRun:[]}})).ok()).toBe(true);
  await dragTo(page,page.getByRole('button',{name:'Move 2002',exact:true}),rows.first());
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Save finishing order',exact:true}));
  await expect(page.getByRole('alert')).toHaveText('Not saved - try again. This race has changed - open it again');
  await expect(page).toHaveURL(new RegExp(`/races/${race.id}/correct-finishing-order$`));
  expect(await lookProblems(page)).toEqual([]);
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
