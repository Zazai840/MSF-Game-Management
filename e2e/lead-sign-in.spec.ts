import { createProfile,dashboardButton,expect,leadSignIn,lookProblems,test } from './fixtures.js';
test('Lead sign-in with an unknown name creates the profile as a lead, and the profile screen tags it',async({page},info)=>{
  const name=`Bilal Lead ${info.project.name}`;
  await page.goto('/');await createProfile(page,`Other Person ${info.project.name}`);
  await expect(page.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();
  await page.evaluate(()=>localStorage.removeItem('msf:token'));await page.reload();
  const toggle=page.getByRole('button',{name:'Lead today? Sign in'});
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await toggle.click();
  await expect(page.getByRole('button',{name:'New here? Create profile'})).toHaveAttribute('aria-expanded','false');
  const button=page.getByRole('button',{name:'Sign in as lead',exact:true});
  const box=(await button.boundingBox())!;
  expect(page.viewportSize()!.height-(box.y+box.height)).toBeLessThanOrEqual(24);
  expect(await page.getByLabel("Today's lead code").evaluate(element=>getComputedStyle(element).fontSize)).toBe('20px');
  await page.getByLabel('Full name',{exact:true}).fill(name);
  // A real wrong code would count against the shared test IP's backoff (as day.spec's do), so the refusal is replayed here; the API test covers it.
  await page.route('**/api/lead-sign-in',route=>route.fulfill({status:403,json:{message:"That is not today's lead code. Ask a lead for it."}}),{times:1});
  await page.getByLabel("Today's lead code").fill('WRONG1');
  await button.click();
  await expect(page.getByRole('alert')).toHaveText("That is not today's lead code. Ask a lead for it.");
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-sign-in.png')});
  await page.getByLabel("Today's lead code").fill(process.env.E2E_LEAD_CODE!);
  await button.click();
  await expect(dashboardButton(page)).toBeVisible();
  await expect(page.getByRole('banner').getByText(name,{exact:true})).toBeVisible();
  // Back on the profile screen, the row carries today's role.
  await page.evaluate(()=>localStorage.removeItem('msf:token'));await page.reload();
  const row=page.getByRole('button',{name:new RegExp(`^${name}`)});
  await expect(row.getByText('Lead',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:new RegExp(`^Other Person ${info.project.name}`)}).getByText('Lead',{exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('profiles-tagged.png')});
  await row.click();
  await expect(dashboardButton(page)).toBeVisible();
});
test('Lead sign-in with a name taken on another phone signs in with the lowest free number',async({page,browser},info)=>{
  const name=`Sara Taken Lead ${info.project.name}`;
  await page.goto('/');await createProfile(page,name);
  await expect(page.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();
  const second=await browser.newContext({...info.project.use});
  try {
    const other=await second.newPage();await other.goto('/');
    await leadSignIn(other,name.toLowerCase());
    await expect(other.getByRole('status')).toHaveText(`${name} is already taken, so you're signed in as ${name} 2`);
    await expect(other.getByRole('status').locator('strong')).toHaveText(`${name} 2`);
    await expect(other.getByRole('banner').getByText(`${name} 2`,{exact:true})).toBeVisible();
    // Initials skip the number: "Sara Taken Lead iPhone 2" is SI, not S2.
    await expect(other.getByRole('banner').locator('.avatar')).toHaveText(`S${info.project.name[0].toUpperCase()}`);
    await expect(dashboardButton(other)).toBeVisible();
    expect(await lookProblems(other)).toEqual([]);
    await other.screenshot({path:info.outputPath('lead-numbered.png')});
  } finally {await second.close();}
  // The first phone's profile is untouched.
  await page.reload();
  await expect(page.getByRole('banner').getByText(name,{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:"I'm a zone lead",exact:true})).toBeVisible();
});
