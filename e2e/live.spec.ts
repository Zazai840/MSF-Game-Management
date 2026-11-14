import {ownName,ownCode,backToRaces,deleteCurrentRace,expect,live,lookProblems,openRace,ownEvent,setHidden,signInThroughApi,test,writeCheckIn,type APIRequestContext,type Page} from './fixtures.js';
import type { RacesRead } from '../src/shared/race-flow.js';
/** The finish line's runner buttons: the runners checked in, live from the start line. */
const runners=(page:Page)=>page.getByRole('list',{name:'Runners not yet placed'}).getByRole('button');
/** On a slow network every "the other phone sees it" check waits this long. */
const slowLive={timeout:3000};
const raceStream=/\/api\/live\/races\/[^/]+$/;
/** Waits for this many of the page's race stream requests to fail (as a lost signal or a close makes them). */
async function streamFailures(page:Page,count:number) {
  for(let seen=0;seen<count;seen++) await page.waitForEvent('requestfailed',request=>raceStream.test(request.url()));
}
/** A new heat of the event (Heat 1 unless named), made by that phone. */
async function newHeat(request:APIRequestContext,token:string,code:string,number=1) {
  return (await (await request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number}})).json()).race.id as string;
}
/** On Races, the chips of the event's card: "H1", "H2", then the empty "Add heat" one. */
const chips=(page:Page,name:string)=>page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true}).getByRole('button',{name:/^(Heat \d|Add heat)/});
const listStream=(url:string)=>url.endsWith('/api/live/races');

test('signal drop: once back online, phone B shows what phone A checked in while B had no signal',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Signal drop');
  await ownEvent(request,code,name);
  const a=await openPhone(ownName('Ann drop')),b=await openPhone(ownName('Ben drop'),{job:'finish'});
  await writeCheckIn(request,a.token,code,[2101]);
  await openRace(b.page,name);
  await expect(runners(b.page)).toHaveText(['2101']);
  // B stays without signal through a few tries to reconnect, long enough that its next try is seconds away.
  const failures=streamFailures(b.page,4);
  await b.context.setOffline(true);
  await writeCheckIn(request,a.token,code,[2101,2102]);
  await failures;
  // B keeps what it last had, with a calm note that it is reconnecting.
  await expect(b.page.getByRole('status').filter({hasText:'Connection lost - trying again'})).toBeVisible();
  await expect(runners(b.page)).toHaveText(['2101']);
  await b.page.screenshot({path:info.outputPath('race-connection-lost.png'),fullPage:true});
  expect(await lookProblems(b.page)).toEqual([]);
  await b.context.setOffline(false);
  await expect(runners(b.page)).toHaveText(['2101','2102'],live);
  await expect(b.page.getByText('Connection lost - trying again',{exact:true})).toHaveCount(0);
  // Races says so too.
  await backToRaces(b.page);
  await expect(b.page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  const listFailure=b.page.waitForEvent('requestfailed',request=>request.url().endsWith('/api/live/races'));
  await b.context.setOffline(true);await listFailure;
  await expect(b.page.getByRole('status').filter({hasText:'Connection lost - trying again'})).toBeVisible();
  await b.page.screenshot({path:info.outputPath('races-connection-lost.png'),fullPage:true});
  expect(await lookProblems(b.page)).toEqual([]);
  await b.context.setOffline(false);
  await expect(b.page.getByText('Connection lost - trying again',{exact:true})).toHaveCount(0,live);
  await deleteCurrentRace(request,code);
});

test('app switch: once the app is back in front, phone B shows what phone A checked in while it was in the background',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('App switch');
  await ownEvent(request,code,name);
  const a=await openPhone(ownName('Ann switch')),b=await openPhone(ownName('Ben switch'),{job:'finish'});
  await writeCheckIn(request,a.token,code,[2201]);
  await openRace(b.page,name);
  await expect(runners(b.page)).toHaveText(['2201']);
  // In the background B's stream closes, so it hears nothing of A's entry.
  const closed=streamFailures(b.page,1);
  await setHidden(b.page,true);
  await closed;
  await writeCheckIn(request,a.token,code,[2201,2202]);
  await setHidden(b.page,false);
  await expect(runners(b.page)).toHaveText(['2201','2202'],live);
  await deleteCurrentRace(request,code);
});

