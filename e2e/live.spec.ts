import { deleteCurrentRace,expect,live,openRaceScreen,ownEvent,test,writeCheckIn,type Page } from './fixtures.js';
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
