import {ownName,ownWristbands,ownCode,lookProblems,back,backToRaces,becomeLead,leadMenuButton,deleteCurrentRace,join,openLeadMenu,openRace,openRelays,ownEvent,ownRelay,expect,switchJob,test,writeCheckIn,writeTeam,type Page} from './fixtures.js';

// The design system's navy and paper.
const navy='rgb(30, 43, 81)',paper='rgb(240, 231, 211)';

async function joinAs(page:Page,name:string) {await page.goto('/');await join(page,name,{job:'Start line'});await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();}

test('a navy app bar shows MSF Olympics, Running Zone and the signed-in person\'s initials, in self-hosted Nunito and Saira',async({page},info)=>{
  const outside:string[]=[];
  page.on('request',request=>{if(!request.url().startsWith(info.project.use.baseURL||'http://127.0.0.1')) outside.push(request.url());});
  const fonts:string[]=[];
  page.on('response',response=>{if(response.url().endsWith('.woff2')) fonts.push(response.url());});
  await joinAs(page,`${ownName('Abdulaziz')} Zazai`);
  const header=page.getByRole('banner');
  await expect(header).toContainText('MSF Olympics');await expect(header).toContainText('Running Zone');
  expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  const avatar=header.getByRole('button',{name:`${ownName('Abdulaziz')} Zazai: Log out`,exact:true});
  await expect(avatar).toHaveText('AZ');
  expect(await avatar.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(paper);
  expect(await page.locator('.rz-screen').evaluate(element=>getComputedStyle(element).fontFamily)).toMatch(/^Nunito, /);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>[500,600,700,800].every(weight=>document.fonts.check(`${weight} 16px Nunito`,'Running Zone')))).toBe(true);
  expect(await page.evaluate(()=>document.fonts.check('italic 900 16px Saira','Running Zone'))).toBe(true);
  expect(await page.evaluate(()=>[...document.fonts].filter(font=>font.family.replace(/"/g,'')==='Nunito'&&font.status==='loaded').length)).toBeGreaterThan(0);
  expect(fonts.length).toBeGreaterThan(0);
  expect(outside).toEqual([]);
  // The font arrives with the app shell, so a reopened phone needs no outside request.
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached=await page.evaluate(async()=>{const keys=await caches.keys();const cache=await caches.open(keys.find(key=>key.startsWith('msf-shell-'))!);return (await cache.keys()).map(request=>new URL(request.url).pathname);});
  expect(cached.filter(path=>path.endsWith('.woff2')).length).toBeGreaterThan(0);
  expect(cached.filter(path=>path.endsWith('.css')).length).toBeGreaterThan(0);
  await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
});

test('the look check names text in a colour pair the design system has not approved, even one with enough contrast',async({page})=>{
  await page.goto('/');
  const heading=page.getByRole('heading',{level:1});
  expect(await lookProblems(page)).toEqual([]);
  // ink-muted on line reads at 6.2:1 but is not in accessibility.md's table.
  await heading.evaluate(element=>Object.assign((element as HTMLElement).style,{color:'#3b4565',background:'#ddd1b7'}));
  expect(await lookProblems(page)).toEqual([`text h1 "${(await heading.textContent())!.trim().slice(0,40)}" is an unapproved colour pair ink-muted on line`]);
});

test('volunteer and lead screens meet the touch, text size and contrast rules',async({page},info)=>{
  const code=await ownCode(),name=ownName('Look sprint');
  await ownEvent(page.request,code,name);
  await writeCheckIn(page.request,process.env.E2E_OWNER_TOKEN!,code,[2091,2092]);
  await page.goto('/');
  expect(await lookProblems(page)).toEqual([]);
  await join(page,ownName('Look lead'),{job:'Start line'});
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  // Each job's race screen.
  await openRace(page,name);
  const wristband=page.getByLabel('Wristband number',{exact:true});
  await wristband.fill('2093');
  expect(await wristband.evaluate(element=>getComputedStyle(element).fontVariantNumeric)).toBe('tabular-nums');
  expect(await lookProblems(page)).toEqual([]);
  await switchJob(page,'Finish line');
  await expect(page.getByRole('heading',{level:2,name:'Who came 1st?'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await switchJob(page,'Timer');
  await expect(page.getByRole('heading',{level:2,name:'1st place time?'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('timer.png'),fullPage:true});
  // The job sheet, with a faked lead code refusal: the error style without adding to the server's wrong-code backoff.
  await page.getByRole('button',{name:/^Your job: .*\. Change job$/}).click();
  await page.getByRole('radio',{name:/^Zone lead/}).click();
  await page.route('**/api/become-lead',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Wrong lead code - ask a zone lead'})}),{times:1});
  await page.getByLabel('Lead code',{exact:true}).fill('wrong-fixture');
  await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Your job'}).getByRole('alert')).toHaveText('Wrong lead code - ask a zone lead');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-code-error.png'),fullPage:true});
  await page.getByLabel('Lead code',{exact:true}).fill(process.env.E2E_LEAD_CODE!);
  await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
  await expect(page.getByRole('button',{name:'Your job: Zone lead. Change job',exact:true})).toBeVisible();
  // The lead's tabs, Races and Results.
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await backToRaces(page);
  expect(await lookProblems(page)).toEqual([]);
  await openLeadMenu(page,'Results');
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-results.png'),fullPage:true});
  await deleteCurrentRace(page.request,code);
});

test('Day setup, Phones and Events meet the touch, text size and contrast rules',async({page})=>{
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/');await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('button',{name:/^Phones \d+ (person|people) signed in today$/})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:/^Phones /}).click();
  await expect(page.getByRole('article',{name:'E2E Owner',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await back(page,'Day setup');
  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});

test('the Relays tab and a relay\'s teams sheet meet the touch, text size and contrast rules',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Look relay');
  const n=await ownWristbands('Boy Scouts',10);
  await ownRelay(code,name,'Boy Scouts');
  const {page,token}=await openPhone(ownName('Look relay'));
  await writeTeam(request,token,code,[n(1),n(2),n(3),n(4)]);
  await writeTeam(request,token,code,[n(5),n(6),null,null]);
  await openRelays(page);
  const card=page.getByRole('article',{name:`${name} · Boy Scouts`,exact:true});
  await expect(card).toContainText('2 teams ready · no heats yet');
  expect(await lookProblems(page)).toEqual([]);
  await card.getByRole('button',{name:/^Teams 2/}).click();
  await expect(page.getByText('2 teams · 2 still to run. Tap a team still to run to change it.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('teams-sheet.png')});
  await page.getByRole('button',{name:/^Change Team 2:/}).click();
  await expect(page.getByLabel('1st leg',{exact:true})).toHaveValue(String(n(5)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('teams-sheet-edit.png')});
});
test('each race-flow screen on a test build, from Races to every job\'s race and a lead\'s, meets the look rules',async({openPhone,request},info)=>{
  const code=await ownCode(),hurdles=await ownCode(),name=ownName('Look walk'),n=await ownWristbands('Girl Cubs',6);
  await ownEvent(request,code,name);await ownEvent(request,hurdles,ownName('Look hurdles'),'Girl Cubs','heats','hurdles');
  const {page,token}=await openPhone(name);
  const look=async(screen:string)=>{await page.screenshot({path:info.outputPath(`${screen}.png`)});expect.soft(await lookProblems(page),screen).toEqual([]);};
  const chips=page.getByRole('list',{name:'Wristbands entered'}).getByRole('button'),card=page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
  // A test build: its bar sits over every screen, pushing the app bar down.
  await page.route('**/api/health',route=>route.fulfill({json:{ok:true,testBuild:{commit:'abc1234def',reportUrl:'https://example.com/report'}}}));
  expect((await request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}})).ok()).toBe(true);
  await page.reload();
  await expect(page.getByText('Test build · abc1234',{exact:true})).toBeVisible();
  await expect(card).toBeVisible();await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  await look('races-home');
  const avatar=page.getByRole('button',{name:`${name}: Log out`,exact:true});
  await avatar.click();await expect(page.getByRole('menuitem',{name:'Log out',exact:true})).toBeVisible();
  await look('avatar-menu');
  await avatar.click();
  // New race: Races and Hurdles, a section and its next heat chosen.
  await page.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'New race'});
  await sheet.getByRole('button',{name,exact:true}).click();
  await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Heat 2',exact:true})).toBeVisible();
  await look('new-race');
  await sheet.getByRole('button',{name:'Close',exact:true}).click();
  // The start line: one wristband, the 6-runner note, then changing one.
  await openRace(page,name);
  const input=page.getByLabel('Wristband number',{exact:true});
  for(const key of [1,2,3,4,5,6]) {
    await expect(input).toBeEditable();await input.fill(String(n(key)));await input.press('Enter');await expect(chips).toHaveCount(key);
    if(key===1) await look('start-line');
  }
  await expect(page.getByRole('button',{name:'Add another runner',exact:true})).toBeVisible();
  await look('start-line-six');
  await chips.first().click();
  await expect(page.getByRole('button',{name:'Remove',exact:true})).toBeVisible();
  await look('start-line-change');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('contentinfo').getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await look('races-home-saved');
  // The finish line: placing, then checking the order with runners nobody placed.
  await switchJob(page,'Finish line');await openRace(page,name);
  await page.getByRole('button',{name:`${n(1)} came 1st`,exact:true}).click();
  await page.getByRole('button',{name:`${n(2)} came 2nd`,exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:'Who came 3rd?'})).toBeVisible();
  await look('finish-line');
  await page.getByRole('button',{name:'Nobody else crossed the line',exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await look('check-order');
  await backToRaces(page);
  // The Timer.
  await switchJob(page,'Timer');await openRace(page,name);
  await expect(page.getByRole('heading',{level:2,name:'1st place time?'})).toBeVisible();
  await look('timer');
  await backToRaces(page);
  // A lead: the race bar while the race opens, then the race's tabs.
  await becomeLead(page);
  await page.route('**/api/live/races/**',()=>{});
  await card.getByRole('button',{name:/^Heat 1[, ]/}).click();
  await expect(page.getByText('Opening…',{exact:true})).toBeVisible();
  await look('lead-race-opening');
  await page.unroute('**/api/live/races/**');
  await backToRaces(page);
  await openRace(page,name);
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'})).toBeVisible();
  await look('lead-race');
  await backToRaces(page);
  await leadMenuButton(page).click();await expect(page.getByRole('menuitem',{name:'Results',exact:true})).toBeVisible();
  await look('lead-avatar-menu');
  await page.getByRole('menuitem',{name:'Results',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  // The older look's header, with the same menu.
  await leadMenuButton(page).click();await expect(page.getByRole('menuitem',{name:'Day setup',exact:true})).toBeVisible();
  await look('results-avatar-menu');
  await deleteCurrentRace(request,code);
});
