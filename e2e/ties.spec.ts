import { openDashboard,becomeLead,expect,joinDay,test } from './fixtures.js';
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
  await page.goto('/');await joinDay(page,`Tie lead ${info.project.name}`);
  await becomeLead(page);await openDashboard(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'TIE at 10.00 for 2701',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Tie at 10.00',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'No run-off needed',exact:true}).click();
  await page.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('No run-off needed');
  await createRace(2703,800);await page.getByRole('button',{name:'Refresh Results',exact:true}).click();
  await page.getByRole('button',{name:'TIE at 10.00 for 2701',exact:true}).click();
  await page.getByRole('button',{name:'Decided without a run-off',exact:true}).click();
  await page.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(page.getByLabel('Comment',{exact:true})).toBeFocused();
  await page.getByLabel('Comment',{exact:true}).fill('Runner had already left');
  await page.getByRole('button',{name:'Move 2702 up',exact:true}).click();
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
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText('without a run-off: 2702 then 2701 — Runner had already left');
  await page.screenshot({path:info.outputPath('settled-tie.png'),fullPage:true});
});
