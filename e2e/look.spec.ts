import { lookProblems,back,dashboardMenuButton,deleteCurrentRace,enterWristband,openDashboard,openRaceScreen,ownEvent,goHome,dashboardButton,expect,createProfile,test,type Page } from './fixtures.js';

const navy='rgb(27, 42, 81)',red='rgb(172, 48, 54)';

async function joinAs(page:Page,name:string) {await page.goto('/');await createProfile(page,name);}

test('a navy header shows Running Zone and the signed-in person, in self-hosted Nunito',async({page},info)=>{
  const outside:string[]=[];
  page.on('request',request=>{if(!request.url().startsWith(info.project.use.baseURL||'http://127.0.0.1')) outside.push(request.url());});
  const fonts:string[]=[];
  page.on('response',response=>{if(response.url().endsWith('.woff2')) fonts.push(response.url());});
  await joinAs(page,`Abdulaziz ${info.project.name} Zazai`);
  const header=page.getByRole('banner');
  await expect(header.getByText('Running Zone',{exact:true})).toBeVisible();
  await expect(header.getByText(`Abdulaziz ${info.project.name} Zazai`,{exact:true})).toBeVisible();
  expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  const avatar=header.locator('[aria-hidden=true]',{hasText:/^AZ$/});
  await expect(avatar).toBeVisible();
  expect(await avatar.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(red);
  expect(await page.evaluate(()=>getComputedStyle(document.body).fontFamily)).toMatch(/^Nunito, system-ui/);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>[500,600,700,800].every(weight=>document.fonts.check(`${weight} 16px Nunito`,'Running Zone')))).toBe(true);
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
  const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},code=`LK-${info.project.name.toUpperCase()}`,name=`Look sprint ${info.project.name}`;
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await ownEvent(page.request,code,name);
  await joinAs(page,`Look lead ${info.project.name}`);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
  expect(await lookProblems(page)).toEqual([]);
  // A faked refusal shows the error style without adding to the server's wrong-code backoff.
  await page.route('**/api/become-lead',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Wrong lead code - ask a zone lead'})}),{times:1});
  await page.getByLabel('Lead code or owner password').fill('wrong-fixture');
  await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong lead code - ask a zone lead');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('become-lead-error.png'),fullPage:true});
  await page.getByLabel('Lead code or owner password').fill(process.env.E2E_LEAD_CODE!);
  await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
  await expect(dashboardButton(page)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  // The race screen: check-in with its number pad, the order and times with this phone holding both, and the dock.
  await openRaceScreen(page,name);
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:/^Check-in Wristbands/}).click();
  await enterWristband(page,2091);
  const wristband=page.getByLabel('Wristband number',{exact:true});
  await wristband.fill('2092');
  await expect(wristband).toHaveValue('2092');
  expect(await wristband.evaluate(element=>getComputedStyle(element).fontVariantNumeric)).toBe('tabular-nums');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('check-in-entry.png'),fullPage:true});
  await page.getByRole('button',{name:/^Order and Times/}).click();
  await page.getByRole('button',{name:'Do the order',exact:true}).click();
  await page.getByRole('button',{name:'Do the times',exact:true}).click();
  await page.getByRole('button',{name:'2091',exact:true}).click();
  await expect(page.getByLabel('Place time',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('order-and-times.png'),fullPage:true});
  await deleteCurrentRace(page.request,code);
  await goHome(page);
  await openDashboard(page);
  expect(await lookProblems(page)).toEqual([]);
  await dashboardMenuButton(page,'Results').click();
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-results.png'),fullPage:true});
  await back(page,'Dashboard');
  await expect(page.getByRole('heading',{level:2,name:/zone lead|Nothing to check/})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});

test('Day setup, Phones and Events meet the touch, text size and contrast rules',async({page})=>{
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/');await openDashboard(page,'Day setup');
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
