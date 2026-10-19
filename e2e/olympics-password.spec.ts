import { createProfile,expect,lookProblems,openDashboard,signScoringTeamBackIn,test,typePassword,type Page } from './fixtures.js';
const home=(page:Page)=>expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
const passwordScreen=(page:Page)=>expect(page.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible({timeout:10000});
test('changing the Olympics password sends both phones to the password screen with their profiles kept',async({page,browser,baseURL},info)=>{
  const original=process.env.E2E_OLYMPICS_PASSWORD!,changed=`fresh-${info.project.name}-${Date.now()}`;
  const scorer=`Pass Scorer ${info.project.name}`,lead=`Pass Lead ${info.project.name}`;
  const otherContext=await browser.newContext({baseURL});const other=await otherContext.newPage();
  try {
    await other.goto('/');await createProfile(other,lead);await home(other);
    await other.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
    await other.getByLabel('Lead code or owner password').fill(process.env.E2E_LEAD_CODE!);
    await other.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
    await page.goto('/');await createProfile(page,scorer);await home(page);
    await page.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
    await page.getByLabel('Lead code or owner password').fill('e2e-owner-fixture');
    await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
    await openDashboard(page,'Day setup');
    const card=page.getByRole('region',{name:'Olympics password'});
    await card.getByRole('button',{name:'Change Olympics password',exact:true}).click();
    await expect(card.getByText('Every phone, including yours, goes back to the password screen. Profiles stay on the phones.',{exact:true})).toBeVisible();
    await card.getByLabel('New Olympics password',{exact:true}).fill('short');
    await card.getByRole('button',{name:'Change password',exact:true}).click();
    await expect(card.getByRole('alert')).toHaveText('Use at least 6 characters for the Olympics password');
    await card.getByLabel('New Olympics password',{exact:true}).fill(original);
    await card.getByRole('button',{name:'Change password',exact:true}).click();
    await expect(card.getByRole('alert')).toHaveText('That is already the Olympics password. Type a new one.');
    expect(await lookProblems(page)).toEqual([]);
    await card.screenshot({path:info.outputPath('change-password.png')});
    await card.getByLabel('New Olympics password',{exact:true}).fill(changed);
    await card.getByRole('button',{name:'Change password',exact:true}).click();
    // Both phones go back to the password screen; the pass, session and drafts go and the profiles stay.
    for(const phone of [page,other]) {
      await passwordScreen(phone);
      expect(await phone.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
    }
    await other.screenshot({path:info.outputPath('lead-password-screen.png')});
    await typePassword(other,original);
    await expect(other.getByRole('alert')).toHaveText('That is not the Olympics password. Check with a lead and try again.');
    await typePassword(other,changed);
    await other.getByRole('button',{name:lead,exact:true}).click();await home(other);
    // Today's role came back with the new password.
    await expect(other.getByRole('button',{name:"I'm a zone lead",exact:true})).toHaveCount(0);
    // The scoring team gets back in with the owner password and reads the new password off the card.
    await typePassword(page,'e2e-owner-fixture');
    await page.getByLabel('Full name',{exact:true}).fill(scorer);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await openDashboard(page,'Day setup');
    await expect(page.getByRole('region',{name:'Olympics password'}).getByText(changed,{exact:true})).toBeVisible();
    await page.getByRole('region',{name:'Olympics password'}).screenshot({path:info.outputPath('new-password-card.png')});
  } finally {
    await otherContext.close().catch(()=>{});
    // Put the shared test day back: the original password, and a live scoring team session for later specs.
    await signScoringTeamBackIn(page.request);
    const day=await (await page.request.get('/api/day',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`}})).json();
    if(day.olympicsPassword!==original) {
      await page.request.post('/api/day/olympics-password',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{password:original}});
      await signScoringTeamBackIn(page.request);
    }
  }
});
