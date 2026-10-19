import { lookProblems,steps,trailBack,openDashboard,expect,test,type Page } from './fixtures.js';

const red='rgb(172, 48, 54)',white='rgb(255, 255, 255)';
const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
async function scoring(page:Page) {
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_SCORING_TOKEN!);
  await page.goto('/');await openDashboard(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
}
const section=(page:Page,name:string)=>page.getByRole('region',{name,exact:true});
/** The short "Saved" note a lead action leaves on the screen it returns to. */
const savedNote=(page:Page)=>page.locator('.dashboard-saved');

test('Day setup explains each code, row, the day export and Start a new day in plain English',async({page},info)=>{
  const phones=(await(await page.request.get('/api/day/phones',{headers:headers()})).json()).phones.length as number;
  const day=await(await page.request.get('/api/day',{headers:headers()})).json();
  await scoring(page);

  const password=section(page,'Olympics password');
  expect(await page.locator('.day-card').first().getAttribute('aria-label')).toBe('Olympics password');
  await expect(password.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  await expect(password).toContainText('Volunteers type this once on their phone. Only the scoring team can see it here.');
  await expect(password).toContainText('It stays the same when a new day starts.');
  await expect(password.getByRole('button')).toHaveText(['Change Olympics password']);
  expect(await password.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true}).evaluate(element=>getComputedStyle(element).fontSize)).toBe('32px');
  await expect(page.getByText(/day code/i)).toHaveCount(0);
  await password.screenshot({path:info.outputPath('olympics-password-card.png')});

  const leadCode=section(page,'Lead code');
  await expect(leadCode.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
  await expect(leadCode).toContainText('Give this only to zone leads. It opens the Dashboard.');
  await expect(leadCode.getByRole('button',{name:'Make a new lead code',exact:true})).toBeVisible();
  await expect(leadCode).toContainText('Zone leads who used the old code go back to being volunteers. The scoring team keeps access.');

  await expect(page.getByRole('button',{name:`Phones ${phones} ${phones===1?'person':'people'} signed in today`,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:`Events ${day.events.length} events · ${day.eventsConfirmed?'checked and confirmed':'not confirmed yet'}`,exact:true})).toBeVisible();

  const dayExport=section(page,'Day export');
  await expect(dayExport).toContainText("Excel file of today's results for the scoring workbook.");
  await expect(dayExport.getByRole('button',{name:'Download day export',exact:true})).toBeVisible();

  const start=page.getByRole('button',{name:'Start a new day',exact:true});
  await expect(start).toBeVisible();
  expect(await start.evaluate(element=>{const style=getComputedStyle(element);return [style.color,style.borderTopColor,style.backgroundColor];})).toEqual([red,red,white]);
  await expect(section(page,'Start a new day')).toContainText("Clears today's races. Download the day export first.");
  await expect(page.getByLabel('Type NEW DAY to confirm')).toBeVisible();
  await expect(start).toBeDisabled();
  await page.evaluate(()=>window.scrollTo(0,0));expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-setup.png'),fullPage:true});
});

test('the day export says when it was last downloaded and whether changes came after',async({page},info)=>{
  await scoring(page);
  const dayExport=section(page,'Day export');
  const downloaded=page.waitForEvent('download');await dayExport.getByRole('button',{name:'Download day export',exact:true}).click();await downloaded;
  await expect(dayExport).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
  const code=`DS-${info.project.name.toUpperCase()}`;
  await page.request.post('/api/day/events',{headers:headers(),data:{code,name:'Day setup sprint',section:'Girl Cubs',format:'timed'}});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(dayExport).toContainText(/Last downloaded \d\d:\d\d, with newer changes since\./);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-export.png'),fullPage:true});
});

test('Phones and Events open their screens with a trail back, and lead actions there say Saved',async({page},info)=>{
  await scoring(page);
  await page.getByRole('button',{name:/^Phones /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await expect(steps(page)).toHaveText(/^(Home|…)?\s*›?\s*(Dashboard|…)\s*›\s*Day setup\s*›\s*Signed in today$/);
  await expect(page.getByRole('article',{name:'E2E Scoring',exact:true})).toContainText('(you)');
  await expect(page.getByRole('button',{name:'Back',exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('phones.png'),fullPage:true});
  await trailBack(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();

  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await expect(steps(page)).toHaveText(/^(Home\s*›\s*Dashboard|…)\s*›\s*Day setup\s*›\s*Events$/);
  const code=`DE-${info.project.name.toUpperCase()}`;
  await page.getByLabel('New event code',{exact:true}).fill(code);
  await page.getByLabel('New event name',{exact:true}).fill('Saved sprint');
  await page.getByLabel('New event section',{exact:true}).selectOption('Girl Cubs');
  await page.getByLabel('New event format',{exact:true}).selectOption('timed');
  await page.getByRole('button',{name:'Add event',exact:true}).click();
  await expect(savedNote(page)).toHaveText('Saved');
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await expect(page.getByRole('article',{name:`${code} · Girl Cubs`})).toContainText('Saved sprint');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('events.png'),fullPage:true});
  await trailBack(page,'Day setup');

  const before=process.env.E2E_LEAD_CODE!;
  await section(page,'Lead code').getByRole('button',{name:'Make a new lead code',exact:true}).click();
  await expect(savedNote(page)).toHaveText('Saved');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expect(section(page,'Lead code').getByText(before,{exact:true})).toHaveCount(0);
  const fresh=await(await page.request.get('/api/day',{headers:headers()})).json();
  await expect(section(page,'Lead code').getByText(fresh.leadCode,{exact:true})).toBeVisible();
});
