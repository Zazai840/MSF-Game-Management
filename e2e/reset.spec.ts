import {ownName,ownCode,ownEvent,back,expect,expectToast,join,labelDay,leadMenuButton,lookProblems,openLeadMenu,press,test,pullToRefresh,type Page} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
async function asOwner(page:Page) {
  await page.addInitScript(token=>localStorage.setItem('msf:token',token),process.env.E2E_OWNER_TOKEN!);
  await page.goto('/');await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('button',{name:/^Events \d+ events$/})).toBeVisible();
}
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const welcomeBack=(page:Page)=>expect(page.getByRole('heading',{level:1,name:'Someone else? Join'})).toBeVisible({timeout:10000});
// A new day starts with This day's Region and Day empty: label it again for the specs after this one.
test.afterEach(async({request})=>labelDay(request));
/** A row of Day setup, by its first words: it opens that row's screen. */
const row=(page:Page,name:string)=>page.getByRole('main').getByRole('listitem').getByRole('button',{name:new RegExp(`^${name}`)});
const toDaySetup=async(page:Page)=>{await back(page,'Day setup');await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();};
/** From Day setup: downloads the day export on its screen and comes back. */
async function exportDay(page:Page) {
  await press(row(page,'Day export'));
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download day export',exact:true}).click();await downloaded;
  await expect(page.getByRole('region',{name:'Day export'})).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
  await toDaySetup(page);
}
/** From Day setup: opens Start a new day and types NEW DAY. */
async function typeNewDay(page:Page) {
  await press(row(page,'Start a new day'));
  await page.getByLabel('Type NEW DAY to confirm').fill('NEW DAY');
}
test('new day shows fresh codes, retains its owner phone and returns other phones to Join with their races cleared',async({page,browser,baseURL,context},info)=>{
  // Safari15.0–15.3 supports the app, but has no crypto.randomUUID.
  const olderCrypto=()=>Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true});
  await context.addInitScript(olderCrypto);
  const oldHome=await (await page.request.get('/api/home',{headers:headers()})).json();
  const otherContext=await browser.newContext({baseURL});await otherContext.addInitScript(olderCrypto);const other=await otherContext.newPage();
  try {
    await other.goto('/');await join(other,ownName('Reset helper'),{job:'Start line'});await races(other);
    // The helper starts Heat 1 of 60m Boy Beavers.
    await other.getByRole('button',{name:'New race',exact:true}).click();const sheet=other.getByRole('dialog',{name:'New race'});
    await sheet.getByRole('button',{name:'60m',exact:true}).click();await sheet.getByRole('button',{name:'Boy Beavers',exact:true}).click();await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
    await expect(other.getByRole('heading',{level:1,name:'60m · Boy Beavers'})).toBeVisible();
    await asOwner(page);await exportDay(page);
    // A change after the export: Start a new day is refused until the latest changes are in a day export.
    await ownEvent(page.request,await ownCode(),'Reset sprint','Girl Cubs','timed');
    await typeNewDay(page);await press(page.getByRole('button',{name:'Start a new day',exact:true}));
    await expect(page.getByRole('region',{name:'Start a new day'}).getByRole('alert')).toHaveText('Download a day export after the last change before starting a new day');
    expect(await lookProblems(page)).toEqual([]);
    await toDaySetup(page);await exportDay(page);await typeNewDay(page);
    const committed=page.waitForResponse(response=>response.url().endsWith('/api/day/start-new') && response.status()===200);await page.getByRole('button',{name:'Start a new day',exact:true}).click();await committed;
    // The new day opens on Day setup, in the place of the Start a new day screen: no back arrow names that screen.
    await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^Events \d+ events$/})).toBeVisible();
    await expect(page).toHaveURL(/\/day$/);await expect(page.getByRole('button',{name:'Back to Start a new day',exact:true})).toHaveCount(0);
    const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();expect(fresh.olympicsPassword).toBe(process.env.E2E_OLYMPICS_PASSWORD);expect(fresh.leadCode).not.toBe(process.env.E2E_LEAD_CODE);
    await expect(page.getByText(fresh.olympicsPassword,{exact:true})).toBeVisible();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('fresh-day.png')});
    // This day copies nothing across: its row says so in amber, and the day export is refused until a lead sets Region and Day again.
    const thisDay=page.getByRole('region',{name:'This day'}),dayExport=page.getByRole('region',{name:'Day export'});
    await expect(row(page,'This day')).toHaveText('This dayChoose the region and day');await expect(row(page,'This day')).toHaveClass(/rz-listrow--warn/);
    await expect(row(page,'Day export')).not.toHaveClass(/rz-listrow--warn/);
    expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('fresh-day-rows.png')});
    await press(row(page,'Day export'));
    await dayExport.getByRole('button',{name:'Download day export',exact:true}).click();
    await expect(dayExport.getByRole('alert')).toHaveText('Set the Region and Day under This day first');
    expect(await lookProblems(page)).toEqual([]);
    await toDaySetup(page);await press(row(page,'This day'));
    await expect(thisDay.getByRole('button',{pressed:true})).toHaveText([String(new Date().getUTCFullYear())]);
    await press(thisDay.getByRole('group',{name:'Region'}).getByRole('button',{name:'South'}));await expectToast(page,'Region saved · South');
    await press(thisDay.getByRole('group',{name:'Day'}).getByRole('button',{name:'1',exact:true}));await expectToast(page,'Day saved · Day 1');
    await toDaySetup(page);await expect(row(page,'This day')).not.toHaveClass(/rz-listrow--warn/);
    await exportDay(page);
    const home=await (await page.request.get('/api/home',{headers:headers()})).json();expect(home.phone.id).toBe(oldHome.phone.id);expect(home.phone.level).toBe('Lead');expect(home.phone.dayId).not.toBe(oldHome.phone.dayId);
    expect(fresh.olympicsPassword).toBe(process.env.E2E_OLYMPICS_PASSWORD);
    const newDayLine=other.getByText('A new Olympics day has started. Tap your name to sign in.',{exact:true});
    await welcomeBack(other);await expect(newDayLine).toBeVisible();
    expect(await other.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')).sort())).toEqual(['msf:new-day','msf:pass','msf:profiles']);
    await other.reload();await expect(newDayLine).toBeVisible();await other.screenshot({path:info.outputPath('new-day-line.png')});
    // Tapping the name signs in; the job is chosen afresh for the new day, and the old day's race is gone.
    await other.getByRole('button',{name:new RegExp(ownName('^Reset helper'))}).click();
    await expect(other.getByRole('heading',{level:1,name:"What's your job today?"})).toBeVisible();
    await other.getByRole('radio',{name:/^Start line/}).click();
    const empty=other.getByText('No races yet. Tap New race when a race lines up.',{exact:true});
    await races(other);await expect(empty).toBeVisible();
    // The empty line sits 12px under the tabs, as a section heading does.
    const tabsBox=(await other.getByRole('navigation',{name:'Event type'}).boundingBox())!,emptyBox=(await empty.boundingBox())!;
    expect(Math.round(emptyBox.y-(tabsBox.y+tabsBox.height))).toBe(12);
    await other.screenshot({path:info.outputPath('empty-races.png')});
    await other.evaluate(()=>localStorage.removeItem('msf:token'));await other.reload();await welcomeBack(other);await expect(newDayLine).toHaveCount(0);
    await press(row(page,'Start a new day'));await expect(page.getByLabel('Type NEW DAY to confirm')).toBeVisible();await page.screenshot({path:info.outputPath('fresh-day-reset.png')});
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
  await typeNewDay(page);const committed=page.waitForResponse(response=>response.url().endsWith('/api/day/start-new') && response.status()===200);await press(page.getByRole('button',{name:'Start a new day',exact:true}));await committed;
  const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByRole('heading',{level:1,name:/Join/})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_OWNER_TOKEN);
  await pullToRefresh(page);await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();
});
test('a lost reset reply recovers the fresh Day through Home and discards an old binary export response',async({page})=>{
  await asOwner(page);
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/day/export',async route=>{if(!first){await route.continue();return;}first=false;const response=await route.fetch();seen();await held;await route.fulfill({response});delivered();});
  let downloads=0;page.on('download',()=>downloads++);
  await press(row(page,'Day export'));await press(page.getByRole('button',{name:'Download day export',exact:true}));await captured;
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
test('an actual old removed-phone 401 cannot sign out a newly signed-in phone',async({page})=>{
  await page.goto('/');await join(page,ownName('Delayed'),{job:'Start line'});await races(page);
  const oldToken=await page.evaluate(()=>localStorage.getItem('msf:token'));const phone=await (await page.request.get('/api/me',{headers:{authorization:`Bearer ${oldToken}`}})).json();
  // The live streams would tell the old phone it was removed at once; this is about the poll's 401 arriving late, so they are cut.
  for(const stream of ['**/api/live/races']) await page.route(stream,route=>route.request().headers().authorization===`Bearer ${oldToken}`?route.abort():route.continue());
  await page.request.post(`/api/day/phones/${phone.id}/remove`,{headers:headers(),data:{}});
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{if(!first){await route.continue();return;}first=false;const response=await route.fetch();expect(response.status()).toBe(401);seen();await held;await route.fulfill({response});delivered();});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  // Removed means signed out: the next read sends the phone back to Join, which keeps its profile.
  await pullToRefresh(page);
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  await join(page,ownName('Delayed'),{job:'Start line'});await races(page);
  const freshToken=await page.evaluate(()=>localStorage.getItem('msf:token'));expect(freshToken).not.toBe(oldToken);
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await races(page);expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(freshToken);
});
test('a stale successful Join cannot replace a newer signed-in phone in shared browser storage',async({page,context})=>{
  await page.goto('/');let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});
  await page.route('**/api/join',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);seen();await held;await route.fulfill({response});delivered();});
  await join(page,ownName('Old sign-in'),{job:'Start line'});await captured;
  const newer=await context.newPage();await newer.goto('/');await join(newer,ownName('New sign-in'),{job:'Start line'});await races(newer);
  const freshToken=await newer.evaluate(()=>localStorage.getItem('msf:token'));await races(page);
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(freshToken);await expect(page.getByRole('button',{name:`${ownName('New sign-in')}: Log out`,exact:true})).toBeVisible();await newer.close();
});
test('a lost reply from Start new day keeps the retained phone safe from a previously pending 401 until Home recovers',async({page})=>{
  await asOwner(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void,delivered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;}),done=new Promise<void>(resolve=>{delivered=resolve;});let first=true;
  await page.route('**/api/home',async route=>{if(!first){await route.continue();return;}first=false;await route.fetch();seen();await held;await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({message:'Please sign in again'})});delivered();});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await captured;
  await page.route('**/api/day/start-new',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');});
  await typeNewDay(page);await press(page.getByRole('button',{name:'Start a new day',exact:true}));await expect(page.getByRole('alert')).toBeVisible();
  release();await done;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_OWNER_TOKEN);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));const fresh=await (await page.request.get('/api/day',{headers:headers()})).json();await expect(page.getByText(fresh.leadCode,{exact:true})).toBeVisible();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();
});
test('polling started while reset is pending cannot authenticate into the old day and later eject the retained phone',async({page})=>{
  await asOwner(page);await exportDay(page);
  let release!:()=>void,seen!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),captured=new Promise<void>(resolve=>{seen=resolve;});let committed=false,pendingReads=0;
  await page.route('**/api/home',async route=>{if(!committed) pendingReads++;await route.continue();});
  await page.route('**/api/day/start-new',async route=>{seen();await held;const response=await route.fetch();expect(response.ok()).toBe(true);committed=true;await route.fulfill({response});});
  await typeNewDay(page);await press(page.getByRole('button',{name:'Start a new day',exact:true}));await captured;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(pendingReads).toBe(0);
  release();await expect(page.getByText('Not downloaded yet.',{exact:true})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('msf:token'))).toBe(process.env.E2E_OWNER_TOKEN);
  await pullToRefresh(page);await expect(page.getByRole('heading',{level:1,name:/Join/})).toHaveCount(0);
});
