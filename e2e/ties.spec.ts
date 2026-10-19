import { writeFile } from 'node:fs/promises';
import readExcelFile from 'read-excel-file/node';
import { openDashboard,becomeLead,dragTo,expect,createProfile,test,back } from './fixtures.js';
test('a lead settles a tie, reconsiders a changed medal decision and records its order with a comment',async({page},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  const code=`T31${info.project.name.toUpperCase()}`;
  expect((await page.request.post('/api/day/events',{headers,data:{code,name:`Tie event ${info.project.name}`,section:'Girl Cubs',format:'timed'}})).ok()).toBe(true);
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const createRace=async(number:number,time:number)=>{
    const race=(await (await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners:[number]}})).json()).race;
    await page.request.post(`/api/races/${race.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:[number],didNotFinish:[],didNotRun:[],added:[]}});
    await page.request.post(`/api/races/${race.id}/times`,{headers,data:{baseVersion:0,places:[time]}});
  };
  await createRace(2701,1000);await createRace(2702,1000);
  await page.goto('/');await createProfile(page,`Tie lead ${info.project.name}`);
  await becomeLead(page);await openDashboard(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'TIE at 10.00 for 2701',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Tie at 10.00',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'No run-off needed',exact:true}).click();
  await page.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('No run-off needed');
  await createRace(2703,800);await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByRole('button',{name:'TIE at 10.00 for 2701',exact:true}).click();
  await page.getByRole('button',{name:'Decided without a run-off',exact:true}).click();
  await page.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(page.getByLabel('Comment',{exact:true})).toBeFocused();
  await page.getByLabel('Comment',{exact:true}).fill('Runner had already left');
  const order=page.getByRole('list',{name:'Tie order'});
  await expect(page.getByRole('button',{name:/^Move .* (up|down)$/})).toHaveCount(0);
  await dragTo(page,order.getByRole('button',{name:'Drag to move 2702',exact:true}),order.getByRole('listitem').filter({hasText:'2701'}));
  await expect(order.getByRole('listitem').first()).toContainText('2702');
  let fail=true;
  await page.route('**/api/lead/events/*/settle-tie',async route=>{
    if(fail) {fail=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Could not save - try again'})});}
    else await route.continue();
  });
  await page.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Could not save - try again');
  await expect(page.getByLabel('Comment',{exact:true})).toHaveValue('Runner had already left');
  await expect(page.getByRole('list',{name:'Tie order'}).getByRole('listitem').first()).toContainText('2702');
  await page.screenshot({path:info.outputPath('tie-sheet.png'),fullPage:true});
  await page.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const ranked=page.getByRole('list',{name:'Provisional leaderboard'}).getByRole('listitem').filter({has:page.locator('.result-open')});
  await expect(ranked.nth(1)).toContainText('2702');await expect(ranked.nth(1)).toContainText('10.00');
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText('without a run-off: 2702 then 2701 - Runner had already left');
  await page.screenshot({path:info.outputPath('settled-tie.png'),fullPage:true});
});
test('a tie between two heats runs end to end: leaderboard highlight, To check, the tie sheet with drag handles and the day export',async({page},info)=>{
  test.setTimeout(60000);
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  const code=`TE-${info.project.name.slice(0,3).toUpperCase()}`;
  expect((await page.request.post('/api/day/events',{headers,data:{code,name:`Tie heats ${info.project.name}`,section:'Girl Cubs',format:'heats'}})).ok()).toBe(true);
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const races:string[]=[];
  const heat=async(runners:number[],places:number[])=>{
    const race=(await (await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners}})).json()).race;races.push(race.id);
    await page.request.post(`/api/races/${race.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:runners,didNotFinish:[],didNotRun:[],added:[]}});
    expect((await page.request.post(`/api/races/${race.id}/times`,{headers,data:{baseVersion:0,places}})).ok()).toBe(true);
  };
  // 2731 and 2735 share a time in Heat 1; 2733 has the same time in Heat 2.
  await heat([2731,2735,2736],[1000,1000,1200]);await heat([2733,2734],[1000,1100]);
  try {
    await page.goto('/');await createProfile(page,`Tie heats lead ${info.project.name}`);await becomeLead(page);
    await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
    const board=page.getByRole('list',{name:'Provisional leaderboard'});
    for(const wristband of [2731,2735,2733]) {
      await expect(board.getByRole('button',{name:`TIE at 10.00 for ${wristband}`,exact:true})).toBeVisible();
      await expect(board.getByRole('button',{name:new RegExp(`^Runner ${wristband} · Heat`)})).toHaveClass(/highlighted/);
    }
    await page.screenshot({path:info.outputPath('tie-leaderboard.png'),fullPage:true});
    await back(page,'Dashboard');
    const item=page.getByRole('list',{name:'To check'}).getByRole('button',{name:new RegExp(code)}).filter({hasText:'Runners tied on time'});
    await expect(item).toHaveCount(1);await expect(item).toContainText('10.00');
    await item.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('tie-to-check.png'),fullPage:true});
    await item.click();
    const sheet=page.getByRole('dialog',{name:'Tie at 10.00',exact:true});await expect(sheet).toBeVisible();
    await sheet.getByRole('button',{name:'Run-off held',exact:true}).click();
    const order=sheet.getByRole('list',{name:'Tie order'}),rows=order.getByRole('listitem');
    await expect(rows).toHaveText([/2731/,/2735/,/2733/]);
    await page.screenshot({path:info.outputPath('tie-sheet-handles.png'),fullPage:false});
    // Runners from the same heat keep their finishing order: that drop springs back.
    await dragTo(page,order.getByRole('button',{name:'Drag to move 2735',exact:true}),rows.filter({hasText:'2731'}));
    await expect(rows).toHaveText([/2731/,/2735/,/2733/]);
    await dragTo(page,order.getByRole('button',{name:'Drag to move 2733',exact:true}),rows.filter({hasText:'2731'}));
    await expect(rows).toHaveText([/2733/,/2731/,/2735/]);
    await expect(rows.first()).toContainText('1st');
    await page.screenshot({path:info.outputPath('tie-sheet-dragged.png'),fullPage:false});
    await sheet.getByRole('button',{name:'Save tie',exact:true}).click();await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('status').filter({hasText:'Saved'})).toBeVisible();
    const ranked=board.getByRole('button',{name:/^Runner /});
    await expect(ranked.nth(0)).toContainText('2733');await expect(ranked.nth(1)).toContainText('2731');await expect(ranked.nth(2)).toContainText('2735');
    await expect(board.getByRole('button',{name:/^TIE at/})).toHaveCount(0);
    // A settled tie is a calm note, not an amber warning.
    const settled=board.getByText('Tie settled',{exact:true}).first();await expect(settled).toBeVisible();
    expect(await settled.evaluate(element=>getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 244, 220)');
    await page.screenshot({path:info.outputPath('tie-settled-leaderboard.png'),fullPage:true});
    const exported=await page.request.post('/api/day/export',{headers,data:{}});expect(exported.ok()).toBe(true);
    const path=info.outputPath('tie-day-export.xlsx');await writeFile(path,await exported.body());
    const all=(await readExcelFile(path)).find(sheet=>sheet.sheet==='All results')!.data.filter(row=>row[0]===code);
    expect([2733,2731,2735].map(wristband=>all.find(row=>row[4]===wristband)?.[7])).toEqual([1,2,3]);
  } finally {for(const id of races) await page.request.post(`/api/lead/races/${id}/delete`,{headers,data:{permanent:true}});}
});
