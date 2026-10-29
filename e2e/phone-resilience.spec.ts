import {ownCode,deleteCurrentRace,expect,flowRace,join,leadMenuButton,openLeadMenu,openRace,ownEvent,test,writeCheckIn,writeOrder,writeTimes,type APIRequestContext} from './fixtures.js';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const joinHeading='Join the Running Zone';
/** A new Heat 1 of the event, made through the API as that phone. */
const newHeat=(request:APIRequestContext,token:string,code:string)=>request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}});

test('the volunteer app reopens from its shell cache without caching race reads or downloading Lead',async({page,context})=>{
  const scripts:string[]=[];
  page.on('request',request=>{if(request.resourceType()==='script') scripts.push(request.url());});
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1,name:joinHeading})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  expect(scripts.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(false);
  // A real successful race-data read must not become available from the shell cache.
  const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  const read=await page.evaluate(async headers=>(await fetch('/api/races',{headers})).ok,headers);
  expect(read).toBe(true);
  await context.setOffline(true);
  const navigation=await page.reload();
  expect(navigation?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading',{level:1,name:joinHeading})).toBeVisible();
  const offlineRead=await page.evaluate(async headers=>{
    try {await fetch('/api/races',{headers});return 'cached';} catch {return 'unavailable';}
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
      await expect(phone.getByRole('heading',{level:1,name:joinHeading})).toHaveCount(0);
    } finally {await context.close();}
  }
});

test('a deployed version reloads the phone by itself',async({page},info)=>{
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{}});
  await page.goto('/');
  await join(page,`Update ${info.project.name}`,{job:'Start line'});
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  const workerPath=resolve(process.env.DIST_DIR!,'web/sw.js');
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
    await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
    await expect(page.getByRole('button',{name:'New version, tap to reload'})).toHaveCount(0);
    // The phone now matches the server: the next Home read does not reload it again.
    await page.waitForResponse('**/api/home');
    expect(loads).toBe(1);
  } finally {await writeFile(workerPath,previous);}
});

test('a race snapshot from another build reloads the phone by itself',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Snapshot build ${project}`;
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Snapshot build ${project}`);
  await newHeat(request,token,code);
  let loads=0;page.on('load',()=>loads++);
  await page.route(/\/api\/live\/races\/[^/]+$/,route=>route.fulfill({status:200,contentType:'text/event-stream',body:`data: ${JSON.stringify({revision:1,build:'a newer build'})}\n\n`}),{times:1});
  await page.getByRole('article',{name:`${name} · Girl Cubs`}).getByRole('button',{name:/^Heat 1/}).click();
  await expect.poll(()=>loads,{timeout:10000}).toBe(1);
  // The race has its own address, so the reload opens it again, on this build.
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  expect(loads).toBe(1);
  await deleteCurrentRace(request,code);
});

test('a phone meeting the old and the new server in turn mid-deploy reloads once, then carries on instead of reloading again',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Reload once ${project}`;
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Reload once ${project}`);
  await newHeat(request,token,code);
  const read=(await flowRace(request,token,code))!;
  let loads=0;page.on('load',()=>loads++);
  // A deploy overlap: after reloading onto the new build, the phone's stream reaches the old server again.
  let served=0;
  await page.route(/\/api\/live\/races\/[^/]+$/,route=>{served++;return route.fulfill({status:200,contentType:'text/event-stream',body:`data: ${JSON.stringify({...read,build:'the other build'})}\n\n`});},{times:2});
  await openRace(page,name);
  await expect.poll(()=>loads,{timeout:10000}).toBe(1);
  await expect.poll(()=>served).toBe(2);
  // Give a second reload time to start: it must not.
  await page.waitForTimeout(2000);
  expect(loads).toBe(1);
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await deleteCurrentRace(request,code);
});

test('a failed load of the Lead area reloads the app instead of leaving a blank screen',async({openPhone},info)=>{
  const {page}=await openPhone(`Lead load ${info.project.name}`,{lead:true});
  let loads=0;page.on('load',()=>loads++);
  // An old page after a deploy: its Lead files are gone from the server. The service worker passes these requests on, so only the context sees them.
  const leadFiles=/\/assets\/Lead-[^/]+\.(js|css)$/;
  await page.context().route(leadFiles,route=>route.abort());
  await openLeadMenu(page,'Results');
  await expect.poll(()=>loads,{timeout:10000}).toBe(1);
  await page.context().unroute(leadFiles);
  await expect(leadMenuButton(page)).toBeVisible();
  await openLeadMenu(page,'Results');
  await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  expect(loads).toBe(1);
});

test('a reload shows everything entered from the server, and a half-typed number is not kept on the phone',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Reload sprint ${project}`;
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Reload ${project}`);
  await writeCheckIn(request,token,code,[2401,2402,2403]);await writeOrder(request,token,code,[2402,2401]);await writeTimes(request,token,code,[1234]);
  await openRace(page,name);
  await page.getByLabel('Wristband number',{exact:true}).fill('25');
  await page.reload();
  await expect(page.getByRole('list',{name:'Wristbands entered'}).getByRole('button')).toHaveText(['2401','2402','2403']);
  await expect(page.getByRole('tab',{name:/^Finishing order/})).toContainText('2 of 3');
  await expect(page.getByRole('tab',{name:/^Times/})).toContainText('1 of 3');
  await expect(page.getByLabel('Wristband number',{exact:true})).toHaveValue('');
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:draft:')))).toEqual([]);
  await page.screenshot({path:info.outputPath('reloaded-race.png'),fullPage:true});
  await deleteCurrentRace(request,code);
});
