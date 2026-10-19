import { deleteCurrentRace,expect,live,openRaceScreen,ownEvent,setHidden,test,writeCheckIn,type Page } from './fixtures.js';
const checkInCard=(page:Page)=>page.getByRole('button',{name:/^Check-in Wristbands/});
const checkedIn=(page:Page)=>page.getByRole('list',{name:'Checked in'}).getByRole('listitem');
const liveStream=/\/api\/live\/race-screen\//;
/** Waits for this many of the page's race screen stream requests to fail (as a lost signal or a close makes them). */
async function streamFailures(page:Page,count:number) {
  for(let seen=0;seen<count;seen++) await page.waitForEvent('requestfailed',request=>liveStream.test(request.url()));
}

test('signal drop: once back online, phone B shows what phone A checked in while B had no signal',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LD-${project.toUpperCase()}`,name=`Signal drop ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann drop ${project}`),b=await openPhone(`Ben drop ${project}`);
  await writeCheckIn(request,a.token,code,[2101]);
  await openRaceScreen(b.page,name);await checkInCard(b.page).click();
  await expect(checkedIn(b.page)).toHaveText(['2101']);
  // B stays without signal through a few tries to reconnect, long enough that its next try is seconds away.
  const failures=streamFailures(b.page,4);
  await b.context.setOffline(true);
  await writeCheckIn(request,a.token,code,[2101,2102]);
  await failures;
  await b.context.setOffline(false);
  await expect(checkedIn(b.page)).toHaveText(['2101','2102'],live);
  await deleteCurrentRace(request,code);
});

test('app switch: once the app is back in front, phone B shows what phone A checked in while it was in the background',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LA-${project.toUpperCase()}`,name=`App switch ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann switch ${project}`),b=await openPhone(`Ben switch ${project}`);
  await writeCheckIn(request,a.token,code,[2201]);
  await openRaceScreen(b.page,name);await checkInCard(b.page).click();
  await expect(checkedIn(b.page)).toHaveText(['2201']);
  // In the background B's stream closes, so it hears nothing of A's entry.
  const closed=streamFailures(b.page,1);
  await setHidden(b.page,true);
  await closed;
  await writeCheckIn(request,a.token,code,[2201,2202]);
  await setHidden(b.page,false);
  await expect(checkedIn(b.page)).toHaveText(['2201','2202'],live);
  await deleteCurrentRace(request,code);
});

test('silent link: once the watchdog gives up on a stream that went quiet, phone B shows what phone A checked in meanwhile',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LS-${project.toUpperCase()}`,name=`Silent link ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann silent ${project}`),b=await openPhone(`Ben silent ${project}`);
  await b.page.clock.install();
  // B's first stream request is never answered, as on a link that died without telling the phone.
  let asked!:()=>void;const silent=new Promise<void>(resolve=>asked=resolve);
  await b.page.route(liveStream,()=>asked(),{times:1});
  await b.page.getByRole('region',{name,exact:true}).getByRole('button',{name:new RegExp(`^${name} Girl Cubs · `)}).click();
  await silent;
  await expect(b.page.getByText('Opening…',{exact:true})).toBeVisible();
  await writeCheckIn(request,a.token,code,[2301]);
  await b.page.clock.fastForward('00:45');
  await expect(checkInCard(b.page)).toHaveAccessibleName(new RegExp(`Ann silent ${project} is checking in · 1 in$`),live);
  await checkInCard(b.page).click();
  await expect(checkedIn(b.page)).toHaveText(['2301']);
  await deleteCurrentRace(request,code);
});

test('planned end: phone B reconnects at once after the stream ends, and shows what phone A checked in since',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LP-${project.toUpperCase()}`,name=`Planned end ${project}`;
  await ownEvent(request,code,name);
  const a=await openPhone(`Ann end ${project}`),b=await openPhone(`Ben end ${project}`);
  await writeCheckIn(request,a.token,code,[2401]);
  // B's first stream sends the race as it was, then ends cleanly as the server does after about 10 minutes; A checks in another runner in between.
  await b.page.route(liveStream,async route=>{
    const before=await (await request.get(`/api/race-screen/${code}`,{headers:{authorization:`Bearer ${b.token}`}})).json();
    await writeCheckIn(request,a.token,code,[2401,2402]);
    await route.fulfill({status:200,contentType:'text/event-stream',body:`data: ${JSON.stringify(before)}\n\n`});
  },{times:1});
  await openRaceScreen(b.page,name);await checkInCard(b.page).click();
  await expect(checkedIn(b.page)).toHaveText(['2401','2402'],live);
  await deleteCurrentRace(request,code);
});
