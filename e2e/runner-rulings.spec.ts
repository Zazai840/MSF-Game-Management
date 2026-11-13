import {eventTab,expectToast,ownName,press,recordRace,openLeadsBarTab,becomeLead,expect,join,lookProblems,test,resultsCard} from './fixtures.js';
test('lead checks an eligibility warning at once from the runner sheet, corrects a number with Fix or Keep and chooses the counted repeated result, each screen landing back on the event',async({page},info)=>{
  const number=2601+['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const race=(numbers:number[],places:number[])=>recordRace(page.request,process.env.E2E_OWNER_TOKEN!,'R10',numbers,places,numbers);
  const first=await race([number,3045],[1100,1200]),second=await race([number],[1300]);
  await page.goto('/');await join(page,ownName('Runner lead'),{job:'Start line'});await becomeLead(page);await openLeadsBarTab(page,'Results');await press(resultsCard(page,'R10'));
  const heats=new RegExp('/results/R10/heats$');await expect(page).toHaveURL(heats);
  // The runner sheet: the meta line, the warning as a Notes card, then Mark checked as the main button.
  let checks=0;page.on('request',request=>{if(request.url().includes('/mark-warning-checked')) checks++;});
  const warning=page.getByRole('button',{name:`Runner 3045 · Heat ${first.number}`,exact:true}),sheet=page.getByRole('dialog',{name:'Runner 3045',exact:true});
  await press(warning);
  await expect(sheet.getByText(`60m Hurdles · Girl Cubs · Heat ${first.number} · 2nd in race · 12.00`,{exact:true})).toBeVisible();
  await expect(sheet.getByRole('list',{name:'Notes',exact:true}).getByRole('listitem')).toHaveText(['3045 belongs to Boy Scouts - this race is Girl CubsNot checked yet']);
  await expect(sheet.getByRole('button')).toHaveText(['','Mark checked','Correct number',`Open Heat ${first.number}`,'Disqualify 3045']);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('runner-sheet.png'),fullPage:true});
  // Mark checked saves at once, with no note: one request, the toast, and the row no longer says Check.
  await press(sheet.getByRole('button',{name:'Mark checked',exact:true}));
  await expectToast(page,'Warning checked · 3045');await expect(sheet).toHaveCount(0);
  await expect(warning).not.toContainText('Check');expect(checks).toBe(1);
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('checked the warning for 3045');
  // Correct number is a screen under the race: the docked Save waits for a number; a warning waits for Fix number or Keep.
  await eventTab(page,'Heats');await press(warning);await expect(sheet.getByRole('button',{name:'Mark checked',exact:true})).toHaveCount(0);
  await press(sheet.getByRole('button',{name:'Correct number',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/R10/races/${first.id}/runners/[^/]+/correct-number$`));
  await expect(page.getByRole('heading',{level:1,name:'Correct number',exact:true})).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to 60m Hurdles · Girl Cubs',exact:true})).toBeVisible();
  const input=page.getByLabel('New wristband number',{exact:true}),save=page.getByRole('button',{name:'Save number',exact:true});
  await expect(input).not.toBeFocused();await expect(page.getByText('Type the new number first.',{exact:true})).toBeVisible();await expect(save).toHaveAttribute('aria-disabled','true');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('correct-number.png'),fullPage:true});
  await input.fill('4045');await press(save);
  const held=page.getByRole('alert').filter({hasText:'4045 belongs to Girl Scouts - this race is Girl Cubs'});await expect(held).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await press(held.getByRole('button',{name:'Fix number',exact:true}));await expect(input).toHaveValue('');
  await input.fill('4045');await press(save);
  let failed=true;await page.route('**/api/lead/races/*/runners/*/correct-number',async route=>{if(failed){failed=false;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Heat 1 was changed by Sam Ali'})});}else await route.continue();});
  await press(held.getByRole('button',{name:'Keep',exact:true}));await expect(page.getByRole('alert').filter({hasText:'Not saved'})).toHaveText('Not saved - try again. Heat 1 was changed by Sam Ali');
  await expect(input).toHaveValue('4045');await press(save);await press(held.getByRole('button',{name:'Keep',exact:true}));
  await expectToast(page,`Number saved · 4045`);await expect(page).toHaveURL(heats);
  const corrected=page.getByRole('button',{name:`Runner 4045 · Heat ${first.number}`,exact:true});await expect(corrected).toContainText('12.00');await expect(corrected).toContainText('Check');
  // Choose which result counts: one choice per result, the tapped one picked to start with.
  const repeated=page.getByRole('button',{name:`Runner ${number} · Heat ${second.number}`,exact:true});await press(repeated);
  const repeatedSheet=page.getByRole('dialog',{name:`Runner ${number}`,exact:true});
  await expect(repeatedSheet.getByRole('button',{name:'Mark checked',exact:true})).toHaveCount(0);await press(repeatedSheet.getByRole('button',{name:'Choose which result counts',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/R10/races/${second.id}/runners/[^/]+/choose-result$`));
  const choice=(heat:number)=>page.getByRole('button',{name:new RegExp(`^Heat ${heat} · `)});
  await expect(choice(second.number)).toHaveAttribute('aria-pressed','true');await expect(choice(first.number)).toHaveAttribute('aria-pressed','false');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('choose-result.png'),fullPage:true});
  await press(page.getByRole('button',{name:'Save counted result',exact:true}));
  await expectToast(page,`Result counts · ${number}`);await expect(page).toHaveURL(heats);
  await expect(page.getByRole('button',{name:`Runner ${number} · Heat ${first.number}`,exact:true})).toContainText('Not counted');await expect(repeated).not.toContainText('Check');await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText(`counted ${number} from Heat ${second.number}`);
  await page.screenshot({path:info.outputPath('runner-rulings.png'),fullPage:true});
});