test('silent link: once the watchdog gives up on a stream that went quiet, phone B shows what phone A checked in meanwhile',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Silent link');
  await ownEvent(request,code,name);
  const a=await openPhone(ownName('Ann silent')),b=await openPhone(ownName('Ben silent'),{job:'finish'});
  await newHeat(request,a.token,code);
  await b.page.clock.install();
  // B's first race stream request is never answered, as on a link that died without telling the phone.
  let asked!:()=>void;const silent=new Promise<void>(resolve=>asked=resolve);
  await b.page.route(raceStream,()=>asked(),{times:1});
  await b.page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true}).getByRole('button',{name:/^Heat 1/}).click();
  await silent;
  await expect(b.page.getByText('Opening…',{exact:true})).toBeVisible();
  await writeCheckIn(request,a.token,code,[2301]);
  await b.page.clock.fastForward('00:45');
  await expect(runners(b.page)).toHaveText(['2301'],live);
  await deleteCurrentRace(request,code);
});

test('planned end: phone B reconnects at once after the stream ends, and shows what phone A checked in since',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Planned end');
  await ownEvent(request,code,name);
  const a=await openPhone(ownName('Ann end')),b=await openPhone(ownName('Ben end'),{job:'finish'});
  await writeCheckIn(request,a.token,code,[2401]);
  // B's first stream sends the race as it was, then ends cleanly as the server does after about 10 minutes; A checks in another runner in between.
  await b.page.route(raceStream,async route=>{
    const id=new URL(route.request().url()).pathname.split('/').at(-1);
    const before=await (await request.get(`/api/races/${id}`,{headers:{authorization:`Bearer ${b.token}`}})).json();
    await writeCheckIn(request,a.token,code,[2401,2402]);
    await route.fulfill({status:200,contentType:'text/event-stream',body:`data: ${JSON.stringify(before)}\n\n`});
  },{times:1});
  await openRace(b.page,name);
  await expect(runners(b.page)).toHaveText(['2401','2402'],live);
  await deleteCurrentRace(request,code);
});

test('slow network: on a 3G-like link each phone sees the other\'s step within 3 s',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Slow network');
  await ownEvent(request,code,name);
  const a=await openPhone(ownName('Ann slow')),b=await openPhone(ownName('Ben slow'),{job:'finish'});
  await newHeat(request,a.token,code);
  for(const {page} of [a,b]) {
    const network=await page.context().newCDPSession(page);
    await network.send('Network.enable');
    await network.send('Network.emulateNetworkConditions',{offline:false,latency:300,downloadThroughput:400_000/8,uploadThroughput:400_000/8});
  }
  await openRace(a.page,name);await openRace(b.page,name);
  const input=a.page.getByLabel('Wristband number',{exact:true});
  for(const number of [2501,2502]) {await expect(input).toBeEditable();await input.fill(String(number));await input.press('Enter');}
  await expect(runners(b.page)).toHaveText(['2501','2502'],slowLive);
  // The finish line places one, and the start line's step strip follows the same way.
  await b.page.getByRole('button',{name:'2502 came 1st',exact:true}).click();
  await expect(a.page.getByRole('tab',{name:/^Finishing order/})).toContainText('1 of 2',slowLive);
  await deleteCurrentRace(request,code);
});

