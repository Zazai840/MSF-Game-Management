import { trailBack,openDashboard,dashboardMenuButton,enterWristband,jobButton,dashboardButton,expect,createProfile,test,type Page } from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
async function scoring(page:Page) {
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_SCORING_TOKEN!);
  await page.goto('/');await openDashboard(page,'Day setup');
  await expect(page.getByRole('button',{name:/^Events \d+ events · /})).toBeVisible();
}
async function exportDay(page:Page) {
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download day export',exact:true}).click();await downloaded;
  await expect(page.getByRole('region',{name:'Day export'})).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
}
test('new day shows fresh codes, retains its scoring phone and returns other phones to their profiles with cleared drafts',async({page,browser,baseURL,context},info)=>{
  // Safari15.0–15.3 supports the app, but has no crypto.randomUUID.
  const olderCrypto=()=>Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true});
  await context.addInitScript(olderCrypto);
  await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  const oldHome=await (await page.request.get('/api/home',{headers:headers()})).json();
  const otherContext=await browser.newContext({baseURL});await otherContext.addInitScript(olderCrypto);const other=await otherContext.newPage();
  try {
    await other.goto('/');await createProfile(other,`Reset helper ${info.project.name}`);
    await jobButton(other,'Start line').click();await other.getByRole('button',{name:'60m',exact:true}).click();await other.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();await other.getByLabel('Wristband number',{exact:true}).fill('21');await expect(other.getByLabel('Wristband number')).toHaveValue('21');
    await scoring(page);await exportDay(page);
    await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');const committed=page.waitForResponse(response=>response.url().endsWith('/api/day/start-new') && response.status()===200);await page.getByRole('button',{name:'Start a new day',exact:true}).click();await committed;
    await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^Events \d+ events · not confirmed yet$/})).toBeVisible();
    const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();expect(fresh.olympicsPassword).toBe(process.env.E2E_OLYMPICS_PASSWORD);expect(fresh.leadCode).not.toBe(process.env.E2E_LEAD_CODE);
    await expect(page.getByText(fresh.olympicsPassword,{exact:true})).toBeVisible();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('fresh-day.png')});
    const home=await (await page.request.get('/api/home',{headers:headers()})).json();expect(home.phone.id).toBe(oldHome.phone.id);expect(home.phone.level).toBe('Scoring team');expect(home.phone.dayId).not.toBe(oldHome.phone.dayId);
    expect(fresh.olympicsPassword).toBe(process.env.E2E_OLYMPICS_PASSWORD);
    const newDayLine=other.getByText('A new Olympics day has started. Tap your name to sign in.',{exact:true});
    await expect(other.getByRole('heading',{name:"Who's using this phone?"})).toBeVisible({timeout:10000});await expect(newDayLine).toBeVisible();
    expect(await other.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')).sort())).toEqual(['msf:new-day','msf:pass','msf:profiles']);
    await other.reload();await expect(newDayLine).toBeVisible();await other.screenshot({path:info.outputPath('new-day-line.png')});
    await other.getByRole('button',{name:`Reset helper ${info.project.name}`,exact:true}).click();await jobButton(other,'Start line').click();await expect(other.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();await expect(other.getByText('Ask the scoring team to confirm the event list',{exact:true})).toBeVisible();
    await other.getByRole('button',{name:'Home',exact:true}).click();await other.evaluate(()=>localStorage.removeItem('msf:token'));await other.reload();await expect(other.getByRole('heading',{name:"Who's using this phone?"})).toBeVisible();await expect(newDayLine).toHaveCount(0);
    await page.getByLabel('Type NEW DAY to confirm').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('fresh-day-reset.png')});
    await trailBack(page,'Home');await dashboardButton(page).click();await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();await expect(dashboardMenuButton(page,'Day setup')).toBeVisible();
  } finally {await otherContext.close().catch(()=>{});}
});
for(const oldResponse of ['success','removed'] as const) test(`a delayed old ${oldResponse} response cannot repaint or eject the retained scoring phone after reset`,async({page})=>{
  await scoring(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{
    if(!first) {await route.continue();return;}first=false;
    const response=await route.fetch();seen();await held;
    if(oldResponse==='success') await route.fulfill({response});
    else await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Please join the Olympics day'})});
    delivered();
  });
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');const committed=page.waitForResponse(response=>response.url().endsWith('/api/day/start-new') && response.status()===200);await page.getByRole('button',{name:'Start a new day',exact:true}).click();await committed;
  const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:"Who's using this phone?"})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_SCORING_TOKEN);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
});
test('a lost reset reply recovers the fresh Day through Home and discards an old binary export response',async({page})=>{
  await scoring(page);
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/day/export',async route=>{if(!first){await route.continue();return;}first=false;const response=await route.fetch();seen();await held;await route.fulfill({response});delivered();});
  let downloads=0;page.on('download',()=>downloads++);
  await page.getByRole('button',{name:'Download day export',exact:true}).click();await captured;
  // The server committed this reset. Its response never reaches the browser's
  // caller; the next ordinary Home read must discover the changed day identity.
  await page.route('**/api/day/start-new',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});
  const lost=await page.evaluate(async()=>{try{await fetch('/api/day/start-new',{method:'POST',headers:{authorization:`Bearer ${localStorage.getItem('msf:token')}`,'content-type':'application/json'},body:JSON.stringify({confirmation:'NEW DAY'})});return false;}catch{return true;}});expect(lost).toBe(true);
  const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(downloads).toBe(0);
  expect((await page.request.post('/api/day/start-new',{headers:headers(),data:{confirmation:'NEW DAY'}})).status()).toBe(409);
  await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:"Who's using this phone?"})).toHaveCount(0);
});
test('an actual old removed-phone 401 cannot sign out a newly rejoined phone',async({page},info)=>{
  await page.goto('/');await createProfile(page,`Delayed ${info.project.name}`);await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  const oldToken=await page.evaluate(()=>localStorage.getItem('msf:token'));const phone=await (await page.request.get('/api/me',{headers:{authorization:`Bearer ${oldToken}`}})).json();
  await page.request.post(`/api/day/phones/${phone.id}/remove`,{headers:headers(),data:{}});
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{if(!first){await route.continue();return;}first=false;const response=await route.fetch();expect(response.status()).toBe(401);seen();await held;await route.fulfill({response});delivered();});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  await jobButton(page,'Times').click();await expect(page.getByRole('heading',{name:"Who's using this phone?"})).toBeVisible();
  await page.getByRole('button',{name:`Delayed ${info.project.name}`,exact:true}).click();await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  const freshToken=await page.evaluate(()=>localStorage.getItem('msf:token'));expect(freshToken).not.toBe(oldToken);
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(freshToken);
});
test('a stale successful Create profile cannot replace a newer signed-in phone in shared browser storage',async({page,context},info)=>{
  await page.goto('/');let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});
  await page.route('**/api/profiles',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);seen();await held;await route.fulfill({response});delivered();});
  await createProfile(page,`Old sign-in ${info.project.name}`);await captured;
  const newer=await context.newPage();await newer.goto('/');await createProfile(newer,`New sign-in ${info.project.name}`);await expect(newer.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  const freshToken=await newer.evaluate(()=>localStorage.getItem('msf:token'));await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(freshToken);await expect(page.getByText(`New sign-in ${info.project.name}`,{exact:true})).toBeVisible();await newer.close();
});
test('an old successful job save cannot restore an old draft after Home discovers a reset',async({page})=>{
  await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});await scoring(page);await page.getByRole('button',{name:'Home',exact:true}).click();await jobButton(page,'Start line').click();await page.getByRole('button',{name:'60m',exact:true}).click();await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  await enterWristband(page,2001);await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});
  await page.route('**/api/races/check-in',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);seen();await held;await route.fulfill({response});delivered();});
  await page.getByRole('button',{name:'Save',exact:true}).click();await captured;
  await page.request.post('/api/day/export',{headers:headers(),data:{}});expect((await page.request.post('/api/day/start-new',{headers:headers(),data:{confirmation:'NEW DAY'}})).ok()).toBe(true);
  const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:draft:')))).toEqual([]);await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Home',exact:true}).click();await jobButton(page,'Start line').click();await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
});
test('a lost reply from Start new day keeps the retained phone safe from a previously pending 401 until Home recovers',async({page})=>{
  await scoring(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{if(!first){await route.continue();return;}first=false;await route.fetch();seen();await held;await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Please join the Olympics day'})});delivered();});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  await page.route('**/api/day/start-new',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});
  await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');await page.getByRole('button',{name:'Start a new day',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_SCORING_TOKEN);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();
});
test('polling started while reset is pending cannot authenticate into the old day and later eject the retained phone',async({page})=>{
  await scoring(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;});let committed=false,pendingReads=0;
  await page.route('**/api/home',async route=>{if(!committed) pendingReads++;await route.continue();});
  await page.route('**/api/day/start-new',async route=>{seen();await held;const response=await route.fetch();expect(response.ok()).toBe(true);committed=true;await route.fulfill({response});});
  await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');await page.getByRole('button',{name:'Start a new day',exact:true}).click();await captured;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(pendingReads).toBe(0);
  release();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_SCORING_TOKEN);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByRole('heading',{name:"Who's using this phone?"})).toHaveCount(0);
});
