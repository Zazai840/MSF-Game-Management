import {ownName,join,leadMenuButton,openLeadMenu,lookProblems,press,switchJob,expect,expectToast,test} from './fixtures.js';
test('Signed in today shows the job each phone last reported: the one chosen on Join, then the one switched to',async({page,browser},info)=>{
  const name=ownName('Reports job');
  const context=await browser.newContext({viewport:{width:390,height:844}});const other=await context.newPage();
  await other.goto('/');await join(other,name,{job:'Finish line'});
  await page.goto('/');await page.evaluate(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);await page.reload();
  await openLeadMenu(page,'Day setup');
  await page.getByRole('button',{name:/^Signed in today \d+ (person|people) signed in today$/}).click();
  const row=page.getByRole('article',{name,exact:true});
  await expect(row.getByText('Volunteer · Finish line',{exact:true})).toBeVisible({timeout:10000});
  // The owner's own phone reports too: a lead starts as Zone lead.
  await expect(page.getByRole('article',{name:'E2E Owner',exact:true})).toContainText('Lead · Owner · ',{timeout:10000});
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('signed-in-today-jobs.png'),fullPage:true});
  await switchJob(other,'Timer');
  await expect(row.getByText('Volunteer · Timer',{exact:true})).toBeVisible({timeout:10000});
  await context.close();
});
test('Signed in today: Make lead reaches the other phone, and Remove asks first, then sends it back to Join with its profile kept',async({page,browser},info)=>{
  const name=ownName('Signed lead');
  const context=await browser.newContext({viewport:{width:390,height:844}});const other=await context.newPage();
  await other.goto('/');await join(other,name,{job:'Start line'});
  await expect(other.getByRole('navigation',{name:'Event type'})).toBeVisible();await expect(leadMenuButton(other)).toHaveCount(0);

  await page.goto('/');await page.evaluate(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);await page.reload();
  await openLeadMenu(page,'Day setup');
  await page.getByRole('button',{name:/^Signed in today \d+ (person|people) signed in today$/}).click();
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
  await expect(page.getByText('Role changes last for today only.',{exact:true})).toBeVisible();
  const self=page.getByRole('article',{name:'E2E Owner',exact:true});
  await expect(self).toContainText('(you)');await expect(self).toContainText('Lead · Owner');await expect(self.getByRole('button')).toHaveCount(0);
  const row=page.getByRole('article',{name,exact:true});
  await expect(row.getByText('Volunteer · Start line',{exact:true})).toBeVisible({timeout:10000});
  await expect(row.getByRole('button')).toHaveText(['Make lead','Remove']);
  await expect(page.getByText(/^Updated at \d\d:\d\d:\d\d/)).toBeVisible();
  await press(page.getByRole('button',{name:'Refresh',exact:true}));
  await expect(page.getByText(/Phones/)).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);

  await press(row.getByRole('button',{name:'Make lead',exact:true}));
  await expectToast(page,`${name} is a lead now · today only`);
  await expect(row.getByText('Lead · Start line',{exact:true})).toBeVisible();
  await expect(row.getByRole('button')).toHaveText(['Make volunteer','Remove']);
  await press(page.getByText(/^Notes \(\d+\)$/));
  await expect(page.getByText(`Made ${name} a lead · E2E Owner`)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('signed-in-today.png'),fullPage:true});
  // The other phone's Home picks up today's new role on its next refresh.
  await expect(leadMenuButton(other)).toBeVisible({timeout:10000});
  // As a lead it sees the owner's row, which offers Remove but never Make volunteer.
  await openLeadMenu(other,'Day setup');
  await other.getByRole('button',{name:/^Signed in today \d+ (person|people) signed in today$/}).click();
  const ownerRow=other.getByRole('article',{name:'E2E Owner',exact:true});
  await expect(ownerRow).toContainText('Lead · Owner');await expect(ownerRow.getByRole('button')).toHaveText(['Remove']);
  await other.goto('/');await expect(leadMenuButton(other)).toBeVisible();

  // Remove asks first; Keep changes nothing.
  await press(row.getByRole('button',{name:'Remove',exact:true}));
  const ask=page.getByRole('dialog',{name:`Remove ${name}?`,exact:true});
  await expect(ask).toContainText('Their phone goes back to Join and drops anything it has not saved. They can join again with the Olympics password.');
  await expect(ask.getByRole('button',{name:/^(Remove|Keep) /})).toHaveText([`Keep ${name}`,`Remove ${name}`]);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('remove-asks-first.png')});
  await press(ask.getByRole('button',{name:`Keep ${name}`,exact:true}));
  await expect(ask).toHaveCount(0);await expect(row).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'removed'})).toHaveCount(0);

  await press(row.getByRole('button',{name:'Remove',exact:true}));
  await press(ask.getByRole('button',{name:`Remove ${name}`,exact:true}));
  await expect(ask).toHaveCount(0);await expect(row).toHaveCount(0);await expectToast(page,`${name} removed · signed out`);
  await expect(page.getByText(`Removed ${name} · E2E Owner`)).toBeVisible();
  await expect(other.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible({timeout:10000});
  expect(await other.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
  // Joining again, the profile is still on the phone and signs back in as a volunteer.
  await join(other,name,{job:'Start line'});
  await expect(other.getByRole('button',{name:'Your job: Start line. Change job',exact:true})).toBeVisible();await expect(leadMenuButton(other)).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await context.close();
});
