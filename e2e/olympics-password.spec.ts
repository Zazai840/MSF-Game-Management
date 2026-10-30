import {ownName,becomeLead,expect,join,lookProblems,openLeadMenu,signOwnerBackIn,test,type Page} from './fixtures.js';
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const joinScreen=(page:Page)=>expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible({timeout:10000});
test('changing the Olympics password sends both phones back to Join with their profiles kept',async({page,browser,baseURL},info)=>{
  const original=process.env.E2E_OLYMPICS_PASSWORD!,changed=`fresh-${info.project.name}-${Date.now()}`;
  const owner=ownName('Pass Owner'),lead=ownName('Pass Lead');
  const otherContext=await browser.newContext({baseURL});const other=await otherContext.newPage();
  try {
    await other.goto('/');await join(other,lead,{job:'Start line'});await races(other);
    await becomeLead(other);
    await page.goto('/');await join(page,owner,{job:'Start line'});await races(page);
    await becomeLead(page,'e2e-owner-fixture');
    await openLeadMenu(page,'Day setup');
    const card=page.getByRole('region',{name:'Olympics password'});
    await card.getByRole('button',{name:'Change Olympics password',exact:true}).click();
    const warning='Every phone, including yours, goes back to Join. Profiles stay on the phones.';
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
    // Both phones go back to Join; the pass, session, job and drafts go and the profiles stay.
    for(const phone of [page,other]) {
      await joinScreen(phone);
      expect(await phone.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
    }
    await other.screenshot({path:info.outputPath('lead-join.png')});
    // Wrong passwords share one backoff per IP across the whole run, so the old password's refusal is left to the server tests.
    // Joining with the new password, today's role comes back: still a lead.
    await join(other,lead,{code:changed,job:'Start line'});await races(other);
    await expect(other.getByRole('button',{name:`${lead}: Results, Day setup and Log out`,exact:true})).toBeVisible();
    // The owner gets back in with the owner password and reads the new password off the card.
    await join(page,owner,{code:'e2e-owner-fixture'});await races(page);
    await openLeadMenu(page,'Day setup');
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
