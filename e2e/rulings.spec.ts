import {ownName,recordRace,back,openLeadMenu,becomeLead,expect,join,test} from './fixtures.js';
test('a lead disqualifies and lifts a runner, sees the ranking and audit notes change, and keeps a failed save',async({page},info)=>{
  // iOS 15.0–15.3 is supported but has no native dialog API.
  await page.addInitScript(()=>Object.defineProperty(HTMLDialogElement.prototype,'showModal',{value:undefined}));
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const numbers=[2501,2502,2503,2504].map(number=>number+offset);
  const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,'R16',numbers,[1100,1200,1300,1400]);
  await page.goto('/');await join(page,ownName('Aisha'),{job:'Start line'});
  await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:/^R16 · Girl Cubs/}).click();
  const runner=page.getByRole('button',{name:`Runner ${numbers[0]} · Heat ${race.number}`,exact:true});
  await runner.click();await expect(page.getByRole('button',{name:'Disqualify',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'Close actions',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(runner).toBeFocused();
  await runner.click();await page.getByRole('button',{name:'Disqualify',exact:true}).click();await page.getByLabel('Reason',{exact:true}).selectOption('Other');
  await page.getByLabel('Comment (optional)',{exact:true}).fill('Stepped into the next lane');
  let failed=true;await page.route('**/api/lead/races/*/runners/*/disqualify',async route=>{if(failed){failed=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Could not save - try again'})});}else await route.continue();});
  await page.getByRole('button',{name:'Save disqualification',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Could not save - try again');await expect(page.getByLabel('Comment (optional)',{exact:true})).toHaveValue('Stepped into the next lane');await page.screenshot({path:info.outputPath('runner-action-sheet.png'),fullPage:true});
  await page.getByRole('button',{name:'Save disqualification',exact:true}).click();await expect(runner).toContainText('Disqualified: Other');await expect(runner).toContainText('note');
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText(`${ownName('Aisha')} disqualified ${numbers[0]} (Heat ${race.number}): Other - Stepped into the next lane`);
  await page.screenshot({path:info.outputPath('disqualification.png'),fullPage:true});
  await runner.click();await expect(page.getByRole('button',{name:'Disqualify',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Lift disqualification',exact:true}).click();await page.getByLabel('Comment',{exact:true}).fill('Photo showed the lane was clear');await page.getByRole('button',{name:'Save lift',exact:true}).click();
  await expect(runner).not.toContainText('Disqualified');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText('lifted the disqualification');
  await back(page,'Results');await expect(page.getByRole('button',{name:/^R16 · Girl Cubs/})).toContainText('Latest note');
});
