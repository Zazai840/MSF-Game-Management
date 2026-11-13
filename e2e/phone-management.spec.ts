import {ownName,join,leadsBar,openLeadsBarTab,lookProblems,press,switchJob,expect,expectToast,test,pullToRefresh} from './fixtures.js';
test('Signed in today shows the job each phone last reported: the one chosen on Join, then the one switched to',async({page,browser},info)=>{
  const name=ownName('Reports job');
  const context=await browser.newContext({viewport:{width:390,height:844}});const other=await context.newPage();
  await other.goto('/');await join(other,name,{job:'Finish line'});
  await page.goto('/');await page.evaluate(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);await page.reload();
  await openLeadsBarTab(page,'Day setup');
  await page.getByRole('button',{name:/^Signed in today \d+ (person|people) signed in today$/}).click();
  const row=page.getByRole('listitem').filter({hasText:name});
  await expect(row.getByText('Volunteer · Finish line',{exact:true})).toBeVisible({timeout:10000});
  // The owner's own phone reports too: a lead starts as Zone lead.
  await expect(page.getByRole('listitem').filter({hasText:'E2E Owner'})).toContainText('Lead · Owner · ',{timeout:10000});
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('signed-in-today-jobs.png'),fullPage:true});
  await switchJob(other,'Timer');
  await expect(row.getByText('Volunteer · Timer',{exact:true})).toBeVisible({timeout:10000});
  await context.close();
});
test('Signed in today: Make lead reaches the other phone, and Remove asks first, then sends it back to Join with its profile kept',async({page,browser},info)=>{
  const name=ownName('Signed lead');
  const context=await browser.newContext({viewport:{width:390,height:844}});const other=await context.newPage();
  await other.goto('/');await join(other,name,{job:'Start line'});
  await expect(other.getByRole('navigation',{name:'Event type'})).toBeVisible();await expect(leadsBar(other)).toHaveCount(0);

  await page.goto('/');await page.evaluate(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);await page.reload();
  await openLeadsBarTab(page,'Day setup');
  await page.getByRole('button',{name:/^Signed in today \d+ (person|people) signed in today$/}).click();
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
  await expect(page.getByText('Role changes last for today only.',{exact:true})).toBeVisible();
  const self=page.getByRole('listitem').filter({hasText:'E2E Owner'});
  await expect(self).toContainText('(you)');await expect(self).toContainText('Lead · Owner');await expect(self.getByRole('button')).toHaveCount(0);
  const row=page.getByRole('listitem').filter({hasText:name});
  await expect(row.getByText('Volunteer · Start line',{exact:true})).toBeVisible({timeout:10000});
  // One row per person: its actions are in the sheet the row opens, so no red Remove is on the list.
  await expect(row.getByRole('button')).toHaveCount(1);await expect(page.getByRole('button',{name:'Remove',exact:true})).toHaveCount(0);
  await expect(page.getByText(/^Updated at \d\d:\d\d:\d\d/)).toBeVisible();
  await pullToRefresh(page);
  await expect(page.getByText(/Phones/)).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);

  const sheet=page.getByRole('dialog',{name,exact:true}),actions=sheet.getByRole('button',{name:/^(Make|Remove)/});
  await press(row.getByRole('button'));
  await expect(actions).toHaveText(['Make lead','Remove']);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('person-sheet.png')});
  // The phone's Back closes the sheet and stays on Signed in today.
  await page.goBack();await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await press(row.getByRole('button'));
  await press(sheet.getByRole('button',{name:'Make lead',exact:true}));
  await expectToast(page,`${name} is a lead now`);
  await expect(sheet).toHaveCount(0);await expect(row.getByText('Lead · Start line',{exact:true})).toBeVisible();
  await press(row.getByRole('button'));await expect(actions).toHaveText(['Make volunteer','Remove']);
  await press(sheet.getByLabel('Close',{exact:true}));await expect(sheet).toHaveCount(0);
  await press(page.getByText(/^Notes \(\d+\)$/));
  await expect(page.getByText(`Made ${name} a lead · E2E Owner`)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('signed-in-today.png'),fullPage:true});
  // The other phone's Home picks up today's new role on its next refresh.
  await expect(leadsBar(other)).toBeVisible({timeout:10000});
  // As a lead it sees the owner's row, which offers Remove but never Make volunteer.
  await openLeadsBarTab(other,'Day setup');
  await other.getByRole('button',{name:/^Signed in today \d+ (person|people) signed in today$/}).click();
  const ownerRow=other.getByRole('listitem').filter({hasText:'E2E Owner'});
  await expect(ownerRow).toContainText('Lead · Owner');await press(ownerRow.getByRole('button'));
  await expect(other.getByRole('dialog',{name:'E2E Owner',exact:true}).getByRole('button',{name:/^(Make|Remove)/})).toHaveText(['Remove']);
  await other.goto('/');await expect(leadsBar(other)).toBeVisible();

  // Remove asks first; Keep changes nothing.
  await press(row.getByRole('button'));await press(sheet.getByRole('button',{name:'Remove',exact:true}));
  const ask=page.getByRole('dialog',{name:`Remove ${name}?`,exact:true});
  await expect(ask).toContainText('Their phone goes back to Join and drops anything it has not saved. They can join again with the Olympics password.');
  await expect(ask.getByRole('button',{name:/^(Remove|Keep) /})).toHaveText([`Keep ${name}`,`Remove ${name}`]);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('remove-asks-first.png')});
  await press(ask.getByRole('button',{name:`Keep ${name}`,exact:true}));
  await expect(ask).toHaveCount(0);await expect(row).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'removed'})).toHaveCount(0);

  await press(row.getByRole('button'));await press(sheet.getByRole('button',{name:'Remove',exact:true}));
  await expect(sheet).toHaveCount(0);
  await press(ask.getByRole('button',{name:`Remove ${name}`,exact:true}));
  await expect(ask).toHaveCount(0);await expect(row).toHaveCount(0);await expectToast(page,`${name} removed`);
  await expect(page.getByText(`Removed ${name} · E2E Owner`)).toBeVisible();
  await expect(other.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible({timeout:10000});
  expect(await other.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
  // Joining again, the profile is still on the phone and signs back in as a volunteer.
  await join(other,name,{job:'Start line'});
  await expect(other.getByRole('button',{name:'Your role is Start line. Change job',exact:true})).toBeVisible();await expect(leadsBar(other)).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await context.close();
});

