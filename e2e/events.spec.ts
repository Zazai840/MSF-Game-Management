import {ownName,ownCode,ownEvent,openLeadMenu,expect,expectToast,join,lookProblems,press,test,back,type Page} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
const card=(page:Page,code:string,section='Girl Cubs')=>page.getByRole('article',{name:`${code} · ${section}`,exact:true});
const heading=(page:Page,name:string)=>page.getByRole('banner').getByRole('heading',{level:1,name,exact:true});
const docked=(page:Page)=>page.getByRole('contentinfo');

test('a lead opens Events from Day setup, renames an event on its own screen and switches it off and on, each with its toast',async({page},info)=>{
  const code=await ownCode(),name=ownName('Events sprint'),renamed=ownName('Events dash');
  await ownEvent(page.request,code,name,'Girl Cubs','timed','hurdles');
  await page.goto('/');
  await join(page,ownName('Events lead'),{job:'Start line'});
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
  // The Events row names only how many events there are: there is no list to confirm.
  await expect(page.getByRole('button',{name:/^Events \d+ events$/})).toBeVisible();
  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page).toHaveURL(/\/day\/events$/);
  await expect(heading(page,'Events')).toBeVisible();
  await expect(page.getByText(/confirm/i)).toHaveCount(0);

  // A card per event, named as on Races ("60m · Girl Cubs") with its code tag, then Races or Hurdles and its format.
  const event=card(page,code);
  await expect(event.getByText(code,{exact:true})).toBeVisible();
  await expect(event.getByRole('heading',{name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(event.getByText('Hurdles · Timed',{exact:true})).toBeVisible();
  await expect(event).not.toContainText('Switched off');
  await expect(page.getByText(/Updated at \d\d:\d\d:\d\d/)).toBeVisible();
  await event.scrollIntoViewIfNeeded();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('events.png')});

  // Rename opens its own screen with a docked Save, then goes back to Events.
  await press(event.getByRole('button',{name:`Rename ${code}`,exact:true}));
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
  await expect(event.getByRole('heading',{name:`${renamed} · Girl Cubs`,exact:true})).toBeVisible();

  // Switch off and on save at once.
  await press(event.getByRole('button',{name:`Switch off ${code}`,exact:true}));
  await expectToast(page,`${code} switched off`);
  await expect(event.getByText('Hurdles · Timed · Switched off',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('switched-off.png')});
  await press(event.getByRole('button',{name:`Switch on ${code}`,exact:true}));
  await expectToast(page,`${code} switched on`);
  await expect(event).not.toContainText('Switched off');
  // A reload stays on Events.
  await page.reload();await expect(heading(page,'Events')).toBeVisible();
  await back(page,'Day setup');
  await expect(heading(page,'Day setup')).toBeVisible();
});

test('a lead adds an event on its own screen: the docked Add event says what is missing, then the new event has its card',async({page},info)=>{
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
  const event=card(page,code,'Boy Scouts');
  await expect(event.getByRole('heading',{name:`${name} · Boy Scouts`,exact:true})).toBeVisible();
  await expect(event.getByText('Races · Heats then final',{exact:true})).toBeVisible();

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

test('a refused Switch off shows Not saved on that event\'s own card only',async({page},info)=>{
  const code=await ownCode(),other=await ownCode();
  await ownEvent(page.request,code,ownName('Refused sprint'),'Girl Cubs','timed');
  await ownEvent(page.request,other,ownName('Other sprint'),'Girl Cubs','timed');
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/day/events');
  await page.route(`**/api/day/events/${code}/enabled`,route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Event list changed'})}));
  await press(card(page,code).getByRole('button',{name:`Switch off ${code}`,exact:true}));
  await expect(card(page,code).getByRole('alert')).toHaveText('Not saved - try again. Event list changed');
  await expect(card(page,other).getByRole('alert')).toHaveCount(0);
  await expect(card(page,code)).not.toContainText('Switched off');
  await card(page,code).scrollIntoViewIfNeeded();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('not-saved.png')});
  // The next save that gets through clears it.
  await page.unroute(`**/api/day/events/${code}/enabled`);
  await press(card(page,code).getByRole('button',{name:`Switch off ${code}`,exact:true}));
  await expectToast(page,`${code} switched off`);
  await expect(card(page,code).getByRole('alert')).toHaveCount(0);
  expect((await(await page.request.get('/api/day',{headers:headers()})).json()).events.find((event:{code:string})=>event.code===code).enabled).toBe(false);
});
