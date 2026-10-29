import {back,expect,join,leadMenuButton,openLeadMenu,test,type Page} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
async function asOwner(page:Page) {
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/');await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('button',{name:/^Events \d+ events · /})).toBeVisible();
}
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const welcomeBack=(page:Page)=>expect(page.getByRole('heading',{level:1,name:'Someone else? Join'})).toBeVisible({timeout:10000});
async function exportDay(page:Page) {
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download day export',exact:true}).click();await downloaded;
  await expect(page.getByRole('region',{name:'Day export'})).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
}
test('new day shows fresh codes, retains its owner phone and returns other phones to Join with their races cleared',async({page,browser,baseURL,context},info)=>{
  // Safari15.0–15.3 supports the app, but has no crypto.randomUUID.
  const olderCrypto=()=>Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true});
  await context.addInitScript(olderCrypto);
  await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  const oldHome=await (await page.request.get('/api/home',{headers:headers()})).json();
  const otherContext=await browser.newContext({baseURL});await otherContext.addInitScript(olderCrypto);const other=await otherContext.newPage();
  try {
    await other.goto('/');await join(other,`Reset helper ${info.project.name}`,{job:'Start line'});await races(other);
    // The helper starts Heat 1 of 60m Boy Beavers.
    await other.getByRole('button',{name:'New race',exact:true}).click();const sheet=other.getByRole('dialog',{name:'New race'});
    await sheet.getByRole('button',{name:'60m',exact:true}).click();await sheet.getByRole('button',{name:'Boy Beavers',exact:true}).click();await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
    await expect(other.getByRole('heading',{level:1,name:'60m · Boy Beavers'})).toBeVisible();
    await asOwner(page);await exportDay(page);
    await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');const committed=page.waitForResponse(response=>response.url().endsWith('/api/day/start-new') && response.status()===200);await page.getByRole('button',{name:'Start a new day',exact:true}).click();await committed;
    await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^Events \d+ events · not confirmed yet$/})).toBeVisible();
    const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();expect(fresh.olympicsPassword).toBe(process.env.E2E_OLYMPICS_PASSWORD);expect(fresh.leadCode).not.toBe(process.env.E2E_LEAD_CODE);
    await expect(page.getByText(fresh.olympicsPassword,{exact:true})).toBeVisible();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('fresh-day.png')});
    const home=await (await page.request.get('/api/home',{headers:headers()})).json();expect(home.phone.id).toBe(oldHome.phone.id);expect(home.phone.level).toBe('Lead');expect(home.phone.dayId).not.toBe(oldHome.phone.dayId);
    expect(fresh.olympicsPassword).toBe(process.env.E2E_OLYMPICS_PASSWORD);
    const newDayLine=other.getByText('A new Olympics day has started. Tap your name to sign in.',{exact:true});
    await welcomeBack(other);await expect(newDayLine).toBeVisible();
    expect(await other.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')).sort())).toEqual(['msf:new-day','msf:pass','msf:profiles']);
    await other.reload();await expect(newDayLine).toBeVisible();await other.screenshot({path:info.outputPath('new-day-line.png')});
    // Tapping the name signs in; the job is chosen afresh for the new day, and the old day's race is gone.
    await other.getByRole('button',{name:new RegExp(`^Reset helper ${info.project.name}`)}).click();
    await expect(other.getByRole('heading',{level:1,name:"What's your job today?"})).toBeVisible();
    await other.getByRole('radio',{name:/^Start line/}).click();
    await races(other);await expect(other.getByText('No races yet. Tap New race when a race lines up.',{exact:true})).toBeVisible();
    await other.evaluate(()=>localStorage.removeItem('msf:token'));await other.reload();await welcomeBack(other);await expect(newDayLine).toHaveCount(0);
    await page.getByLabel('Type NEW DAY to confirm').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('fresh-day-reset.png')});
    await back(page,'Races');await expect(leadMenuButton(page)).toBeVisible();
  } finally {await otherContext.close().catch(()=>{});}
});
for(const oldResponse of ['success','removed'] as const) test(`a delayed old ${oldResponse} response cannot repaint or eject the retained owner phone after reset`,async({page})=>{
  await asOwner(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{
    if(!first) {await route.continue();return;}first=false;
    const response=await route.fetch();seen();await held;
    if(oldResponse==='success') await route.fulfill({response});
    else await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Please sign in again'})});
    delivered();
  });
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');const committed=page.waitForResponse(response=>response.url().endsWith('/api/day/start-new') && response.status()===200);await page.getByRole('button',{name:'Start a new day',exact:true}).click();await committed;
  const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{level:1,name:/Join/})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_OWNER_TOKEN);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
});
test('a lost reset reply recovers the fresh Day through Home and discards an old binary export response',async({page})=>{
  await asOwner(page);
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
  await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{level:1,name:/Join/})).toHaveCount(0);
});
test('an actual old removed-phone 401 cannot sign out a newly signed-in phone',async({page},info)=>{
  await page.goto('/');await join(page,`Delayed ${info.project.name}`,{job:'Start line'});await races(page);
  const oldToken=await page.evaluate(()=>localStorage.getItem('msf:token'));const phone=await (await page.request.get('/api/me',{headers:{authorization:`Bearer ${oldToken}`}})).json();
  // The live streams would tell the old phone it was removed at once; this is about the poll's 401 arriving late, so they are cut.
  for(const stream of ['**/api/live/races']) await page.route(stream,route=>route.request().headers().authorization===`Bearer ${oldToken}`?route.abort():route.continue());
  await page.request.post(`/api/day/phones/${phone.id}/remove`,{headers:headers(),data:{}});
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{if(!first){await route.continue();return;}first=false;const response=await route.fetch();expect(response.status()).toBe(401);seen();await held;await route.fulfill({response});delivered();});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  // Removed means signed out: the next read sends the phone back to Join, which keeps its profile.
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  await join(page,`Delayed ${info.project.name}`,{job:'Start line'});await races(page);
  const freshToken=await page.evaluate(()=>localStorage.getItem('msf:token'));expect(freshToken).not.toBe(oldToken);
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await races(page);expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(freshToken);
});
test('a stale successful Join cannot replace a newer signed-in phone in shared browser storage',async({page,context},info)=>{
  await page.goto('/');let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});
  await page.route('**/api/join',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);seen();await held;await route.fulfill({response});delivered();});
  await join(page,`Old sign-in ${info.project.name}`,{job:'Start line'});await captured;
  const newer=await context.newPage();await newer.goto('/');await join(newer,`New sign-in ${info.project.name}`,{job:'Start line'});await races(newer);
  const freshToken=await newer.evaluate(()=>localStorage.getItem('msf:token'));await races(page);
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(freshToken);await expect(page.getByRole('button',{name:`New sign-in ${info.project.name}: Log out`,exact:true})).toBeVisible();await newer.close();
});
test('a lost reply from Start new day keeps the retained phone safe from a previously pending 401 until Home recovers',async({page})=>{
  await asOwner(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{if(!first){await route.continue();return;}first=false;await route.fetch();seen();await held;await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Please sign in again'})});delivered();});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  await page.route('**/api/day/start-new',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});
  await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');await page.getByRole('button',{name:'Start a new day',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_OWNER_TOKEN);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();
});
test('polling started while reset is pending cannot authenticate into the old day and later eject the retained phone',async({page})=>{
  await asOwner(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;});let committed=false,pendingReads=0;
  await page.route('**/api/home',async route=>{if(!committed) pendingReads++;await route.continue();});
  await page.route('**/api/day/start-new',async route=>{seen();await held;const response=await route.fetch();expect(response.ok()).toBe(true);committed=true;await route.fulfill({response});});
  await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');await page.getByRole('button',{name:'Start a new day',exact:true}).click();await captured;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(pendingReads).toBe(0);
  release();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_OWNER_TOKEN);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByRole('heading',{level:1,name:/Join/})).toHaveCount(0);
});
