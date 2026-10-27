import {deleteCurrentRace,enterWristband,live,openRaceScreen,recordRace,back,openLeadMenu,becomeLead,expect,join,test,type Locator} from './fixtures.js';
/** The left border of one section of a stage check sheet, found by its heading: its style and colour, or none. */
/** The amber fill marking a stage sheet list that holds something to settle, or 'none'. */
const sheetSectionFill=(sheet:Locator,heading:string)=>sheet.locator('section').filter({has:sheet.page().getByRole('heading',{name:heading,exact:true})}).evaluate(section=>{const fill=getComputedStyle(section).backgroundColor;return fill==='rgba(0, 0, 0, 0)'?'none':fill;});
test('timed Event complete checks blockers, locks the race screen live, and reopens with a retained comment',async({page,openPhone},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},code=`T36${info.project.name.toUpperCase()}`,name=`Stage event ${info.project.name}`;
  await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'timed',type:'races'}});
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2601,2602],[1000,1100]);
  // A volunteer takes check-in over from the owner and starts checking in Race 2 on the race screen.
  const job=(await openPhone(`Stage starter ${info.project.name}`)).page;
  await openRaceScreen(job,name);await job.getByRole('button',{name:/^Check-in Wristbands/}).click();await job.getByRole('button',{name:'Take over check-in',exact:true}).click();await job.getByRole('button',{name:'Take over',exact:true}).click();await enterWristband(job,2603);
  await expect(job.getByText('Race 2 · 1 runner',{exact:true})).toBeVisible();
  await page.goto('/');await join(page,`Stage lead ${info.project.name}`,{job:'Start line'});
  await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();await page.getByRole('button',{name:'Event complete',exact:true}).click();
  const blocked=page.getByRole('dialog',{name:'Event complete',exact:true});await expect(blocked.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
  // Amber marks only a list that holds something to settle or look at.
  await expect.poll(()=>sheetSectionFill(blocked,'Must settle first')).toBe('rgb(255, 244, 220)');
  await page.screenshot({path:info.outputPath('must-settle-first.png'),fullPage:true});
  await blocked.getByRole('button',{name:'Race 2 is in progress (1 checked in) - submit it or delete it',exact:true}).click();await expect(page.getByRole('heading',{name:new RegExp(`^Race 2 · Stage event`)})).toBeVisible();await page.getByRole('button',{name:'Delete race',exact:true}).click();await page.getByRole('button',{name:'Move to Deleted races',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await back(page,`${name} Girl Cubs`);await page.getByRole('button',{name:'Event complete',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Event complete',exact:true});await expect(sheet.getByRole('heading',{name:'Must settle first',exact:true})).toBeVisible();await expect(sheet).toContainText('Nothing to settle');await expect.poll(()=>sheetSectionFill(sheet,'Must settle first')).toBe('none');await expect(sheet).toContainText('No open warnings');await expect.poll(()=>sheetSectionFill(sheet,'Worth a look')).toBe('none');await expect(sheet).toContainText('2601');await expect(sheet).toContainText('2602');
  await page.screenshot({path:info.outputPath('event-complete-sheet.png'),fullPage:true});await sheet.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('table',{name:'Input - Running'})).toContainText(`${code}`);await expect(page.getByRole('table',{name:'Input - Running'})).toContainText('2601');
  await page.screenshot({path:info.outputPath('completed-event.png'),fullPage:true});
  // The volunteer's race screen locks live: no entries, no Submit Race.
  await expect(job.getByText('Stage complete - ask a lead',{exact:true})).toBeVisible(live);
  await expect(job.getByLabel('Wristband number',{exact:true})).toHaveCount(0);await expect(job.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  await job.screenshot({path:info.outputPath('locked-race-screen.png'),fullPage:true});
  await page.getByRole('button',{name:'Reopen event',exact:true}).click();const reopen=page.getByRole('dialog',{name:'Reopen event',exact:true});await reopen.getByRole('button',{name:'Reopen',exact:true}).click();await expect(reopen.getByLabel('Comment',{exact:true})).toBeFocused();await reopen.getByLabel('Comment',{exact:true}).fill('Late time correction');
  let failed=false;await page.route('**/api/lead/events/*/reopen-stage',async route=>{if(!failed){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Could not save - try again'})});}else await route.continue();});
  await reopen.getByRole('button',{name:'Reopen',exact:true}).click();await expect(reopen.getByRole('alert')).toContainText('Could not save');await expect(reopen.getByLabel('Comment',{exact:true})).toHaveValue('Late time correction');await reopen.getByRole('button',{name:'Reopen',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(job.getByText('Stage complete - ask a lead',{exact:true})).toHaveCount(0,live);await expect(job.getByLabel('Wristband number',{exact:true})).toBeVisible();
  await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('Late time correction');
  await deleteCurrentRace(page.request,code);
});
