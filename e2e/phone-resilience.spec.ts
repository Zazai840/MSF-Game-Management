import { expect,test } from '@playwright/test';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('the volunteer app reopens from its shell cache without caching race reads or downloading Lead',async({page,context})=>{
  const scripts:string[]=[];
  page.on('request',request=>{if(request.resourceType()==='script') scripts.push(request.url());});
  await page.goto('/');
  await expect(page.getByLabel('Day code or owner password')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(scripts.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(false);
  // A real successful race-data read must not become available from the shell cache.
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  const read=await page.evaluate(async headers=>(await fetch('/api/jobs/times',{headers})).ok,headers);
  expect(read).toBe(true);
  await context.setOffline(true);
  const navigation=await page.reload();
  expect(navigation?.fromServiceWorker()).toBe(true);
  await expect(page.getByLabel('Day code or owner password')).toBeVisible();
  const offlineRead=await page.evaluate(async headers=>{
    try {await fetch('/api/jobs/times',{headers});return 'cached';} catch {return 'unavailable';}
  },headers);
  expect(offlineRead).toBe('unavailable');
  expect(scripts.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(false);
});

test('old phones see the browser message before the application opens',async({browser,baseURL})=>{
  for(const userAgent of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 Version/14.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 8.1.0) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 9) AppleWebKit/537.36 Chrome/79.0.3945.136 Mobile Safari/537.36'
  ]) {
    const context=await browser.newContext({baseURL,userAgent});
    try {
      const phone=await context.newPage();
      await phone.goto('/');
      await expect(phone.getByText("This phone's browser is too old, please use another phone",{exact:true})).toBeVisible();
      await expect(phone.getByLabel('Day code or owner password')).toHaveCount(0);
    } finally {await context.close();}
  }
});

test('a deployed version waits for a tap and preserves an unfinished Start line entry',async({page},info)=>{
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{}});
  await page.goto('/');
  await page.getByLabel('Day code or owner password').fill(process.env.E2E_DAY_CODE!);
  await page.getByLabel('First name').fill(`Update ${info.project.name}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.getByRole('button',{name:/^Start line ·/}).click();
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  await page.getByRole('button',{name:'2',exact:true}).click();
  await page.getByRole('button',{name:'1',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  const workerPath=resolve('dist/web/sw.js');
  const previous=await readFile(workerPath,'utf8');
  let navigations=0;
  page.on('framenavigated',frame=>{if(frame===page.mainFrame()) navigations++;});
  try {
    // A byte-changing deployment exercises the browser's actual worker lifecycle.
    await writeFile(workerPath,`${previous}\n// Deployed revision ${info.project.name}\n`);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    const reload=page.getByRole('button',{name:'New version, tap to reload',exact:true});
    await expect(reload).toBeVisible({timeout:10000});
    await expect(page.getByLabel('Wristband number')).toHaveText('21');
    expect(navigations).toBe(0);
    await page.screenshot({path:info.outputPath('new-version-prompt.png'),fullPage:true});
    await Promise.all([page.waitForEvent('load'),reload.click()]);
    await page.getByRole('button',{name:/^Start line ·/}).click();
    await expect(page.getByLabel('Wristband number')).toHaveText('21');
    expect(navigations).toBe(1);
  } finally {await writeFile(workerPath,previous);}
});

test('all three unfinished jobs survive reload and are dropped when the phone is removed',async({page},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const checked=await page.request.post('/api/races/check-in',{headers,data:{eventCode:'R4',runners:[2401,2402]}});
  expect(checked.ok()).toBe(true);
  const {race}=await checked.json();
  const raceName=`60m Girl Cubs (R4) · Heat ${race.number}`;
  await page.goto('/');
  await page.getByLabel('Day code or owner password').fill(process.env.E2E_DAY_CODE!);
  await page.getByLabel('First name').fill(`Recovery ${info.project.name}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();

  await page.getByRole('button',{name:/^Start line ·/}).click();
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  for(const digit of '25') await page.getByRole('button',{name:digit,exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:/^Start line ·/}).click();
  await expect(page.getByLabel('Wristband number')).toHaveText('25');

  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:/^Finish order ·/}).click();
  await page.getByRole('button',{name:'Other race',exact:true}).click();
  await page.getByRole('button',{name:raceName,exact:true}).click();
  await page.getByRole('button',{name:'2402',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:/^Finish order ·/}).click();
  await expect(page.getByRole('heading',{name:'Who came 2nd?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'1st: 2402',exact:true})).toBeVisible();

  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:/^Times ·/}).click();
  await page.getByRole('button',{name:'Other race',exact:true}).click();
  await page.getByRole('button',{name:raceName,exact:true}).click();
  for(const digit of '123') await page.getByRole('button',{name:digit,exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:/^Times ·/}).click();
  await expect(page.getByLabel('Place time')).toHaveText('1.23');
  await page.screenshot({path:info.outputPath('restored-times-entry.png'),fullPage:true});

  // Simulate the server revoking this joined phone at the HTTP boundary.
  await page.route('**/api/home',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Your phone has been removed - join again'})}));
  await page.reload();
  await expect(page.getByLabel('Day code or owner password')).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual([]);
  await page.request.post(`/api/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
