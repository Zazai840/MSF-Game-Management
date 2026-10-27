import {backToRaces,deleteCurrentRace,live,openRace,recordRace,back,openLeadMenu,becomeLead,expect,join,test,type Locator} from './fixtures.js';
/** The left border of one section of a stage check sheet, found by its heading: its style and colour, or none. */
/** The amber fill marking a stage sheet list that holds something to settle, or 'none'. */
const sheetSectionFill=(sheet:Locator,heading:string)=>sheet.locator('section').filter({has:sheet.page().getByRole('heading',{name:heading,exact:true})}).evaluate(section=>{const fill=getComputedStyle(section).backgroundColor;return fill==='rgba(0, 0, 0, 0)'?'none':fill;});
test('timed Event complete checks blockers, locks the event\'s races live, and reopens with a retained comment',async({page,openPhone},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},code=`T36${info.project.name.toUpperCase()}`,name=`Stage event ${info.project.name}`;
  await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'timed',type:'races'}});
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2601,2602],[1000,1100]);
  // A volunteer starts Heat 2 from the card and checks a runner in.
  const job=(await openPhone(`Stage starter ${info.project.name}`)).page;
  const card=job.getByRole('article',{name:`${name} · Girl Cubs`});
  // Every heat saved, the event sits under Done.
  await job.locator('details',{hasText:/^Done \(\d+\)/}).locator('summary').click();
  await card.getByRole('button',{name:'Add heat 2',exact:true}).click();
  await job.getByRole('dialog',{name:'New race'}).getByRole('button',{name:'Create heat 2',exact:true}).click();
  const input=job.getByLabel('Wristband number',{exact:true});await input.fill('2603');await input.press('Enter');
  await expect(job.locator('.rz-prompt__meta')).toHaveText('Heat 2 · 1 runner so far');
  await page.goto('/');await join(page,`Stage lead ${info.project.name}`,{job:'Start line'});
  await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();await page.getByRole('button',{name:'Event complete',exact:true}).click();
  const blocked=page.getByRole('dialog',{name:'Event complete',exact:true});await expect(blocked.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
  // Amber marks only a list that holds something to settle or look at.
  await expect.poll(()=>sheetSectionFill(blocked,'Must settle first')).toBe('rgb(255, 244, 220)');
  await page.screenshot({path:info.outputPath('must-settle-first.png'),fullPage:true});
  await blocked.getByRole('button',{name:'Heat 2 is in progress (1 checked in) - submit it or delete it',exact:true}).click();await expect(page.getByRole('heading',{name:new RegExp(`^Heat 2 · Stage event`)})).toBeVisible();await page.getByRole('button',{name:'Delete race',exact:true}).click();await page.getByRole('button',{name:'Move to Deleted races',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await back(page,`${name} Girl Cubs`);await page.getByRole('button',{name:'Event complete',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Event complete',exact:true});await expect(sheet.getByRole('heading',{name:'Must settle first',exact:true})).toBeVisible();await expect(sheet).toContainText('Nothing to settle');await expect.poll(()=>sheetSectionFill(sheet,'Must settle first')).toBe('none');await expect(sheet).toContainText('No open warnings');await expect.poll(()=>sheetSectionFill(sheet,'Worth a look')).toBe('none');await expect(sheet).toContainText('2601');await expect(sheet).toContainText('2602');
  // The volunteer's Heat 2 is gone; they open the saved Heat 1.
  await expect(job.getByText('A lead deleted Heat 2',{exact:true})).toBeVisible(live);
  await backToRaces(job);await openRace(job,name);
  await expect(job.getByRole('status').filter({hasText:'Heat 1 is saved. Ask a lead to change it.'})).toBeVisible();
  await page.screenshot({path:info.outputPath('event-complete-sheet.png'),fullPage:true});await sheet.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('table',{name:'Input - Running'})).toContainText(`${code}`);await expect(page.getByRole('table',{name:'Input - Running'})).toContainText('2601');
  await page.screenshot({path:info.outputPath('completed-event.png'),fullPage:true});
  // The volunteer's race locks live, and the event offers no new heat.
  await expect(job.getByRole('status').filter({hasText:'Stage complete - ask a lead'})).toBeVisible(live);
  await expect(job.getByLabel('Wristband number',{exact:true})).toHaveCount(0);await expect(job.getByRole('button',{name:/^Add heat/})).toHaveCount(0);
  await job.screenshot({path:info.outputPath('locked-race.png'),fullPage:true});
  await page.getByRole('button',{name:'Reopen event',exact:true}).click();const reopen=page.getByRole('dialog',{name:'Reopen event',exact:true});await reopen.getByRole('button',{name:'Reopen',exact:true}).click();await expect(reopen.getByLabel('Comment',{exact:true})).toBeFocused();await reopen.getByLabel('Comment',{exact:true}).fill('Late time correction');
  let failed=false;await page.route('**/api/lead/events/*/reopen-stage',async route=>{if(!failed){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Could not save - try again'})});}else await route.continue();});
  await reopen.getByRole('button',{name:'Reopen',exact:true}).click();await expect(reopen.getByRole('alert')).toContainText('Could not save');await expect(reopen.getByLabel('Comment',{exact:true})).toHaveValue('Late time correction');await reopen.getByRole('button',{name:'Reopen',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  // Reopened, the race is saved again rather than locked, and the event offers its next heat.
  await expect(job.getByRole('status').filter({hasText:'Stage complete - ask a lead'})).toHaveCount(0,live);
  await expect(job.getByRole('button',{name:'Add heat 3',exact:true})).toBeVisible();
  await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('Late time correction');
  await deleteCurrentRace(page.request,code);
});
