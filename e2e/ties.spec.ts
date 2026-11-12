import {writeFile} from 'node:fs/promises';
import readExcelFile from 'read-excel-file/node';
import {back,eventTab,ownName,ownEvent,ownCode,recordRace,openLeadMenu,becomeLead,dragTo,expect,expectToast,join,lookProblems,press,test,type Page,resultsCard} from './fixtures.js';
/** The tie screen's docked Save tie and the reason above it while it cannot save. */
const saveTie=(page:Page)=>page.getByRole('button',{name:'Save tie',exact:true});
const reason=(page:Page)=>page.locator('.rz-footer__reason');
test('a lead settles a tie on its screen, reconsiders a changed medal decision and records its order with a comment',async({page},info)=>{
  const code=await ownCode(),name=ownName('Tie event');
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  const createRace=(number:number,time:number)=>recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[number],[time]);
  await createRace(2701,1000);await createRace(2702,1000);
  await page.goto('/');await join(page,ownName('Tie lead'),{job:'Start line'});
  await becomeLead(page);await openLeadMenu(page,'Results');
  await press(resultsCard(page,code));
  // The TIE tag opens the tie as its own screen at its own address.
  await press(page.getByRole('button',{name:'TIE at 10.00 for 2701',exact:true}));
  await expect(page.getByRole('heading',{level:1,name:'Tie at 10.00',exact:true})).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/results/${code}/ties/[^/]+$`));
  await expect(page.getByRole('banner').getByRole('button',{name:`Back to ${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · decides 1st and 2nd`);
  await expect(page.getByRole('heading',{level:2,name:'How was the tie decided?',exact:true})).toBeVisible();
  await expect(page.locator('.rz-prompt__help')).toHaveText('2701 (Heat 1) and 2702 (Heat 2) both ran 10.00.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Close tie',exact:true})).toHaveCount(0);
  await expect(reason(page)).toHaveText('Choose how the tie was decided.');
  await expect(saveTie(page)).toHaveAttribute('aria-disabled','true');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('tie-screen.png'),fullPage:true});
  await press(page.getByRole('button',{name:'No run-off needed',exact:true}));
  await expect(page.getByRole('list',{name:'Tie order'})).toHaveCount(0);
  await expect(reason(page)).toHaveCount(0);
  await press(saveTie(page));
  // Saved, the lead is back on the event's Heats tab with the toast.
  await expectToast(page,`Tie saved · ${name} Girl Cubs`);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(page.getByRole('button',{name:/^TIE at/})).toHaveCount(0);
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('No run-off needed');
  // A faster runner makes the tie decide 2nd and 3rd: the medal decision changed, so it comes back.
  await eventTab(page,'Heats');await createRace(2703,800);await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await press(page.getByRole('button',{name:'TIE at 10.00 for 2701',exact:true}));
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${name} · Girl Cubs · decides 2nd and 3rd`);
  await press(page.getByRole('button',{name:'Decided without a run-off',exact:true}));
  await expect(page.getByRole('button',{name:'Decided without a run-off',exact:true})).toHaveAttribute('aria-pressed','true');
  // The comment is needed only for a decision without a run-off; no field takes focus on its own.
  await expect(reason(page)).toHaveText('Write why it was decided this way.');
  await expect(saveTie(page)).toHaveAttribute('aria-disabled','true');
  await expect(page.getByLabel('Comment',{exact:true})).not.toBeFocused();
  await page.getByLabel('Comment',{exact:true}).fill('Runner had already left');
  await expect(reason(page)).toHaveCount(0);
  // The order's places start at the tie's first place, and each row shows its heat.
  const order=page.getByRole('list',{name:'Tie order'}),rows=order.getByRole('listitem');
  await expect(rows).toHaveText([/^2nd2701Heat 1/,/^3rd2702Heat 2/]);
  await dragTo(page,order.getByRole('button',{name:'Move 2702',exact:true}),rows.filter({hasText:'2701'}));
  await expect(rows).toHaveText([/^2nd2702Heat 2/,/^3rd2701Heat 1/]);
  expect(await lookProblems(page)).toEqual([]);
  let fail=true;
  await page.route('**/api/lead/events/*/settle-tie',async route=>{
    if(fail) {fail=false;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'The server is busy'})});}
    else await route.continue();
  });
  await press(saveTie(page));
  // A refused save keeps the screen, the comment and the order.
  await expect(page.getByRole('alert')).toHaveText('Not saved - try again. The server is busy');
  await expect(page.getByLabel('Comment',{exact:true})).toHaveValue('Runner had already left');
  await expect(rows.first()).toContainText('2702');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('tie-screen-order.png'),fullPage:true});
  await press(saveTie(page));
  await expectToast(page,`Tie saved · ${name} Girl Cubs`);
  const ranked=page.getByRole('list',{name:'Provisional leaderboard'}).locator(':scope > li');
  await expect(ranked.nth(1)).toContainText('2702');await expect(ranked.nth(1)).toContainText('10.00');
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('without a run-off: 2702 then 2701 - Runner had already left');
  await page.screenshot({path:info.outputPath('settled-tie.png'),fullPage:true});
});
test('a tie between two heats runs end to end: leaderboard TIE tags, the tie screen with drag handles, Back and reload, and the day export',async({page},info)=>{
  test.setTimeout(60000);
  const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  const code=await ownCode(),name=ownName('Tie heats');
  await ownEvent(page.request,code,name,'Girl Cubs','heats');
  const races:string[]=[];
  const heat=async(runners:number[],places:number[])=>{races.push((await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,runners,places)).id);};
  // 2731 and 2735 share a time in Heat 1; 2733 has the same time in Heat 2.
  await heat([2731,2735,2736],[1000,1000,1200]);await heat([2733,2734],[1000,1100]);
  try {
    await page.goto('/');await join(page,ownName('Tie heats lead'),{job:'Start line'});await becomeLead(page);
    // The card's Decide the tie button says why "+ Final" is off, in place of the line beside it, and opens the tie.
    const racesCard=page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
    await expect(racesCard.getByRole('button',{name:'Create the final from the fastest 6',exact:true})).toHaveAttribute('aria-disabled','true');
    await expect(racesCard.locator('.rz-heat-reason')).toHaveCount(0);
    expect(await lookProblems(page)).toEqual([]);
    await press(racesCard.getByRole('button',{name:'Decide the tie',exact:true}));
    await expect(page.getByRole('heading',{level:1,name:'Tie at 10.00',exact:true})).toBeVisible();
    await back(page,'Races');
    await openLeadMenu(page,'Results');await press(resultsCard(page,code));
    const board=page.getByRole('list',{name:'Provisional leaderboard'});
    for(const wristband of [2731,2735,2733]) {
      await expect(board.getByRole('button',{name:`TIE at 10.00 for ${wristband}`,exact:true})).toBeVisible();
      await expect(board.getByRole('button',{name:new RegExp(`^Runner ${wristband} · Heat`)})).toContainText('Q');
    }
    await page.screenshot({path:info.outputPath('tie-leaderboard.png'),fullPage:true});
    // The phone's Back leaves the tie for the leaderboard it was opened from.
    await press(board.getByRole('button',{name:'TIE at 10.00 for 2731',exact:true}));
    await expect(page.getByRole('heading',{level:1,name:'Tie at 10.00',exact:true})).toBeVisible();
    await expect(page.locator('.rz-prompt__help')).toHaveText('2731 (Heat 1), 2735 (Heat 1) and 2733 (Heat 2) all ran 10.00.');
    await page.goBack();
    await expect(board).toBeVisible();await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
    await press(board.getByRole('button',{name:'TIE at 10.00 for 2731',exact:true}));
    await press(page.getByRole('button',{name:'Run-off held',exact:true}));
    const order=page.getByRole('list',{name:'Tie order'}),rows=order.getByRole('listitem');
    await expect(rows).toHaveText([/^1st2731Heat 1/,/^2nd2735Heat 1/,/^3rd2733Heat 2/]);
    await expect(page.getByText('Runners from the same race stay in their finishing order.',{exact:true})).toBeVisible();
    // A comment is optional for a run-off.
    await expect(page.getByLabel('Comment (optional)',{exact:true})).toBeVisible();
    await expect(reason(page)).toHaveCount(0);
    expect(await lookProblems(page)).toEqual([]);
    await page.screenshot({path:info.outputPath('tie-screen-handles.png'),fullPage:false});
    // Runners from the same heat keep their finishing order: that drop springs back.
    await dragTo(page,order.getByRole('button',{name:'Move 2735',exact:true}),rows.filter({hasText:'2731'}));
    await expect(rows).toHaveText([/2731/,/2735/,/2733/]);
    await dragTo(page,order.getByRole('button',{name:'Move 2733',exact:true}),rows.filter({hasText:'2731'}));
    await expect(rows).toHaveText([/^1st2733/,/^2nd2731/,/^3rd2735/]);
    await page.screenshot({path:info.outputPath('tie-screen-dragged.png'),fullPage:false});
    // A reload keeps the tie screen; with no history behind it, Back goes up to its event.
    await page.reload();
    await expect(page.getByRole('heading',{level:1,name:'Tie at 10.00',exact:true})).toBeVisible();
    await back(page,`${name} · Girl Cubs`);
    await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
    await press(board.getByRole('button',{name:'TIE at 10.00 for 2731',exact:true}));
    await press(page.getByRole('button',{name:'Run-off held',exact:true}));
    await dragTo(page,order.getByRole('button',{name:'Move 2733',exact:true}),rows.filter({hasText:'2731'}));
    await expect(rows).toHaveText([/^1st2733/,/^2nd2731/,/^3rd2735/]);
    await press(saveTie(page));
    await expectToast(page,`Tie saved · ${name} Girl Cubs`);
    const ranked=board.getByRole('button',{name:/^Runner /});
    await expect(ranked.nth(0)).toContainText('2733');await expect(ranked.nth(1)).toContainText('2731');await expect(ranked.nth(2)).toContainText('2735');
    await expect(board.getByRole('button',{name:/^TIE at/})).toHaveCount(0);
    // A settled tie leaves nothing to check on the leaderboard.
    await expect(board.getByText('Check',{exact:true})).toHaveCount(0);
    await page.screenshot({path:info.outputPath('tie-settled-leaderboard.png'),fullPage:true});
    const exported=await page.request.post('/api/day/export',{headers,data:{}});expect(exported.ok()).toBe(true);
    const path=info.outputPath('tie-day-export.xlsx');await writeFile(path,await exported.body());
    const all=(await readExcelFile(path)).find(sheet=>sheet.sheet==='All results')!.data.filter(row=>row[0]===code);
    expect([2733,2731,2735].map(wristband=>all.find(row=>row[4]===wristband)?.[9])).toEqual([1,2,3]);
  } finally {for(const id of races) await page.request.post(`/api/lead/races/${id}/delete`,{headers,data:{permanent:true}});}
});
