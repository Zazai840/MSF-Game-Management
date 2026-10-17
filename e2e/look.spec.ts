import { lookProblems,timesOpened,trailBack,dashboardMenuButton,openDashboard,goHome,jobButton,dashboardButton,expect,joinDay,test,type Page } from './fixtures.js';

const navy='rgb(27, 42, 81)',red='rgb(172, 48, 54)',ground='rgb(243, 245, 249)';

async function joinAs(page:Page,name:string) {await page.goto('/');await joinDay(page,name);}

test('the Join screen asks for a full name and refuses a full name already in use',async({page,browser},info)=>{
  await page.goto('/');
  await expect(page.getByLabel('Full name')).toHaveAttribute('autocomplete','name');
  await expect(page.getByLabel('First name')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  const join=page.getByRole('button',{name:'Join',exact:true});
  const box=(await join.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(50);expect(box.height).toBeLessThanOrEqual(56);
  expect(await join.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe(ground);
  await page.screenshot({path:info.outputPath('join.png'),fullPage:true});
  const name=`Amina Look ${info.project.name}`;
  await joinDay(page,name);
  await expect(page.getByRole('banner')).toBeVisible();
  const second=await browser.newContext({...info.project.use});
  try {
    const other=await second.newPage();await other.goto('/');await joinDay(other,name.toLowerCase());
    await expect(other.getByRole('alert')).toHaveText(`Someone has joined as ${name} - use your full name so the zone lead can tell you apart`);
    await other.screenshot({path:info.outputPath('join-taken.png'),fullPage:true});
  } finally {await second.close();}
});

test('a navy header shows Running Zone and the joined person, in self-hosted Nunito',async({page},info)=>{
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
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
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
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await jobButton(page,'Start line').click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  const wristband=page.getByLabel('Wristband number',{exact:true});
  await wristband.fill('2091');
  await expect(wristband).toHaveValue('2091');
  expect(await wristband.evaluate(element=>getComputedStyle(element).fontVariantNumeric)).toBe('tabular-nums');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('start-line-entry.png'),fullPage:true});
  await goHome(page);
  await jobButton(page,'Times').click();
  await timesOpened(page);
  expect(await lookProblems(page)).toEqual([]);
  await goHome(page);
  await openDashboard(page);
  expect(await lookProblems(page)).toEqual([]);
  await dashboardMenuButton(page,'Results').click();
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-results.png'),fullPage:true});
  await trailBack(page,'Dashboard');
  await dashboardMenuButton(page,'To check').click();
  await expect(page.getByRole('heading',{level:1,name:/zone lead|Nothing to check/})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});

test('Day setup, Phones and Events meet the touch, text size and contrast rules',async({page})=>{
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_SCORING_TOKEN!);
  await page.goto('/');await openDashboard(page,'Day setup');
  await expect(page.getByRole('button',{name:/^Phones \d+ (person|people) joined today$/})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:/^Phones /}).click();
  await expect(page.getByRole('article',{name:'Phone E2E Scoring',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await trailBack(page,'Day setup');
  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});