test('races list: phone B\'s Races shows each heat phone A makes as it is made, one change after another',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('List live');
  await ownEvent(request,code,name);
  const a=await signInThroughApi(request,ownName('Ann list')),b=await openPhone(ownName('Ben list'),{job:'finish'});
  await newHeat(request,a,code);
  await expect(chips(b.page,name)).toHaveText(['H1',''],live);
  await writeCheckIn(request,a,code,[2601]);
  await expect(b.page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true}).locator('.rz-racecard__status')).toHaveText('Heat 1 needs the finishing order',live);
  await newHeat(request,a,code,2);
  await expect(chips(b.page,name)).toHaveText(['H1','H2',''],live);
  await b.page.screenshot({path:info.outputPath('races-live.png'),fullPage:true});
  expect(await lookProblems(b.page)).toEqual([]);
  await deleteCurrentRace(request,code);
});

test('races list: back in front after changes made while it was in the background, phone B shows the whole list as it is now, and goes on live',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('List switch');
  await ownEvent(request,code,name);
  const a=await signInThroughApi(request,ownName('Ann list switch')),b=await openPhone(ownName('Ben list switch'));
  await newHeat(request,a,code);
  await expect(chips(b.page,name)).toHaveText(['H1',''],live);
  const closed=b.page.waitForEvent('requestfailed',request=>listStream(request.url()));
  await setHidden(b.page,true);
  await closed;
  await newHeat(request,a,code,2);await newHeat(request,a,code,3);
  await setHidden(b.page,false);
  await expect(chips(b.page,name)).toHaveText(['H1','H2','H3',''],live);
  await newHeat(request,a,code,4);
  await expect(chips(b.page,name)).toHaveText(['H1','H2','H3','H4',''],live);
  await deleteCurrentRace(request,code);
});

test('races list: once its cut connection is back, phone B shows the whole list as it is now, and goes on live',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('List cut');
  await ownEvent(request,code,name);
  const a=await signInThroughApi(request,ownName('Ann list cut')),b=await openPhone(ownName('Ben list cut'));
  await newHeat(request,a,code);
  await expect(chips(b.page,name)).toHaveText(['H1',''],live);
  const cut=b.page.waitForEvent('requestfailed',request=>listStream(request.url()));
  await b.context.setOffline(true);
  await cut;
  await newHeat(request,a,code,2);await newHeat(request,a,code,3);
  await b.context.setOffline(false);
  await expect(chips(b.page,name)).toHaveText(['H1','H2','H3',''],live);
  await newHeat(request,a,code,4);
  await expect(chips(b.page,name)).toHaveText(['H1','H2','H3','H4',''],live);
  await deleteCurrentRace(request,code);
});

test('races list: a changes frame the phone cannot apply is never shown; the phone reconnects and shows the whole list',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('List gap');
  await ownEvent(request,code,name);
  const b=await openPhone(ownName('Ben list gap'));
  await newHeat(request,b.token,code);
  await expect(chips(b.page,name)).toHaveText(['H1',''],live);
  // B's next stream sends a whole list far ahead with the event renamed, then a changes frame after one it never got.
  const day=await (await request.get('/api/races',{headers:{authorization:`Bearer ${b.token}`}})).json() as RacesRead,ahead=day.revision+1_000_000;
  const renamed=(to:string)=>day.groups.map(group=>group.event.code===code?{...group,event:{...group.event,name:to}}:group);
  const frames=[{...day,revision:ahead,groups:renamed(`${name} ahead`)},{revision:ahead+2,from:ahead+1,groups:renamed(`${name} wrong`).filter(group=>group.event.code===code)}];
  await b.page.route('**/api/live/races',route=>route.fulfill({status:200,contentType:'text/event-stream',body:frames.map(frame=>`data: ${JSON.stringify(frame)}\n\n`).join('')}),{times:1});
  let streams=0;
  b.page.on('request',request=>{if(listStream(request.url())) streams++;});
  await b.page.reload();
  await expect.poll(()=>streams).toBeGreaterThanOrEqual(2);
  // The reconnect's whole list is taken although it is far behind the list it held.
  await expect(chips(b.page,name)).toHaveText(['H1',''],live);
  for(const wrong of ['ahead','wrong']) await expect(b.page.getByRole('article',{name:`${name} ${wrong} · Girl Cubs`,exact:true})).toHaveCount(0,live);
  await deleteCurrentRace(request,code);
});
