import { openDashboard,becomeLead,expect,createProfile,test,back } from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
test('a lead edits and confirms the Day programme',async({page},info)=>{
  // Other specs pick R4 by its seeded name, so put it back whatever happens here.
  const original=(await(await page.request.get('/api/day',{headers:headers()})).json()).events.find((event:{code:string})=>event.code==='R4').name as string;
  try {
    await page.goto('/');
    await createProfile(page,`Day ${info.project.name}`);
    await becomeLead(page,'wrong-lead-fixture');
    await expect(page.getByRole('alert')).toHaveText('Wrong lead code');
    await page.getByLabel('Lead code or owner password').fill('e2e-owner-fixture');
    await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
    await openDashboard(page,'Day setup');
    await expect(page.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
    await expect(page.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
    await page.getByRole('button',{name:/^Events /}).click();
    await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Rename R4',exact:true}).click();
    await page.getByLabel('New name for R4',{exact:true}).fill(`60m ${info.project.name}`);
    await page.getByRole('button',{name:'Save name for R4',exact:true}).click();
    await expect(page.getByRole('article',{name:'R4 · Girl Cubs'})).toContainText(`60m ${info.project.name}`);
    const code = `DAY-${info.project.name.toUpperCase()}`;
    await page.getByLabel('New event code',{exact:true}).fill(code);
    await page.getByLabel('New event name',{exact:true}).fill('Extra sprint');
    await page.getByLabel('New event section',{exact:true}).selectOption('Girl Cubs');
    await page.getByLabel('New event format',{exact:true}).selectOption('timed');
    await page.getByLabel('New event type',{exact:true}).selectOption('races');
    await page.getByRole('button',{name:'Add event',exact:true}).click();
    const event = page.getByRole('article',{name:`${code} · Girl Cubs`});
    await expect(event).toContainText('Extra sprint');
    await event.getByRole('button',{name:`Switch off ${code}`,exact:true}).click();
    await expect(event).toContainText('Switched off');
    await page.getByRole('button',{name:'Confirm event list',exact:true}).click();
    await expect(page.getByText('Event list confirmed',{exact:true})).toBeVisible();
    await page.screenshot({path:info.outputPath('day-programme.png'),fullPage:true});
    await back(page,'Day setup');
    await expect(page.getByRole('button',{name:/^Events \d+ events · checked and confirmed$/})).toBeVisible();
    await page.reload();
    await openDashboard(page,'Day setup');
    await expect(page.getByRole('button',{name:/^Events \d+ events · checked and confirmed$/})).toBeVisible();
    await page.getByRole('button',{name:/^Events /}).click();
    await expect(page.getByText('Event list confirmed',{exact:true})).toBeVisible();
  } finally {
    await page.request.post('/api/day/events/R4/rename',{headers:headers(),data:{name:original}});
  }
});
