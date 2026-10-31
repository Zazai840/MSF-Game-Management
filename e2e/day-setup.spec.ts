import {ownName,ownEvent,ownCode,lookProblems,back,expectToast,join,leadMenuButton,openLeadMenu,expect,test,type Locator,type Page} from './fixtures.js';

const redInk='rgb(196, 30, 58)';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
async function asOwner(page:Page) {
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/');await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
}
const section=(page:Page,name:string)=>page.getByRole('region',{name,exact:true});
const top=async(locator:Locator)=>(await locator.boundingBox())!.y;
/** Make a new lead code, answered yes in its sheet: the new code from the server, after its toast. */
async function makeNewLeadCode(page:Page) {
  await section(page,'Lead code').getByRole('button',{name:'Make a new lead code',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Make a new lead code?'});
  await sheet.getByRole('button',{name:'Make a new lead code',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  const fresh=(await(await page.request.get('/api/day',{headers:headers()})).json()).leadCode as string;
  await expectToast(page,`New lead code · ${fresh}`);
  return fresh;
}

test('Day setup is cards in the spec\'s order: the codes, the Signed in today and Events rows, the day export and Start a new day',async({page},info)=>{
  const phones=(await(await page.request.get('/api/day/phones',{headers:headers()})).json()).phones.length as number;
  const day=await(await page.request.get('/api/day',{headers:headers()})).json();
  await asOwner(page);
  await expect(page).toHaveURL(/\/day$/);
  await expect(page.getByRole('button',{name:'Back to Races',exact:true})).toBeVisible();

  const password=section(page,'Olympics password');
  await expect(password.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  await expect(password).toContainText('Volunteers type this once on their phone. It stays the same when a new day starts.');
  await expect(password.getByRole('button')).toHaveText(['Change Olympics password']);
  await expect(page.getByText(/day code/i)).toHaveCount(0);

  const leadCode=section(page,'Lead code');
  await expect(leadCode.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
  await expect(leadCode).toContainText('Give this only to zone leads. Typed on Join or in Your job, it makes the phone a zone lead.');
  await expect(leadCode.getByRole('button')).toHaveText(['Make a new lead code']);

  const signedIn=page.getByRole('button',{name:`Signed in today ${phones} ${phones===1?'person':'people'} signed in today`,exact:true});
  const events=page.getByRole('button',{name:`Events ${day.events.length} events`,exact:true});
  await expect(signedIn).toBeVisible();await expect(events).toBeVisible();
  await expect(page.getByText('Phones',{exact:true})).toHaveCount(0);

  const dayExport=section(page,'Day export');
  await expect(dayExport).toContainText("Excel file of today's results for the scoring workbook.");
  await expect(dayExport.getByRole('button',{name:'Download day export',exact:true})).toBeVisible();

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

  // This day (its own ticket) goes first; then the codes, the two rows, the day export and Start a new day.
  const tops=await Promise.all([password,leadCode,signedIn,events,dayExport,newDay].map(top));
  expect(tops).toEqual([...tops].sort((a,b)=>a-b));
  await expect(page.getByText(/^Updated at \d\d:\d\d:\d\d/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-setup.png'),fullPage:true});
});

test('Make a new lead code asks first: Keep changes nothing, and yes makes the new code with its toast',async({page},info)=>{
  await asOwner(page);
  const leadCode=section(page,'Lead code'),before=process.env.E2E_LEAD_CODE!;
  await leadCode.getByRole('button',{name:'Make a new lead code',exact:true}).click();
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

test('the day export says when it was last downloaded and whether changes came after',async({page},info)=>{
  await asOwner(page);
  const dayExport=section(page,'Day export');
  const downloaded=page.waitForEvent('download');await dayExport.getByRole('button',{name:'Download day export',exact:true}).click();
  await expectToast(page,`Downloaded · ${(await downloaded).suggestedFilename()}`);
  await expect(dayExport).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
  const code=await ownCode();
  await ownEvent(page.request,code,'Day setup sprint','Girl Cubs','timed');
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(dayExport).toContainText(/Last downloaded \d\d:\d\d, with newer changes since\./);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('day-export.png'),fullPage:true});
});

test('Signed in today and Events open their screens with a back arrow to Day setup, and lead actions there show the toast',async({page},info)=>{
  await asOwner(page);
  await page.getByRole('button',{name:/^Signed in today /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Signed in today',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
  await expect(page.getByRole('article',{name:'E2E Owner',exact:true})).toContainText('(you)');
  await expect(page.getByRole('button',{name:'Back',exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('phones.png'),fullPage:true});
  await back(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();

  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Back to Day setup',exact:true})).toBeVisible();
  const code=await ownCode();
  await page.getByLabel('New event code',{exact:true}).fill(code);
  await page.getByLabel('New event name',{exact:true}).fill('Saved sprint');
  await page.getByLabel('New event section',{exact:true}).selectOption('Girl Cubs');
  await page.getByLabel('New event format',{exact:true}).selectOption('timed');
  await page.getByLabel('New event type',{exact:true}).selectOption('races');
  await page.getByRole('button',{name:'Add event',exact:true}).click();
  await expectToast(page,`Event added · ${code}`);
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await expect(page.getByRole('article',{name:`${code} · Girl Cubs`})).toContainText('Saved sprint');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('events.png'),fullPage:true});
  await back(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
});

test('a lead who signed in with the lead code opens Day setup and makes a new lead code',async({page})=>{
  const name=ownName('Day setup lead');
  await page.goto('/');await join(page,name,{code:process.env.E2E_LEAD_CODE});
  await expect(leadMenuButton(page)).toBeVisible();
  await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expect(section(page,'Olympics password').getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  const before=process.env.E2E_LEAD_CODE!;
  await expect(section(page,'Lead code').getByText(before,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Signed in today /}).click();
  await expect(page.getByRole('article',{name,exact:true})).toContainText('(you)');
  await back(page,'Day setup');
  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await back(page,'Day setup');
  const fresh=await makeNewLeadCode(page);
  await expect(section(page,'Lead code').getByText(before,{exact:true})).toHaveCount(0);
  await expect(section(page,'Lead code').getByText(fresh,{exact:true})).toBeVisible();
  // The lead who made it stays a lead.
  await back(page,'Races');await expect(leadMenuButton(page)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});
