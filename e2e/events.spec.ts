import {ownName,ownCode,ownEvent,openLeadMenu,becomeLead,expect,expectToast,join,lookProblems,press,test,back,type Page} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
/** An event's row on Events, found by the code that starts its second line. */
const row=(page:Page,code:string)=>page.getByRole('list',{name:'Events'}).getByRole('button',{name:new RegExp(` ${code} · `)});
const heading=(page:Page,name:string)=>page.getByRole('banner').getByRole('heading',{level:1,name,exact:true});
const docked=(page:Page)=>page.getByRole('contentinfo');

test('a lead opens Events from Day setup, renames an event on its own screen and switches it off and on, each with its toast',async({page},info)=>{
  const code=await ownCode(),name=ownName('Events sprint'),renamed=ownName('Events dash');
  await ownEvent(page.request,code,name,'Girl Cubs','timed','hurdles');
  await page.goto('/');
  await join(page,ownName('Events lead'),{job:'Start line'});
  // The owner password in the job sheet makes the phone a lead. A wrong code's refusal is shown in look.spec and proved in
  // the API tests: the server slows wrong codes from one address, which every e2e phone shares.
  await becomeLead(page,'e2e-owner-fixture');
  await openLeadMenu(page,'Day setup');
  // The Events row names only how many events there are: there is no list to confirm.
  await expect(page.getByRole('button',{name:/^Events \d+ events$/})).toBeVisible();
  await press(page.getByRole('button',{name:/^Events \d+ events$/}));
  await expect(page).toHaveURL(/\/day\/events$/);
  await expect(heading(page,'Events')).toBeVisible();
  await expect(page.getByText(/confirm/i)).toHaveCount(0);

  // A row per event: its title as on Races ("60m · Girl Cubs"), then its code, Races or Hurdles and its format.
  const event=row(page,code),sheet=page.getByRole('dialog',{name:`${name} · Girl Cubs`,exact:true});
  await expect(event.getByText(`${name} · Girl Cubs`,{exact:true})).toBeVisible();
  await expect(event.getByText(`${code} · Hurdles · Timed`,{exact:true})).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText(/Updated at \d\d:\d\d:\d\d/)).toBeVisible();
  // Add an event stays at the end of the list.
  expect(await page.getByRole('main').getByRole('button').last().textContent()).toBe('Add an event');
  await event.scrollIntoViewIfNeeded();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('events.png')});

  // A tap opens a sheet named after the event with Rename and Switch off; the phone's Back closes it and stays on Events.
  await press(event);
  await expect(sheet.getByRole('button',{name:'Rename',exact:true})).toBeVisible();
  await expect(sheet.getByRole('button',{name:'Switch off',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('event-sheet.png')});
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/day\/events$/);await expect(heading(page,'Events')).toBeVisible();

  // Rename opens its own screen with a docked Save, then goes back to Events with the sheet closed.
  await press(event);await press(sheet.getByRole('button',{name:'Rename',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/day/events/${code}/rename$`));
  await expect(heading(page,`Rename ${code}`)).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Events',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:`New name for ${code}?`,exact:true})).toBeVisible();
  await expect(page.getByText('Races, Results and the Day export show the new name.',{exact:true})).toBeVisible();
  const field=page.getByLabel('Event name',{exact:true});
  await expect(field).toHaveValue(name);await expect(field).not.toBeFocused();
  await expect(docked(page)).toContainText('Change the name to save.');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('rename.png'),fullPage:true});
  await field.fill(renamed);
  await expect(docked(page)).not.toContainText('Change the name to save.');
  await press(docked(page).getByRole('button',{name:'Save name',exact:true}));
  await expectToast(page,`Name saved · ${code} ${renamed}`);
  await expect(page).toHaveURL(/\/day\/events$/);
  await expect(heading(page,'Events')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(event.getByText(`${renamed} · Girl Cubs`,{exact:true})).toBeVisible();

  // Switch off and on save at once and close the sheet; the row says "Switched off".
  const renamedSheet=page.getByRole('dialog',{name:`${renamed} · Girl Cubs`,exact:true});
  await press(event);await press(renamedSheet.getByRole('button',{name:'Switch off',exact:true}));
  await expectToast(page,`${code} switched off`);
  await expect(renamedSheet).toHaveCount(0);
  await expect(event.getByText(`${code} · Hurdles · Timed · Switched off`,{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('switched-off.png')});
  await press(event);
  await expect(renamedSheet.getByRole('button',{name:'Switch off',exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await press(renamedSheet.getByRole('button',{name:'Switch on',exact:true}));
  await expectToast(page,`${code} switched on`);
  await expect(renamedSheet).toHaveCount(0);
  await expect(event).not.toContainText('Switched off');
  // A reload stays on Events.
  await page.reload();await expect(heading(page,'Events')).toBeVisible();
  await back(page,'Day setup');
  await expect(heading(page,'Day setup')).toBeVisible();
});

test('a lead adds an event on its own screen: the docked Add event says what is missing, then the new event has its row',async({page},info)=>{
  const code=await ownCode(),name=ownName('Added sprint');
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/day/events');
  await expect(heading(page,'Events')).toBeVisible();
  await press(page.getByRole('button',{name:'Add an event',exact:true}));
  await expect(page).toHaveURL(/\/day\/events\/new$/);
  await expect(heading(page,'Add an event')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Events',exact:true})).toBeVisible();
  const add=docked(page).getByRole('button',{name:'Add event',exact:true});
  await expect(docked(page)).toContainText('Type the event code first.');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('add-an-event.png'),fullPage:true});
  await page.getByLabel('Event code',{exact:true}).fill(code);
  await expect(docked(page)).toContainText('Type the event name first.');
  await page.getByLabel('Event name',{exact:true}).fill(name);
  await expect(docked(page)).toContainText('Choose the section first.');
  await press(page.getByRole('group',{name:'Section'}).getByRole('button',{name:'Boy Scouts',exact:true}));
  await expect(docked(page)).toContainText('Choose Races or Hurdles first.');
  await press(page.getByRole('group',{name:'Races or Hurdles'}).getByRole('button',{name:'Races',exact:true}));
  await expect(docked(page)).toContainText('Choose the format first.');
  await press(page.getByRole('group',{name:'Format'}).getByRole('button',{name:'Heats then final',exact:true}));
  await expect(page.getByRole('group',{name:'Format'}).getByRole('button',{name:'Heats then final',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(docked(page).getByText(/first\.$/)).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await press(add);
  await expectToast(page,`Event added · ${code}`);
  await expect(page).toHaveURL(/\/day\/events$/);
  const event=row(page,code);
  await expect(event.getByText(`${name} · Boy Scouts`,{exact:true})).toBeVisible();
  await expect(event.getByText(`${code} · Races · Heats then final`,{exact:true})).toBeVisible();

  // A code already in the programme is refused on the Add an event screen, which keeps what was typed.
  await press(page.getByRole('button',{name:'Add an event',exact:true}));
  await page.getByLabel('Event code',{exact:true}).fill(code);
  await page.getByLabel('Event name',{exact:true}).fill(name);
  await press(page.getByRole('button',{name:'Boy Scouts',exact:true}));
  await press(page.getByRole('button',{name:'Races',exact:true}));
  await press(page.getByRole('button',{name:'Timed',exact:true}));
  await press(add);
  await expect(page.getByRole('alert')).toHaveText(`Not saved - try again. An event already uses ${code}`);
  await expect(heading(page,'Add an event')).toBeVisible();
  await expect(page.getByLabel('Event code',{exact:true})).toHaveValue(code);
  expect(await lookProblems(page)).toEqual([]);
});

test('a refused Switch off says Not saved in the event\'s sheet, which stays open',async({page},info)=>{
  const code=await ownCode(),name=ownName('Refused sprint');
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/day/events');
  await page.route(`**/api/day/events/${code}/enabled`,route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Event list changed'})}));
  const sheet=page.getByRole('dialog',{name:`${name} · Girl Cubs`,exact:true}),off=sheet.getByRole('button',{name:'Switch off',exact:true});
  await press(row(page,code));await press(off);
  await expect(sheet.getByRole('alert')).toHaveText('Not saved - try again. Event list changed');
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(row(page,code)).not.toContainText('Switched off');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('not-saved.png')});
  // A sheet opened again starts without the refusal.
  await press(sheet.getByLabel('Close',{exact:true}));await press(row(page,code));
  await expect(off).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  // The next save that gets through closes the sheet.
  await page.unroute(`**/api/day/events/${code}/enabled`);
  await press(off);
  await expectToast(page,`${code} switched off`);
  await expect(sheet).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await(await page.request.get('/api/day',{headers:headers()})).json()).events.find((event:{code:string})=>event.code===code).enabled).toBe(false);
});
