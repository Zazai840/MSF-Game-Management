import { backToRaces,deleteCurrentRace,expect,live,lookProblems,openRace,ownEvent,setHidden,test,writeCheckIn,type APIRequestContext,type Page } from './fixtures.js';
/** The finish line's runner buttons: the runners checked in, live from the start line. */
const runners=(page:Page)=>page.getByRole('list',{name:'Runners not yet placed'}).getByRole('button');
/** On a slow network every "the other phone sees it" check waits this long. */
const slowLive={timeout:3000};
const raceStream=/\/api\/live\/races\/[^/]+$/;
/** Waits for this many of the page's race stream requests to fail (as a lost signal or a close makes them). */
async function streamFailures(page:Page,count:number) {
  for(let seen=0;seen<count;seen++) await page.waitForEvent('requestfailed',request=>raceStream.test(request.url()));
}
/** A new Heat 1 of the event, made by that phone. */
async function newHeat(request:APIRequestContext,token:string,code:string) {
  return (await (await request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}})).json()).race.id as string;
}

test('signal drop: once back online, phone B shows what phone A checked in while B had no signal',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LD-${project.toUpperCase()}`,name=`Signal drop ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann drop ${project}`),b=await openPhone(`Ben drop ${project}`,{job:'finish'});
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

test('app switch: once the app is back in front, phone B shows what phone A checked in while it was in the background',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LA-${project.toUpperCase()}`,name=`App switch ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann switch ${project}`),b=await openPhone(`Ben switch ${project}`,{job:'finish'});
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

test('silent link: once the watchdog gives up on a stream that went quiet, phone B shows what phone A checked in meanwhile',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LQ-${project.toUpperCase()}`,name=`Silent link ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann silent ${project}`),b=await openPhone(`Ben silent ${project}`,{job:'finish'});
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

test('planned end: phone B reconnects at once after the stream ends, and shows what phone A checked in since',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LP-${project.toUpperCase()}`,name=`Planned end ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann end ${project}`),b=await openPhone(`Ben end ${project}`,{job:'finish'});
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

test('slow network: on a 3G-like link each phone sees the other\'s step within 3 s',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LT-${project.toUpperCase()}`,name=`Slow network ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann slow ${project}`),b=await openPhone(`Ben slow ${project}`,{job:'finish'});
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
  await expect(a.page.getByRole('tab',{name:/^Positions/})).toContainText('1 of 2',slowLive);
  await deleteCurrentRace(request,code);
});
