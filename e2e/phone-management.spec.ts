import { createProfile,dashboardButton,openDashboard,lookProblems,expect,test } from './fixtures.js';
test('Signed in today: Make lead reaches the other phone, and Remove sends it to the password screen with its profile kept',async({page,browser},info)=>{
  const name=`Signed lead ${info.project.name}`;
  const context=await browser.newContext({viewport:{width:390,height:844}});const other=await context.newPage();
  await other.goto('/');await createProfile(other,name);
  await expect(other.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();await expect(dashboardButton(other)).toHaveCount(0);

  await page.goto('/');await page.evaluate(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);await page.reload();
  await openDashboard(page,'Day setup');
  await page.getByRole('button',{name:/^Phones \d+ (person|people) signed in today$/}).click();
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  const self=page.getByRole('article',{name:'E2E Owner',exact:true});
  await expect(self).toContainText('(you)');await expect(self).toContainText('Lead · Owner');await expect(self.getByRole('button')).toHaveCount(0);
  const row=page.getByRole('article',{name,exact:true});
  await expect(row.getByText('Volunteer',{exact:true})).toBeVisible();
  await expect(row.getByRole('button')).toHaveText(['Make lead','Remove']);
  expect(await lookProblems(page)).toEqual([]);

  await row.getByRole('button',{name:'Make lead',exact:true}).click();
  await expect(page.locator('.dashboard-saved')).toHaveText('Saved');
  await expect(row.getByText('Lead',{exact:true})).toBeVisible();
  await expect(row.getByRole('button')).toHaveText(['Make volunteer','Remove']);
  await page.getByText('Phone and access audit notes',{exact:true}).click();
  await expect(page.getByText(`Made ${name} a lead · E2E Owner`)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('signed-in-today.png'),fullPage:true});
  // The other phone's Home picks up today's new role on its next refresh.
  await expect(dashboardButton(other)).toBeVisible({timeout:10000});
  // As a lead it sees the owner's row, which offers Remove but never Make volunteer.
  await openDashboard(other,'Day setup');
  await other.getByRole('button',{name:/^Phones \d+ (person|people) signed in today$/}).click();
  const ownerRow=other.getByRole('article',{name:'E2E Owner',exact:true});
  await expect(ownerRow).toContainText('Lead · Owner');await expect(ownerRow.getByRole('button')).toHaveText(['Remove']);
  await other.goto('/');await expect(dashboardButton(other)).toBeVisible();

  await row.getByRole('button',{name:'Remove',exact:true}).click();
  await expect(row).toHaveCount(0);await expect(page.locator('.dashboard-saved')).toHaveText('Saved');
  await expect(page.getByText(`Removed ${name} · E2E Owner`)).toBeVisible();
  await expect(other.getByLabel('Olympics password',{exact:true})).toBeVisible({timeout:10000});
  expect(await other.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
  // Past the password again, the profile is still on the phone and signs back in as a volunteer.
  await other.getByLabel('Olympics password',{exact:true}).fill(process.env.E2E_OLYMPICS_PASSWORD!);
  await other.getByRole('button',{name:'Continue',exact:true}).click();
  await other.getByRole('button',{name,exact:true}).click();
  await expect(other.getByRole('button',{name:"I'm a zone lead",exact:true})).toBeVisible();await expect(dashboardButton(other)).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await context.close();
});
