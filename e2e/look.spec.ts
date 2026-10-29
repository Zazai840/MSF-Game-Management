import {ownWristbands,ownCode,lookProblems,back,backToRaces,deleteCurrentRace,join,markHere,openLeadMenu,openRace,openRaceScreen,openRelays,openTeams,ownEvent,ownRelay,expect,switchJob,test,tickTeam,writeCheckIn,writeTeam,type Page} from './fixtures.js';

// The design system's navy and paper.
const navy='rgb(30, 43, 81)',paper='rgb(240, 231, 211)';

async function joinAs(page:Page,name:string) {await page.goto('/');await join(page,name,{job:'Start line'});await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();}

test('a navy app bar shows MSF Olympics, Running Zone and the signed-in person\'s initials, in self-hosted Nunito and Saira',async({page},info)=>{
  const outside:string[]=[];
  page.on('request',request=>{if(!request.url().startsWith(info.project.use.baseURL||'http://127.0.0.1')) outside.push(request.url());});
  const fonts:string[]=[];
  page.on('response',response=>{if(response.url().endsWith('.woff2')) fonts.push(response.url());});
  await joinAs(page,`Abdulaziz ${info.project.name} Zazai`);
  const header=page.getByRole('banner');
  await expect(header).toContainText('MSF Olympics');await expect(header).toContainText('Running Zone');
  expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  const avatar=header.getByRole('button',{name:`Abdulaziz ${info.project.name} Zazai: Log out`,exact:true});
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

test('volunteer and lead screens meet the touch, text size and contrast rules',async({page},info)=>{
  const code=await ownCode(),name=`Look sprint ${info.project.name}`;
  await ownEvent(page.request,code,name);
  await writeCheckIn(page.request,process.env.E2E_OWNER_TOKEN!,code,[2091,2092]);
  await page.goto('/');
  expect(await lookProblems(page)).toEqual([]);
  await join(page,`Look lead ${info.project.name}`,{job:'Start line'});
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

test('the Teams screen and a relay race screen meet the touch, text size and contrast rules',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Look relay ${project}`;
  const n=await ownWristbands('Boy Scouts',10);
  await ownRelay(code,name,'Boy Scouts');
  const {page,token}=await openPhone(`Look relay ${project}`);
  await writeTeam(request,token,code,[n(1),n(2),n(3),n(4)]);
  await writeTeam(request,token,code,[n(5),n(6),null,null]);
  // The Teams screen: this phone holds the relay, one team open for changing.
  await openTeams(page);
  await page.getByRole('region',{name,exact:true}).getByRole('button',{name:/^Boy Scouts/}).click();
  await expect(page.getByText('Tap a team to change it.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:'Change Team 2',exact:true}).click();
  await expect(page.getByLabel('Team 2 1st leg',{exact:true})).toHaveValue(String(n(5)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('teams-screen.png'),fullPage:true});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  // The relay's race screen: Check-in Teams with both teams ticked, one short of four here, opened.
  for(const number of [1,2]) await tickTeam(request,token,code,number);
  await markHere(request,token,code,2,1);
  await openRelays(page);await openRaceScreen(page,name,'Boy Scouts');
  await page.getByRole('button',{name:/^Check-in Teams/}).click();
  await expect(page.getByText(/A team can run short/)).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-check-in.png'),fullPage:true});
  // Order and Times with this phone holding both: the team buttons, then a team with no place.
  await page.getByRole('button',{name:/^Check-in Teams/}).click();
  await page.getByRole('button',{name:/^Order and Times/}).click();
  await page.getByRole('button',{name:'Do the order',exact:true}).click();
  await page.getByRole('button',{name:'Do the times',exact:true}).click();
  await page.locator('.race-numbers').getByRole('button',{name:/Team 1$/}).click();
  await expect(page.getByLabel('Place time',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-order-and-times.png'),fullPage:true});
  await page.getByRole('button',{name:'Nobody else crossed the line',exact:true}).click();
  await page.getByRole('button',{name:'Did not finish',exact:true}).click();
  const noPlace=page.getByRole('list',{name:'No place'}).getByRole('listitem');
  await expect(noPlace).toHaveText(/^Team 2\s*Did not finish\s*Give a place$/);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-did-not-finish.png'),fullPage:true});
  // Each part of the row stays on one line, even on a 360px phone.
  for(const part of [noPlace.locator('strong'),noPlace.locator('span'),noPlace.getByRole('button')]) expect(await part.evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);return new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size;})).toBe(1);
  await deleteCurrentRace(request,code);
});
