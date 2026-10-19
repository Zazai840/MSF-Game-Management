import { checkIn,dashboardButton,goHome,jobButton,expect,createProfile,openDashboard,pickRace,test } from './fixtures.js';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('the volunteer app reopens from its shell cache without caching race reads or downloading Lead',async({page,context})=>{
  const scripts:string[]=[];
  page.on('request',request=>{if(request.resourceType()==='script') scripts.push(request.url());});
  await page.goto('/');
  await expect(page.getByLabel('Olympics password',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(scripts.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(false);
  // A real successful race-data read must not become available from the shell cache.
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  const read=await page.evaluate(async headers=>(await fetch('/api/jobs/times',{headers})).ok,headers);
  expect(read).toBe(true);
  await context.setOffline(true);
  const navigation=await page.reload();
  expect(navigation?.fromServiceWorker()).toBe(true);
  await expect(page.getByLabel('Olympics password',{exact:true})).toBeVisible();
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
      await expect(phone.getByLabel('Olympics password',{exact:true})).toHaveCount(0);
    } finally {await context.close();}
  }
});

test('a deployed version reloads the phone by itself and keeps an unfinished Start line entry',async({page},info)=>{
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{}});
  await page.goto('/');
  await createProfile(page,`Update ${info.project.name}`);
  await jobButton(page,'Start line').click();
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  await page.getByLabel('Wristband number',{exact:true}).fill('21');
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  const workerPath=resolve('dist/web/sw.js');
  const previous=await readFile(workerPath,'utf8');
  let loads=0;page.on('load',()=>loads++);
  try {
    // A deploy: a byte-changed worker on the server, and the server's build id on an API response no longer matching the phone's.
    await writeFile(workerPath,`${previous}\n// Deployed revision ${info.project.name}\n`);
    await page.route('**/api/home',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,headers:{...response.headers(),'x-build-id':'a newer build'}});
    },{times:1});
    // Home reads every 5 s, then the new worker installs (the app reloads anyway 10 s after an update that never takes over).
    await expect.poll(()=>loads,{timeout:20000}).toBe(1);
    await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
    await expect(page.getByRole('button',{name:'New version, tap to reload'})).toHaveCount(0);
    // The phone now matches the server: the next Home read does not reload it again.
    await page.waitForResponse('**/api/home');
    await jobButton(page,'Start line').click();
    await expect(page.getByLabel('Wristband number')).toHaveValue('21');
    expect(loads).toBe(1);
  } finally {await writeFile(workerPath,previous);}
});

test('a race screen snapshot from another build reloads the phone by itself',async({openPhone},info)=>{
  const {page}=await openPhone(`Snapshot build ${info.project.name}`);
  let loads=0;page.on('load',()=>loads++);
  await page.route('**/api/live/race-screen/**',route=>route.fulfill({status:200,contentType:'text/event-stream',body:`data: ${JSON.stringify({revision:1,build:'a newer build'})}\n\n`}),{times:1});
  const tile=page.getByRole('button',{name:/^60m Girl Cubs · /});
  await tile.click();
  await expect.poll(()=>loads,{timeout:10000}).toBe(1);
  await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
  await tile.click();
  await expect(page.getByRole('heading',{level:1,name:'60m Girl Cubs',exact:true})).toBeVisible();
  expect(loads).toBe(1);
});

test('a failed load of the Lead area reloads the app instead of leaving a blank screen',async({openPhone},info)=>{
  const {page}=await openPhone(`Lead load ${info.project.name}`,{lead:true});
  let loads=0;page.on('load',()=>loads++);
  // An old page after a deploy: its Lead files are gone from the server. The service worker passes these requests on, so only the context sees them.
  const leadFiles=/\/assets\/Lead-[^/]+\.(js|css)$/;
  await page.context().route(leadFiles,route=>route.abort());
  await dashboardButton(page).click();
  await expect.poll(()=>loads,{timeout:10000}).toBe(1);
  await page.context().unroute(leadFiles);
  await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
  await openDashboard(page);
  expect(loads).toBe(1);
});

test('all three unfinished jobs survive reload and are dropped when the phone is removed',async({page},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const race=await checkIn(page.request,process.env.E2E_SCORING_TOKEN!,'R4',[2401,2402]);
  const raceName=`60m Girl Cubs (R4) · Heat ${race.number}`;
  await page.goto('/');
  await createProfile(page,`Recovery ${info.project.name}`);

  await jobButton(page,'Start line').click();
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  await page.getByLabel('Wristband number',{exact:true}).fill('25');
  await page.reload();
  await jobButton(page,'Start line').click();
  await expect(page.getByLabel('Wristband number')).toHaveValue('25');

  await goHome(page);
  await jobButton(page,'Finish order').click();
  await pickRace(page,'Finishing order',raceName);
  await page.getByRole('button',{name:'2402',exact:true}).click();
  await page.reload();
  await jobButton(page,'Finish order').click();
  await expect(page.getByRole('heading',{name:'Who came 2nd?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'1st: 2402',exact:true})).toBeVisible();

  await goHome(page);
  await jobButton(page,'Times').click();
  await pickRace(page,'Times',raceName);
  await page.getByLabel('Place time').fill('123');
  await page.reload();
  await jobButton(page,'Times').click();
  await expect(page.getByLabel('Place time')).toHaveValue('123');
  await expect(page.getByText('Shows as 1.23',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('restored-times-entry.png'),fullPage:true});

  // Simulate a new Olympics day at the HTTP boundary.
  await page.route('**/api/home',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'A new Olympics day has started. Tap your name to sign in.',reason:'new-day'})}));
  await page.reload();
  // Drafts go; the Olympics password pass and the profile stay on the phone.
  await expect(page.getByRole('heading',{name:"Who's using this phone?"})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')).sort())).toEqual(['msf:new-day','msf:pass','msf:profiles']);
  await page.request.post(`/api/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
