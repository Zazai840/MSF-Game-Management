import {ownName,ownEvent,ownCode,lookProblems,inViewAboveFooter,back,expectToast,join,labelDay,leadsBar,openLeadsBarTab,press,expect,test,pullToRefresh,type Page} from './fixtures.js';

const redInk='rgb(196, 30, 58)';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
async function asOwner(page:Page) {
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/');await openLeadsBarTab(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
}
const section=(page:Page,name:string)=>page.getByRole('region',{name,exact:true});
const title=(page:Page,name:string)=>expect(page.getByRole('heading',{level:1,name,exact:true})).toBeVisible();
/** A row of Day setup, by its first words; `whole` to name it exactly. */
const row=(page:Page,name:string,whole=false)=>page.getByRole('main').getByRole('listitem').getByRole('button',{name:whole?name:new RegExp(`^${name}`),exact:whole});
/** Opens one of Day setup's screens from its row: its own address, its title and a back arrow to Day setup. */
async function openRow(page:Page,name:string,address:string) {
  await press(row(page,name));
  await expect(page).toHaveURL(new RegExp(`${address}$`));await title(page,name);
  await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
  // The bar names the screen; the card below does not say it again.
  await expect(page.getByRole('heading',{name,exact:true})).toHaveCount(1);
}
const toDaySetup=async(page:Page)=>{await back(page,'Day setup');await title(page,'Day setup');};
/** Make a new lead code, answered yes in its sheet: the new code from the server, after its toast. */
async function makeNewLeadCode(page:Page) {
  await press(row(page,'Make a new lead code'));
  const sheet=page.getByRole('dialog',{name:'Make a new lead code?'});
  await sheet.getByRole('button',{name:'Make a new lead code',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  const fresh=(await(await page.request.get('/api/day',{headers:headers()})).json()).leadCode as string;
  await expectToast(page,`New lead code · ${fresh}`);
  return fresh;
}

test('Day setup is one card with both codes and seven rows in the order of the day, all on one screen',async({page},info)=>{
  const phones=(await(await page.request.get('/api/day/phones',{headers:headers()})).json()).phones.length as number;
  const day=await(await page.request.get('/api/day',{headers:headers()})).json();
  await asOwner(page);
  await expect(page).toHaveURL(/\/day$/);
  // Day setup has no back arrow: the lead's bar goes to Races and Results.
  await expect(page.getByRole('banner').getByRole('button',{name:/^Back to /})).toHaveCount(0);

  // Both codes in one card, side by side, with one line that says which is for whom.
  const password=section(page,'Olympics password'),leadCode=section(page,'Lead code');
  await expect(password.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  await expect(leadCode.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
  const passwordBox=(await password.boundingBox())!,leadBox=(await leadCode.boundingBox())!;
  expect(leadBox.x).toBeGreaterThanOrEqual(passwordBox.x+passwordBox.width);expect(leadBox.y).toBe(passwordBox.y);
  await expect(page.getByText('The Olympics password is for every volunteer. The lead code is only for zone leads.',{exact:true})).toBeVisible();
  await expect(page.locator('.rz-codecard')).toHaveCount(1);await expect(page.locator('.rz-codecard').getByRole('button')).toHaveCount(0);
  await expect(page.getByText(/day code/i)).toHaveCount(0);

  const rows=page.getByRole('main').getByRole('listitem').getByRole('button');
  await expect(rows).toHaveText([`This day${new Date().getUTCFullYear()} · South · Day 1`,`Events${day.events.length} events`,`Signed in today${phones} ${phones===1?'person':'people'} signed in today`,
    'Change Olympics password','Make a new lead code',/^Day export(Not downloaded yet|Last downloaded \d\d:\d\d, (includes every change so far|with newer changes since))\.$/,'Start a new day']);
  await expect(row(page,'This day')).not.toHaveClass(/rz-listrow--warn/);

  await expect(page.getByText(/^Updated at \d\d:\d\d:\d\d/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh',exact:true})).toHaveCount(0);
  // Every row shows without scrolling.
  await inViewAboveFooter(page,await rows.all());
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-setup.png'),fullPage:true});
});

test('This day is its own screen: each choice saves on tap with its toast, and its row and the Day export row show the change',async({page},info)=>{
  const year=new Date().getUTCFullYear();
  await asOwner(page);
  await openRow(page,'Day export','/day/export');
  const downloaded=page.waitForEvent('download');await press(page.getByRole('button',{name:'Download day export',exact:true}));await downloaded;
  await expect(section(page,'Day export')).toContainText(/includes every change so far\./);
  await toDaySetup(page);
  await openRow(page,'This day','/day/this-day');
  const thisDay=section(page,'This day');
  await expect(thisDay).toContainText('Goes on the Day export. Any lead can change it.');
  const choice=(group:string,name:string)=>thisDay.getByRole('group',{name:group,exact:true}).getByRole('button',{name,exact:true});
  const pressed=(group:string)=>thisDay.getByRole('group',{name:group,exact:true}).getByRole('button',{pressed:true}).allTextContents();
  const chosen=()=>Promise.all(['Year','Region','Day'].map(pressed));
  // Year runs from 2026 to next year; global setup chose the current year, South and Day 1.
  await expect(thisDay.getByRole('group',{name:'Year',exact:true}).getByRole('button')).toHaveText(Array.from({length:year-2024},(_,index)=>String(2026+index)));
  await expect(thisDay.getByRole('group',{name:'Region',exact:true}).getByRole('button')).toHaveText(['North','South','National']);
  await expect(thisDay.getByRole('group',{name:'Day',exact:true}).getByRole('button')).toHaveText(['1','2','3','4','5']);
  await expect.poll(chosen).toEqual([[String(year)],['South'],['1']]);
  try {
    await press(choice('Region','North'));
    await expectToast(page,'Region saved · North');
    await expect(choice('Region','North')).toHaveAttribute('aria-pressed','true');await expect(choice('Region','South')).toHaveAttribute('aria-pressed','false');
    expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('this-day-saved.png')});
    await press(choice('Day','3'));
    await expectToast(page,'Day saved · Day 3');await expect(choice('Day','3')).toHaveAttribute('aria-pressed','true');
    await press(choice('Year',String(year+1)));
    await expectToast(page,`Year saved · ${year+1}`);await expect(choice('Year',String(year+1))).toHaveAttribute('aria-pressed','true');
    const saved=await(await page.request.get('/api/day',{headers:headers()})).json();
    expect([saved.year,saved.region,saved.dayNumber]).toEqual([year+1,'North',3]);
    // It is saved, not just shown: a reload shows the same choices.
    await page.reload();
    await expect.poll(chosen).toEqual([[String(year+1)],['North'],['3']]);
    // Day setup's rows say it too: the day's label, and in amber that the downloaded file is now old.
    await toDaySetup(page);
    await expect(row(page,`This day ${year+1} · North · Day 3`,true)).toBeVisible();
    await expect(row(page,'Day export')).toHaveText(/with newer changes since\.$/);await expect(row(page,'Day export')).toHaveClass(/rz-listrow--warn/);
    expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-setup-export-old.png')});
  } finally {await labelDay(page.request);}
});

test('Make a new lead code asks first from its row: Keep changes nothing, and yes makes the new code with its toast',async({page},info)=>{
  await asOwner(page);
  const leadCode=section(page,'Lead code'),before=process.env.E2E_LEAD_CODE!;
  await press(row(page,'Make a new lead code'));
  const sheet=page.getByRole('dialog',{name:'Make a new lead code?'});
  await expect(sheet).toContainText('Every other lead loses lead access until they type the new code.');
  const keep=sheet.getByRole('button',{name:`Keep ${before}`,exact:true}),yes=sheet.getByRole('button',{name:'Make a new lead code',exact:true});
  await expect(keep).toBeVisible();
  // The red yes is the main button: right of the plain Keep, or above it when the two do not fit side by side.
  expect(await yes.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(redInk);
  const keepBox=(await keep.boundingBox())!,yesBox=(await yes.boundingBox())!;
  expect(Math.abs(keepBox.y-yesBox.y)<1?yesBox.x>keepBox.x:yesBox.y<keepBox.y).toBe(true);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('new-lead-code-sheet.png')});
  await keep.click();
  await expect(sheet).toHaveCount(0);
  await expect(leadCode.getByText(before,{exact:true})).toBeVisible();
  expect((await(await page.request.get('/api/day',{headers:headers()})).json()).leadCode).toBe(before);

  const fresh=await makeNewLeadCode(page);
  expect(fresh).not.toBe(before);
  await expect(leadCode.getByText(fresh,{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-setup-toast.png')});
});

test('Day export is its own screen: the download with its status, and its row is amber once changes came after',async({page},info)=>{
  await asOwner(page);
  await openRow(page,'Day export','/day/export');
  const dayExport=section(page,'Day export');
  await expect(dayExport).toContainText("Excel file of today's results for the scoring workbook.");
  const downloaded=page.waitForEvent('download');await dayExport.getByRole('button',{name:'Download day export',exact:true}).click();
  await expectToast(page,'Downloaded');await downloaded;
  await expect(dayExport).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
  await expect(page.getByText(/^Updated at \d\d:\d\d:\d\d/)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await toDaySetup(page);
  await expect(row(page,'Day export')).toHaveText(/Last downloaded \d\d:\d\d, includes every change so far\.$/);await expect(row(page,'Day export')).not.toHaveClass(/rz-listrow--warn/);
  const code=await ownCode();
  await ownEvent(page.request,code,'Day setup sprint','Girl Cubs','timed');
  await pullToRefresh(page);
  await expect(row(page,'Day export')).toHaveText(/Last downloaded \d\d:\d\d, with newer changes since\.$/);await expect(row(page,'Day export')).toHaveClass(/rz-listrow--warn/);
  await openRow(page,'Day export','/day/export');
  await expect(dayExport).toContainText(/Last downloaded \d\d:\d\d, with newer changes since\./);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-export.png'),fullPage:true});
});

test('Start a new day is its own screen with the red card and the typed NEW DAY',async({page},info)=>{
  await asOwner(page);
  await openRow(page,'Start a new day','/day/start-a-new-day');
  const newDay=section(page,'Start a new day');
  await expect(newDay).toContainText("Clears today's races. Download the day export first.");
  const typed=newDay.getByLabel('Type NEW DAY to confirm',{exact:true}),start=newDay.getByRole('button',{name:'Start a new day',exact:true});
  await expect(typed).toBeVisible();
  await expect(start).toBeDisabled();
  // The red outline marks the one card that clears the day, and its button turns red once NEW DAY is typed.
  expect(await newDay.evaluate(element=>getComputedStyle(element).outlineColor)).toBe(redInk);
  await typed.fill('NEW DAY');await expect(start).toBeEnabled();
  expect(await start.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(redInk);
  await typed.fill('');await expect(start).toBeDisabled();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('start-a-new-day.png'),fullPage:true});
  await toDaySetup(page);
});

test('Signed in today, Events and Change Olympics password open their screens with a back arrow to Day setup',async({page},info)=>{
  await asOwner(page);
  await page.getByRole('button',{name:/^Signed in today /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
  await expect(page.getByRole('listitem').filter({hasText:'E2E Owner'})).toContainText('(you)');
  await expect(page.getByRole('button',{name:'Back',exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('phones.png'),fullPage:true});
  await back(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();

  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
  await back(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();

  await openRow(page,'Change Olympics password','/day/olympics-password');
  await toDaySetup(page);
});

test('a lead who signed in with the lead code opens Day setup and makes a new lead code',async({page})=>{
  const name=ownName('Day setup lead');
  await page.goto('/');await join(page,name,{code:process.env.E2E_LEAD_CODE});
  await expect(leadsBar(page)).toBeVisible();
  await openLeadsBarTab(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expect(section(page,'Olympics password').getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  const before=process.env.E2E_LEAD_CODE!;
  await expect(section(page,'Lead code').getByText(before,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Signed in today /}).click();
  await expect(page.getByRole('listitem').filter({hasText:name})).toContainText('(you)');
  await back(page,'Day setup');
  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await back(page,'Day setup');
  const fresh=await makeNewLeadCode(page);
  await expect(section(page,'Lead code').getByText(before,{exact:true})).toHaveCount(0);
  await expect(section(page,'Lead code').getByText(fresh,{exact:true})).toBeVisible();
  // The lead who made it stays a lead.
  await back(page,'Races');await expect(leadsBar(page)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});
