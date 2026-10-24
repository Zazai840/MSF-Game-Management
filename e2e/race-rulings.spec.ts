import { deleteCurrentRace,recordRace,goHome,back,openDashboard,openRaceScreen,becomeLead,expect,createProfile,dragTo,lookProblems,test } from './fixtures.js';
test('a lead repairs a race, keeps failed corrections, deletes and restores it, then calls a prefilled re-run',async({page},info)=>{
  // The test day is shared and projects run at once: each names its own event, so its race screen tile is its alone.
  const code=`RC-${info.project.name.toUpperCase()}`,name=`Race corrections ${info.project.name}`,headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,[2001,2002],[1300,1200]);
  await page.goto('/');await createProfile(page,`Race lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Race 1',exact:true}).click();await page.getByRole('button',{name:'Correct times',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:/^2nd place · /}).click();await sheet.getByLabel('2nd place time',{exact:true}).fill('1400');
  let failed=true;await page.route('**/api/lead/races/*/times',async route=>{if(failed){failed=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Not saved - try again'})});}else await route.continue();});
  await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet.getByRole('alert')).toHaveText('Not saved - try again');await expect(sheet.getByLabel('2nd place time',{exact:true})).toHaveValue('1400');await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
  await page.getByRole('button',{name:'Correct times',exact:true}).click();await sheet.getByRole('button',{name:/^1st place · /}).click();await sheet.getByLabel('1st place time',{exact:true}).fill('1500');await sheet.getByLabel('Accept these out-of-order times',{exact:true}).check();await sheet.getByLabel('1st place time',{exact:true}).fill('1600');await expect(sheet.getByLabel('Accept these out-of-order times',{exact:true})).not.toBeChecked();await sheet.getByLabel('Accept these out-of-order times',{exact:true}).check();await page.screenshot({path:info.outputPath('lead-time-acceptance.png'),fullPage:true});await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
  await page.getByRole('button',{name:'Correct runner list',exact:true}).click();await sheet.getByRole('button',{name:'Runner 2 · 2002',exact:true}).click();await sheet.getByLabel('Wristband for runner 2',{exact:true}).fill('4045');await sheet.getByRole('button',{name:'Review runner list',exact:true}).click();await expect(sheet.getByText('4045 belongs to Girl Scouts - this race is Girl Cubs',{exact:true})).toBeVisible();await sheet.getByRole('button',{name:'Fix runners',exact:true}).click();await sheet.getByRole('button',{name:'Review runner list',exact:true}).click();await sheet.getByRole('button',{name:'Keep warnings',exact:true}).click();await page.screenshot({path:info.outputPath('lead-runner-review.png'),fullPage:true});await sheet.getByRole('button',{name:'Save runner list',exact:true}).click();await expect(sheet).toHaveCount(0);await expect(page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem').filter({hasText:'4045'}).filter({hasText:/^2nd\s*4045[\s\S]*14\.00$/})).toBeVisible();
  await page.screenshot({path:info.outputPath('race-corrected.png'),fullPage:true});
  await page.getByRole('button',{name:'Delete race',exact:true}).click();await sheet.getByRole('button',{name:'Move to Deleted races',exact:true}).click();await expect(page.getByRole('button',{name:'Restore race',exact:true})).toBeVisible();await back(page,`${name} Girl Cubs`);await page.getByRole('button',{name:'Open deleted Race 1',exact:true}).click();await page.getByRole('button',{name:'Restore race',exact:true}).click();await sheet.getByRole('button',{name:'Confirm restore',exact:true}).click();await expect(page.getByRole('button',{name:'Re-run race',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Re-run race',exact:true}).click();await sheet.getByLabel('Comment (optional)',{exact:true}).fill('Recording lost');await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();await expect(page.getByText('Race 1 · Replaced by Race 2 (re-run)',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Restore race',exact:true})).toHaveCount(0);await page.screenshot({path:info.outputPath('race-rerun.png'),fullPage:true});
  await page.getByRole('button',{name:'Delete permanently',exact:true}).click();await sheet.getByRole('button',{name:'Confirm permanent deletion',exact:true}).click();await expect(page.getByRole('button',{name:/^Open deleted Race 1/})).toHaveCount(0);await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText('permanently deleted');await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('called a re-run');await goHome(page);
  // The re-run is the event's current race, its check-in pre-filled.
  await openRaceScreen(page,name);await expect(page.getByText('Race 2 · 2 runners',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Check-in Wristbands/}).click();await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText(['2001','4045']);
  await deleteCurrentRace(page.request,code);
});
test('a lead can correct times again straight after saving, even when the race is slow to re-read',async({page},info)=>{
  const code=`RQ-${info.project.name.toUpperCase()}`,headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/events',{headers,data:{code,name:'Quick corrections',section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const race=await recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,[2001,2002],[1200,1300]);
  await page.goto('/');await createProfile(page,`Quick lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Race 1',exact:true}).click();await page.getByRole('button',{name:'Correct times',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:/^2nd place · /}).click();await sheet.getByLabel('2nd place time',{exact:true}).fill('1400');
  // A slow re-read of the race must not let the lead reopen the sheet on the version just replaced.
  await page.route(`**/api/lead/races/${race.id}`,async route=>{await new Promise(resolve=>setTimeout(resolve,1500));await route.continue();});
  await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
  await page.getByRole('button',{name:'Correct times',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'2nd place · 14.00',exact:true})).toBeVisible();
  await sheet.getByRole('button',{name:/^2nd place · /}).click();await sheet.getByLabel('2nd place time',{exact:true}).fill('1500');await sheet.getByRole('button',{name:'Save times',exact:true}).click();await expect(sheet).toHaveCount(0);
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
test('a lead corrects a saved race\'s finishing order: drags a wristband, marks Did not finish, and Results updates',async({page},info)=>{
  const code=`RO-${info.project.name.toUpperCase()}`,headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/events',{headers,data:{code,name:'Order corrections',section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const race=await recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,[2001,2002,2003],[1200,1300,1400]);
  await page.goto('/');await createProfile(page,`Order lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Race 1',exact:true}).click();await page.getByRole('button',{name:'Correct finishing order',exact:true}).click();
  const sheet=page.getByRole('dialog'),rows=sheet.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
  await expect(rows).toHaveText(['1st12.002001No place','2nd13.002002No place','3rd14.002003No place']);
  // Times stay by place: 2003 dragged to 1st takes 1st place's time, and the change saves at once.
  await dragTo(page,sheet.getByRole('button',{name:'Drag to move 2003',exact:true}),rows.first());
  await expect(rows).toHaveText(['1st12.002003No place','2nd13.002001No place','3rd14.002002No place']);
  await expect(page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem').filter({hasText:'2003'})).toHaveText(/^1st\s*2003[\s\S]*12\.00$/);
  await sheet.getByRole('button',{name:'No place for 2002',exact:true}).click();
  await expect(sheet.getByText('2002 has no place. What happened?',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('order-no-place.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Did not finish',exact:true}).click();
  await expect(rows).toHaveText(['1st12.002003No place','2nd13.002001No place']);
  await expect(sheet.getByRole('list',{name:'No place',exact:true})).toHaveText(['2002Did not finishGive a place']);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('order-corrected.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Done',exact:true}).click();await expect(sheet).toHaveCount(0);
  await back(page,'Order corrections Girl Cubs');
  await expect(page.locator('.not-ranked')).toContainText("Race 1 · finishers and times don't agree");
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText('corrected the finishing order for Race 1: 2003, 2001; Did not finish 2002');
  await page.request.post(`/api/lead/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
