import {eventTab,expectToast,ownName,press,recordRace,back,openLeadsBarTab,becomeLead,expect,join,lookProblems,test,resultsCard} from './fixtures.js';
test('a lead disqualifies and lifts a runner on their screens, sees the ranking and audit notes change, and keeps a failed save',async({page},info)=>{
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const numbers=[2501,2502,2503,2504].map(number=>number+offset);
  const race=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,'R16',numbers,[3100,3200,3300,3400]);
  await page.goto('/');await join(page,ownName('Aisha'),{job:'Start line'});
  await becomeLead(page);await openLeadsBarTab(page,'Results');
  await press(resultsCard(page,'R16'));
  const heats=new RegExp('/results/R16/heats$');await expect(page).toHaveURL(heats);
  const runner=page.getByRole('button',{name:`Runner ${numbers[0]} · Heat ${race.number}`,exact:true}),sheet=page.getByRole('dialog',{name:`Runner ${numbers[0]}`,exact:true});
  // From the keyboard the sheet takes focus, not a button in it; Shift+Tab wraps to its last button, Tab back to Close.
  // Escape closes it, focus goes back to the row, and nothing else changes.
  await runner.focus();await page.keyboard.press('Enter');await expect(sheet).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(sheet.getByRole('button',{name:`Disqualify ${numbers[0]}`,exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(sheet.getByRole('button',{name:'Close',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);await expect(runner).toBeFocused();await expect(page).toHaveURL(heats);
  // Disqualify is red and last; its screen waits for a reason, and the comment is optional.
  await press(runner);await expect(sheet.getByRole('button').last()).toHaveText(`Disqualify ${numbers[0]}`);
  await press(sheet.getByRole('button',{name:`Disqualify ${numbers[0]}`,exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/R16/races/${race.id}/runners/[^/]+/disqualify$`));
  await expect(page.getByRole('heading',{level:2,name:`Why is ${numbers[0]} disqualified?`,exact:true})).toBeVisible();
  const disqualify=page.getByRole('button',{name:`Disqualify ${numbers[0]}`,exact:true});
  await expect(page.getByText('Choose a reason.',{exact:true})).toBeVisible();await expect(disqualify).toHaveAttribute('aria-disabled','true');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('disqualify.png'),fullPage:true});
  await press(page.getByRole('button',{name:'Other',exact:true}));await expect(page.getByText('Choose a reason.',{exact:true})).toHaveCount(0);
  await page.getByLabel('Comment (optional)',{exact:true}).fill('Stepped into the next lane');
  let failed=true;await page.route('**/api/lead/races/*/runners/*/disqualify',async route=>{if(failed){failed=false;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Heat 1 was changed by Sam Ali'})});}else await route.continue();});
  await press(disqualify);await expect(page.getByRole('alert')).toHaveText('Not saved - try again. Heat 1 was changed by Sam Ali');await expect(page.getByLabel('Comment (optional)',{exact:true})).toHaveValue('Stepped into the next lane');
  expect(await lookProblems(page)).toEqual([]);
  await press(disqualify);await expectToast(page,`${numbers[0]} disqualified · Other`);await expect(page).toHaveURL(heats);await expect(runner).toContainText('Disqualified: Other');
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText(`${ownName('Aisha')} disqualified ${numbers[0]} (Heat ${race.number}): Other - Stepped into the next lane`);
  await page.screenshot({path:info.outputPath('disqualification.png'),fullPage:true});
  // Lift disqualification needs a comment.
  await eventTab(page,'Heats');await press(runner);await expect(sheet).toContainText('Disqualified: Other - Stepped into the next lane');
  await expect(sheet.getByRole('button',{name:`Disqualify ${numbers[0]}`,exact:true})).toHaveCount(0);await press(sheet.getByRole('button',{name:'Lift disqualification',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/runners/[^/]+/lift-disqualification$`));
  const lift=page.getByRole('button',{name:'Lift disqualification',exact:true});
  await expect(page.getByText('Write a comment first.',{exact:true})).toBeVisible();await expect(lift).toHaveAttribute('aria-disabled','true');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('lift.png'),fullPage:true});
  await page.getByLabel('Comment',{exact:true}).fill('Photo showed the lane was clear');await press(lift);
  await expectToast(page,`${numbers[0]} counts again`);await expect(page).toHaveURL(heats);
  await expect(runner).not.toContainText('Disqualified');await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('lifted the disqualification');
  await back(page,'Results');await expect(resultsCard(page,'R16')).toContainText('Latest note');
});
