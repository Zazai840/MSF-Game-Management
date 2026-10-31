import {ownName,ownCode,openLeadMenu,expect,expectToast,join,test,back} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
test('a lead edits and confirms the Day programme',async({page},info)=>{
  // Other specs pick R4 by its seeded name, so put it back whatever happens here.
  const original=(await(await page.request.get('/api/day',{headers:headers()})).json()).events.find((event:{code:string})=>event.code==='R4').name as string;
  try {
    await page.goto('/');
    await join(page,ownName('Day'),{job:'Start line'});
    // A wrong code is refused in the job sheet; the owner password makes the phone a lead.
    await page.getByRole('button',{name:/^Your job: .*\. Change job$/}).click();
    await page.getByRole('radio',{name:/^Zone lead/}).click();
    await page.getByLabel('Lead code',{exact:true}).fill('wrong-lead-fixture');
    await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Your job'}).getByRole('alert')).toHaveText('Wrong lead code');
    await page.getByLabel('Lead code',{exact:true}).fill('e2e-owner-fixture');
    await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
    await expect(page.getByRole('button',{name:'Your job: Zone lead. Change job',exact:true})).toBeVisible();
    await openLeadMenu(page,'Day setup');
    await expect(page.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
    await expect(page.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^Events /}).click();
    await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Rename R4',exact:true}).click();
    await page.getByLabel('New name for R4',{exact:true}).fill(ownName('60m'));
    await page.getByRole('button',{name:'Save name for R4',exact:true}).click();
    await expectToast(page,`Name saved · R4 ${ownName('60m')}`);
    await expect(page.getByRole('article',{name:'R4 · Girl Cubs'})).toContainText(ownName('60m'));
    const code = await ownCode();
    await page.getByLabel('New event code',{exact:true}).fill(code);
    await page.getByLabel('New event name',{exact:true}).fill('Extra sprint');
    await page.getByLabel('New event section',{exact:true}).selectOption('Girl Cubs');
    await page.getByLabel('New event format',{exact:true}).selectOption('timed');
    await page.getByLabel('New event type',{exact:true}).selectOption('races');
    await page.getByRole('button',{name:'Add event',exact:true}).click();
    await expectToast(page,`Event added · ${code}`);
    const event = page.getByRole('article',{name:`${code} · Girl Cubs`});
    await expect(event).toContainText('Extra sprint');
    await event.getByRole('button',{name:`Switch off ${code}`,exact:true}).click();
    await expectToast(page,`${code} switched off`);
    await expect(event).toContainText('Switched off');
    await page.getByRole('button',{name:'Confirm event list',exact:true}).click();
    await expectToast(page,'Event list confirmed');
    await expect(page.getByRole('region',{name:'Event list'})).toHaveText('Event list confirmed');
    await page.screenshot({path:info.outputPath('day-programme.png'),fullPage:true});
    await back(page,'Day setup');
    await expect(page.getByRole('button',{name:/^Events \d+ events · checked and confirmed$/})).toBeVisible();
    await page.reload();
    await openLeadMenu(page,'Day setup');
    await expect(page.getByRole('button',{name:/^Events \d+ events · checked and confirmed$/})).toBeVisible();
    await page.getByRole('button',{name:/^Events /}).click();
    await expect(page.getByText('Event list confirmed',{exact:true})).toBeVisible();
  } finally {
    await page.request.post('/api/day/events/R4/rename',{headers:headers(),data:{name:original}});
  }
});