test('a refused role change or Remove says Not saved in the sheet, which stays open',async({page,openPhone},info)=>{
  const name=ownName('Refused person');
  await openPhone(name);
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/day/signed-in-today');
  const row=page.getByRole('listitem').filter({hasText:name}).getByRole('button');
  const sheet=page.getByRole('dialog',{name,exact:true}),makeLead=sheet.getByRole('button',{name:'Make lead',exact:true});
  await page.route('**/api/day/phones/*/role',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'The list changed'})}));
  await press(row);await press(makeLead);
  await expect(sheet.getByRole('alert')).toHaveText('Not saved - try again. The list changed');
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('role-not-saved.png')});
  // A sheet opened again starts without the refusal.
  await press(sheet.getByLabel('Close',{exact:true}));await press(row);
  await expect(makeLead).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  // A refused Remove says so in the sheet that asked.
  await page.route('**/api/day/phones/*/remove',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'The list changed'})}));
  await press(sheet.getByRole('button',{name:'Remove',exact:true}));
  const ask=page.getByRole('dialog',{name:`Remove ${name}?`,exact:true});
  await press(ask.getByRole('button',{name:`Remove ${name}`,exact:true}));
  await expect(ask.getByRole('alert')).toHaveText('Not saved - try again. The list changed');
  await expect(page.getByRole('alert')).toHaveCount(1);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('remove-not-saved.png')});
  await press(ask.getByRole('button',{name:`Keep ${name}`,exact:true}));
  await press(row);await expect(makeLead).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  // The next save that gets through closes the sheet.
  await page.unroute('**/api/day/phones/*/role');
  await press(makeLead);
  await expectToast(page,`${name} is a lead now`);
  await expect(sheet).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
});
