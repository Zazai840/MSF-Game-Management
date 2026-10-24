import { createProfile,expect,lookProblems,openDashboard,signOwnerBackIn,test,typePassword,type Page } from './fixtures.js';
const home=(page:Page)=>expect(page.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();
const passwordScreen=(page:Page)=>expect(page.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible({timeout:10000});
test('changing the Olympics password sends both phones to the password screen with their profiles kept',async({page,browser,baseURL},info)=>{
  const original=process.env.E2E_OLYMPICS_PASSWORD!,changed=`fresh-${info.project.name}-${Date.now()}`;
  const owner=`Pass Owner ${info.project.name}`,lead=`Pass Lead ${info.project.name}`;
  const otherContext=await browser.newContext({baseURL});const other=await otherContext.newPage();
  try {
    await other.goto('/');await createProfile(other,lead);await home(other);
    await other.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
    await other.getByLabel('Lead code or owner password').fill(process.env.E2E_LEAD_CODE!);
    await other.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
    await page.goto('/');await createProfile(page,owner);await home(page);
    await page.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
    await page.getByLabel('Lead code or owner password').fill('e2e-owner-fixture');
    await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
    await openDashboard(page,'Day setup');
    const card=page.getByRole('region',{name:'Olympics password'});
    await card.getByRole('button',{name:'Change Olympics password',exact:true}).click();
    const warning='Every phone, including yours, goes back to the password screen. Profiles stay on the phones.';
    // Change password asks first; Keep the old password goes back to the form with nothing changed.
    const change=async(password:string)=>{
      await card.getByLabel('New Olympics password',{exact:true}).fill(password);
      await card.getByRole('button',{name:'Change password',exact:true}).click();
      await expect(card.getByText(warning,{exact:true})).toBeVisible();
    };
    await change('short');
    await card.getByRole('button',{name:'Keep the old password',exact:true}).click();
    await expect(card.getByText(warning,{exact:true})).toHaveCount(0);
    await expect(card.getByLabel('New Olympics password',{exact:true})).toHaveValue('short');
    await card.getByRole('button',{name:'Change password',exact:true}).click();
    expect(await lookProblems(page)).toEqual([]);
    await card.screenshot({path:info.outputPath('change-password-confirm.png')});
    await card.getByRole('button',{name:'Yes, change password',exact:true}).click();
    await expect(card.getByRole('alert')).toHaveText('Use at least 6 characters for the Olympics password');
    await change(original);
    await card.getByRole('button',{name:'Yes, change password',exact:true}).click();
    await expect(card.getByRole('alert')).toHaveText('That is already the Olympics password. Type a new one.');
    expect(await lookProblems(page)).toEqual([]);
    await card.screenshot({path:info.outputPath('change-password.png')});
    await change(changed);
    await card.getByRole('button',{name:'Yes, change password',exact:true}).click();
    // Both phones go back to the password screen; the pass, session and drafts go and the profiles stay.
    for(const phone of [page,other]) {
      await passwordScreen(phone);
      expect(await phone.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
    }
    await other.screenshot({path:info.outputPath('lead-password-screen.png')});
    // Wrong passwords share one backoff per IP across the whole run, so the old password's refusal is left to the server tests.
    await typePassword(other,changed);
    // Today's role comes back with the new password.
    const row=other.getByRole('button',{name:new RegExp(`^${lead}`)});
    await expect(row.getByText('Lead',{exact:true})).toBeVisible();
    await row.click();await home(other);
    await expect(other.getByRole('button',{name:"I'm a zone lead",exact:true})).toHaveCount(0);
    // The owner gets back in with the owner password and reads the new password off the card.
    await typePassword(page,'e2e-owner-fixture');
    await page.getByLabel('Full name',{exact:true}).fill(owner);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await openDashboard(page,'Day setup');
    await expect(page.getByRole('region',{name:'Olympics password'}).getByText(changed,{exact:true})).toBeVisible();
    await page.getByRole('region',{name:'Olympics password'}).screenshot({path:info.outputPath('new-password-card.png')});
  } finally {
    await otherContext.close().catch(()=>{});
    // Put the shared test day back: the original password, and a live owner session for later specs.
    await signOwnerBackIn(page.request);
    const day=await (await page.request.get('/api/day',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`}})).json();
    if(day.olympicsPassword!==original) {
      await page.request.post('/api/day/olympics-password',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{password:original}});
      await signOwnerBackIn(page.request);
    }
  }
});
