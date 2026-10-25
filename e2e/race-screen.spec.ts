import { deleteCurrentRace,enterTime,enterWristband,expect,live,lookProblems,openRaceScreen,ownEvent,readRaceScreen,setHidden,signInThroughApi,submitRace,takeJob,test,writeCheckIn,writeOrder,writeTimes,type Page } from './fixtures.js';
const checkInCard=(page:Page)=>page.getByRole('button',{name:/^Check-in Wristbands/});
const orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
const checkedIn=(page:Page)=>page.getByRole('list',{name:'Checked in'}).getByRole('listitem');

test('opening Check-in Wristbands takes check-in, and another phone sees "Sam is checking in" read-only, live',async({openPhone,request},info)=>{
  const project=info.project.name,code=`HC-${project.toUpperCase()}`,name=`Hold sprint ${project}`;
  await ownEvent(request,code,name);
  const sam=await openPhone(`Sam hold ${project}`),jo=await openPhone(`Jo hold ${project}`);
  await openRaceScreen(sam.page,name);await openRaceScreen(jo.page,name);
  await expect(checkInCard(jo.page)).toHaveAccessibleName(/Nobody yet · open to start$/);
  await checkInCard(sam.page).click();
  await expect(checkInCard(sam.page)).toHaveAccessibleName(/You are checking in · 0 in$/);
  await expect(checkInCard(jo.page)).toHaveAccessibleName(new RegExp(`Sam hold ${project} is checking in · 0 in$`),live);
  await enterWristband(sam.page,2041);await enterWristband(sam.page,2042);
  await expect(checkedIn(sam.page)).toHaveText(['2041','2042']);
  // Jo watches: the list fills in live, with no way to type and no way to take a number off.
  await checkInCard(jo.page).click();
  await expect(checkedIn(jo.page)).toHaveText(['2041','2042'],live);
  await expect(checkInCard(jo.page)).toHaveAccessibleName(new RegExp(`Sam hold ${project} is checking in · 2 in$`));
  await expect(jo.page.getByText('Heat 1 · 2 runners',{exact:true})).toBeVisible();
  await expect(jo.page.getByLabel('Wristband number',{exact:true})).toHaveCount(0);
  await expect(jo.page.getByRole('button',{name:/^Change runner/})).toHaveCount(0);
  await expect(jo.page.getByRole('button',{name:'Take over check-in',exact:true})).toBeVisible();
  await jo.page.screenshot({path:info.outputPath('check-in-read-only.png'),fullPage:true});
  expect(await lookProblems(jo.page)).toEqual([]);
  // Collapsing the card only tidies Sam's screen: Sam keeps check-in.
  await checkInCard(sam.page).click();
  await expect(checkInCard(sam.page)).toHaveAttribute('aria-expanded','false');
  await checkInCard(sam.page).click();
  await sam.page.getByRole('button',{name:'Change runner 2041',exact:true}).click();
  await sam.page.getByRole('button',{name:'Take 2041 off',exact:true}).click();
  await expect(checkedIn(jo.page)).toHaveText(['2042'],live);
  await expect(checkInCard(jo.page)).toHaveAccessibleName(new RegExp(`Sam hold ${project} is checking in · 1 in$`));
  // Fixing a number puts the right one in its place.
  await sam.page.getByRole('button',{name:'Change runner 2042',exact:true}).click();
  await expect(sam.page.getByRole('button',{name:'Take 2042 off',exact:true})).toBeVisible();
  await sam.page.screenshot({path:info.outputPath('check-in-fix.png'),fullPage:true});
  expect(await lookProblems(sam.page)).toEqual([]);
  await enterWristband(sam.page,2045,'Fix 2042: wristband number');
  await expect(checkedIn(jo.page)).toHaveText(['2045'],live);
  await expect(sam.page.getByLabel('Wristband number',{exact:true})).toBeVisible();
  await deleteCurrentRace(request,code);
});

test('Take over confirms in the card, carries on from what was entered, and the old holder\'s next entry is refused',async({openPhone,request},info)=>{
  const project=info.project.name,code=`TO-${project.toUpperCase()}`,name=`Take over sprint ${project}`,jo=`Jo takeover ${project}`,ali=`Ali takeover ${project}`;
  await ownEvent(request,code,name);
  const old=await openPhone(jo),taker=await openPhone(ali);
  await writeCheckIn(request,old.token,code,[2051,2052]);
  await openRaceScreen(old.page,name);await checkInCard(old.page).click();
  await expect(checkInCard(old.page)).toHaveAccessibleName(/You are checking in · 2 in$/);
  await openRaceScreen(taker.page,name);await checkInCard(taker.page).click();
  await expect(checkInCard(taker.page)).toHaveAccessibleName(`Check-in Wristbands ${jo} is checking in · 2 in`);
  // Jo's phone goes to the background, so it misses what happens next.
  await setHidden(old.page,true);
  await taker.page.getByRole('button',{name:'Take over check-in',exact:true}).click();
  await expect(taker.page.getByText(`Take over check-in from ${jo}? ${jo}'s phone shows it read-only from now on. Everything already entered stays.`,{exact:true})).toBeVisible();
  await taker.page.screenshot({path:info.outputPath('take-over-confirm.png'),fullPage:true});
  expect(await lookProblems(taker.page)).toEqual([]);
  await taker.page.getByRole('button',{name:'Take over',exact:true}).click();
  await expect(checkInCard(taker.page)).toHaveAccessibleName(/You are checking in · 2 in$/);
  await enterWristband(taker.page,2053);
  await expect(checkedIn(taker.page)).toHaveText(['2051','2052','2053']);
  // Jo, still showing the old list, types a number: it is refused, and the list is the server's once the phone is back.
  await enterWristband(old.page,2054);
  await expect(old.page.getByText(`${ali} took over check-in`,{exact:true})).toBeVisible();
  await setHidden(old.page,false);
  await expect(checkInCard(old.page)).toHaveAccessibleName(`Check-in Wristbands ${ali} is checking in · 3 in`,live);
  await expect(checkedIn(old.page)).toHaveText(['2051','2052','2053']);
  await expect(old.page.getByLabel('Wristband number',{exact:true})).toHaveCount(0);
  await old.page.screenshot({path:info.outputPath('taken-over.png'),fullPage:true});
  await deleteCurrentRace(request,code);
});

test('with both columns free, opening Order and Times takes nothing and offers Do the order and Do the times, and one person may hold both',async({openPhone,request},info)=>{
  const project=info.project.name,code=`BC-${project.toUpperCase()}`,name=`Both columns sprint ${project}`,priya=`Priya both ${project}`;
  await ownEvent(request,code,name);
  await writeCheckIn(request,await signInThroughApi(request,`Sam both ${project}`),code,[2061,2062]);
  const orderer=(await openPhone(priya)).page,jo=(await openPhone(`Jo both ${project}`)).page;
  await openRaceScreen(orderer,name);await orderCard(orderer).click();
  await expect(orderer.getByRole('button',{name:'Do the order',exact:true})).toBeVisible();
  await expect(orderer.getByRole('button',{name:'Do the times',exact:true})).toBeVisible();
  await expect(orderCard(orderer)).toHaveAccessibleName('Order and Times Nobody yet · open to start');
  await expect(orderer.getByRole('heading',{name:'Who came 1st?',exact:true})).toHaveCount(0);
  await orderer.screenshot({path:info.outputPath('order-both-free.png'),fullPage:true});
  expect(await lookProblems(orderer)).toEqual([]);
  await orderer.getByRole('button',{name:'Do the order',exact:true}).click();
  await expect(orderCard(orderer)).toHaveAccessibleName('Order and Times Order: You · Times: Nobody');
  await expect(orderer.getByRole('heading',{name:'Who came 1st?',exact:true})).toBeVisible();
  // Holding the order still offers the times: one person may hold both.
  await orderer.getByRole('button',{name:'Do the times',exact:true}).click();
  await expect(orderCard(orderer)).toHaveAccessibleName('Order and Times Order: You · Times: You');
  await expect(orderer.getByRole('button',{name:/^Do the /})).toHaveCount(0);
  // With neither column free, Jo watches, with Take over beside each holder.
  await openRaceScreen(jo,name);await orderCard(jo).click();
  await expect(orderCard(jo)).toHaveAccessibleName(`Order and Times Order: ${priya} · Times: ${priya}`);
  await expect(jo.getByRole('button',{name:'Take over the order',exact:true})).toBeVisible();
  await expect(jo.getByRole('button',{name:'Take over the times',exact:true})).toBeVisible();
  await expect(jo.getByRole('heading',{name:'Who came 1st?',exact:true})).toHaveCount(0);
  await jo.screenshot({path:info.outputPath('order-watching.png'),fullPage:true});
  expect(await lookProblems(jo)).toEqual([]);
  await deleteCurrentRace(request,code);
});

test('the order fills in live on another phone, and follows check-in live: a late runner, a fixed number and a runner taken off',async({openPhone,request},info)=>{
  const project=info.project.name,code=`OL-${project.toUpperCase()}`,name=`Order live sprint ${project}`,jo=`Jo order ${project}`;
  await ownEvent(request,code,name);
  const sam=await signInThroughApi(request,`Sam order ${project}`),timer=await openPhone(jo),orderer=(await openPhone(`Priya order ${project}`)).page;
  await writeCheckIn(request,sam,code,[2071,2072,2073]);
  await takeJob(request,timer.token,code,'times');
  // The order is the one free column, so opening the card takes it.
  await openRaceScreen(orderer,name);await orderCard(orderer).click();
  await expect(orderCard(orderer)).toHaveAccessibleName(`Order and Times Order: You · Times: ${jo}`);
  await openRaceScreen(timer.page,name);await orderCard(timer.page).click();
  const rows=(page:Page)=>page.getByRole('table',{name:'Order and times'}).getByRole('row');
  await expect(rows(orderer)).toHaveText([/^Place/,/^1st\s*Next\s*$/,/^2nd\s*$/,/^3rd\s*$/]);
  await orderer.getByRole('button',{name:'2072',exact:true}).click();
  await expect(orderer.getByRole('heading',{name:'Who came 2nd?',exact:true})).toBeVisible();
  // The timer's next time is now 1st place's.
  await expect(rows(timer.page)).toHaveText([/^Place/,/^1st\s*2072\s*Next$/,/^2nd\s*$/,/^3rd\s*$/],live);
  // A late check-in appears in the list to tap, live.
  await writeCheckIn(request,sam,code,[2071,2072,2073,2074]);
  await expect(orderer.getByRole('button',{name:'2074',exact:true})).toBeVisible(live);
  await orderer.getByRole('button',{name:'2071',exact:true}).click();await orderer.getByRole('button',{name:'2073',exact:true}).click();
  await expect(rows(timer.page)).toHaveText([/^Place/,/^1st\s*2072/,/^2nd\s*2071/,/^3rd\s*2073/,/^4th\s*$/],live);
  // A fixed number keeps its place; a runner taken off drops out, and later places move up.
  await writeCheckIn(request,sam,code,[2071,{fix:2072,to:2082},2073,2074]);
  await expect(rows(orderer)).toHaveText([/^Place/,/^1st\s*2082/,/^2nd\s*2071/,/^3rd\s*2073/,/^4th\s*Next/],live);
  await writeCheckIn(request,sam,code,[2073,2082,2074]);
  await expect(rows(orderer)).toHaveText([/^Place/,/^1st\s*2082/,/^2nd\s*2073/,/^3rd\s*Next/],live);
  await expect(rows(timer.page)).toHaveText([/^Place/,/^1st\s*2082/,/^2nd\s*2073/,/^3rd\s*$/],live);
  await orderer.screenshot({path:info.outputPath('order-live.png'),fullPage:true});
  expect(await lookProblems(orderer)).toEqual([]);
  // Nobody else crossed the line: 2074 did not finish, and stays in the race with no place.
  await orderer.getByRole('button',{name:'Nobody else crossed the line',exact:true}).click();
  await expect(orderer.getByRole('heading',{name:'2074 has no place. What happened?',exact:true})).toBeVisible();
  await orderer.getByRole('button',{name:'Did not finish',exact:true}).click();
  await expect(orderer.getByText('Everyone has a place',{exact:true})).toBeVisible();
  await expect(timer.page.getByRole('list',{name:'No place'})).toHaveText(['2074Did not finish'],live);
  await expect(rows(timer.page)).toHaveText([/^Place/,/^1st\s*2082/,/^2nd\s*2073/]);
  await deleteCurrentRace(request,code);
});

test('a phone on the race screen shows the check-in, order and times another phone makes, live and without a reload',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LS-${project.toUpperCase()}`,name=`Live sprint ${project}`,owner={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  expect((await request.post('/api/day/events',{headers:owner,data:{code,name,section:'Girl Cubs',format:'heats',type:'races'}})).ok()).toBe(true);
  const sam=await openPhone(`Sam live ${project}`),jo=await signInThroughApi(request,`Jo live ${project}`);
  // Jo does every job, so Sam only watches.
  for(const job of ['check-in','order','times'] as const) await takeJob(request,jo,code,job);
  const page=sam.page;
  await openRaceScreen(page,name);
  await expect(page.getByText('Heat 1 · 0 runners',{exact:true})).toBeVisible();
  const checkInCard=page.getByRole('button',{name:/^Check-in Wristbands/}),orderAndTimes=page.getByRole('button',{name:/^Order and Times/});
  await checkInCard.click();await orderAndTimes.click();
  await expect(checkInCard).toHaveAttribute('aria-expanded','true');await expect(orderAndTimes).toHaveAttribute('aria-expanded','true');
  await expect(page.getByText('No runners checked in yet',{exact:true})).toBeVisible();
  let loads=0;page.on('load',()=>loads++);

  await writeCheckIn(request,jo,code,[2041,2042]);
  await expect(page.getByText('Heat 1 · 2 runners',{exact:true})).toBeVisible(live);
  await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText(['2041','2042'],live);
  await writeOrder(request,jo,code,[2042,2041]);
  const table=page.getByRole('table',{name:'Order and times'});
  await expect(table.getByRole('row')).toHaveText([/^Place\s*Wristband\s*Time$/,/^1st\s*2042\s*$/,/^2nd\s*2041\s*$/],live);
  // A placed wristband with no time blocks Submit Race, with the reason shown to the watcher too; only Jo, doing the jobs, has Submit Race.
  await writeTimes(request,jo,code,[1234]);
  await expect(table.getByRole('row')).toHaveText([/^Place/,/^1st\s*2042\s*12\.34$/,/^2nd\s*2041\s*$/],live);
  await expect(page.getByText('Place 2 has no time',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('race-screen-live.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  // Once Heat 1 is saved the event moves on: Heat 2 with empty cards.
  await writeTimes(request,jo,code,[1234,1301]);
  await expect(page.getByText('Place 2 has no time',{exact:true})).toHaveCount(0,live);
  await expect(page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  await submitRace(request,jo,code);
  await expect(page.getByText('Heat 1 saved',{exact:true})).toBeVisible(live);
  await expect(page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible();
  await expect(page.getByText('No runners checked in yet',{exact:true})).toBeVisible();
  await expect(page.getByText('Places appear here once runners are checked in',{exact:true})).toBeVisible();
  expect(loads).toBe(0);
  await page.getByRole('button',{name:'Back to Home',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
  // Heat 1 is saved and Heat 2 is not stored yet, so there is nothing to delete.
  await deleteCurrentRace(request,code);
});

/** Three phones worked one heat by API: Sam checked 2091 and 2092 in, Priya placed them, Jo timed them. */
async function workedHeat(request:Parameters<typeof writeCheckIn>[0],code:string,sam:string,priya:string,jo:string) {
  await writeCheckIn(request,sam,code,[2091,2092]);
  await writeOrder(request,priya,code,[2091,2092]);
  await writeTimes(request,jo,code,[1295,1312]);
}
const dockSays=(page:Page,text:string)=>expect(page.getByRole('status').filter({hasText:text})).toHaveText(text,live);

test('Submit Race waits for every holder: once two have pressed, every phone shows "Waiting on Jo", and the results replace the cards',async({openPhone,request},info)=>{
  const project=info.project.name,code=`SW-${project.toUpperCase()}`,name=`Submit sprint ${project}`,jo=`Jo submit ${project}`;
  await ownEvent(request,code,name);
  const sam=await openPhone(`Sam submit ${project}`),priya=await openPhone(`Priya submit ${project}`),timer=await openPhone(jo),ali=await openPhone(`Ali submit ${project}`);
  await writeCheckIn(request,sam.token,code,[2091,2092]);
  await writeOrder(request,priya.token,code,[2091,2092]);
  for(const phone of [sam,priya,timer,ali]) await openRaceScreen(phone.page,name);
  // Blocked: the reason shows under Submit Race until the times are in.
  await expect(sam.page.getByText('Place 1 has no time',{exact:true})).toBeVisible();
  await expect(sam.page.getByRole('button',{name:'Submit Race',exact:true})).toBeDisabled();
  await writeTimes(request,timer.token,code,[1295,1312]);
  await expect(sam.page.getByRole('button',{name:'Submit Race',exact:true})).toBeEnabled(live);
  // Ali holds nothing, so is not asked: no Submit Race on Ali's phone.
  await expect(ali.page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  await sam.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await priya.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await dockSays(sam.page,`You submitted. Waiting on ${jo}`);
  await dockSays(priya.page,`You submitted. Waiting on ${jo}`);
  await dockSays(ali.page,`Waiting on ${jo}`);
  await dockSays(timer.page,'Waiting on you');
  for(const phone of [sam,priya,timer,ali]) {
    await expect(phone.page.getByRole('table',{name:'Results'}).getByRole('row')).toHaveText([/^Place\s*Wristband\s*Time$/,/^1st\s*2091\s*12\.95$/,/^2nd\s*2092\s*13\.12$/],live);
    await expect(phone.page.getByRole('button',{name:/^Check-in Wristbands/})).toBeHidden();
  }
  // Those who pressed keep only Not yet, and so does the watcher, who is not asked; Jo still has Submit Race.
  for(const phone of [sam,ali]) {
    await expect(phone.page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
    await expect(phone.page.getByRole('button',{name:'Not yet',exact:true})).toBeVisible();
  }
  await expect(timer.page.getByRole('button',{name:'Submit Race',exact:true})).toBeVisible();
  await ali.page.screenshot({path:info.outputPath('submitted-watcher.png'),fullPage:true});
  expect(await lookProblems(ali.page)).toEqual([]);
  await sam.page.screenshot({path:info.outputPath('submitted-waiting.png'),fullPage:true});
  expect(await lookProblems(sam.page)).toEqual([]);
  await timer.page.screenshot({path:info.outputPath('submitted-asked.png'),fullPage:true});
  expect(await lookProblems(timer.page)).toEqual([]);
  // Jo's press is the last one asked for, so the heat is saved on every phone.
  await timer.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  for(const phone of [sam,priya,timer,ali]) {
    await expect(phone.page.getByText('Heat 1 saved',{exact:true})).toBeVisible(live);
    await expect(phone.page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible();
  }
  await deleteCurrentRace(request,code);
});

test('Not yet sends the race back for changes and clears every press; only a column\'s holder changes it',async({openPhone,request},info)=>{
  const project=info.project.name,code=`NT-${project.toUpperCase()}`,name=`Not yet sprint ${project}`;
  await ownEvent(request,code,name);
  const sam=await signInThroughApi(request,`Sam not yet ${project}`),priya=await signInThroughApi(request,`Priya not yet ${project}`);
  const timer=await openPhone(`Jo not yet ${project}`),ali=await openPhone(`Ali not yet ${project}`);
  await workedHeat(request,code,sam,priya,timer.token);
  await submitRace(request,sam,code);await submitRace(request,priya,code);
  await openRaceScreen(timer.page,name);await openRaceScreen(ali.page,name);
  await dockSays(timer.page,'Waiting on you');
  // Anyone may tap Not yet: Ali holds nothing.
  await ali.page.getByRole('button',{name:'Not yet',exact:true}).click();
  for(const page of [ali.page,timer.page]) await expect(page.getByRole('button',{name:/^Order and Times/})).toBeVisible(live);
  await expect(timer.page.getByRole('button',{name:'Submit Race',exact:true})).toBeEnabled();
  await expect(ali.page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  expect((await readRaceScreen(request,sam,code)).pressed).toEqual([]);
  // Ali watches the columns, with Take over and no time pad; Jo retypes the 2nd time and Ali sees it.
  await ali.page.getByRole('button',{name:/^Order and Times/}).click();
  await expect(ali.page.getByRole('button',{name:'Take over the times',exact:true})).toBeVisible();
  await expect(ali.page.getByLabel('Place time',{exact:true})).toHaveCount(0);
  await timer.page.getByRole('button',{name:/^Order and Times/}).click();
  await timer.page.getByRole('button',{name:/^2nd place · 13\.12/}).click();
  await enterTime(timer.page,1320);
  await expect(ali.page.getByRole('table',{name:'Order and times'}).getByRole('row')).toHaveText([/^Place/,/^1st\s*2091\s*12\.95$/,/^2nd\s*2092\s*13\.20$/],live);
  await ali.page.screenshot({path:info.outputPath('after-not-yet.png'),fullPage:true});
  expect(await lookProblems(ali.page)).toEqual([]);
  await deleteCurrentRace(request,code);
});

test('a lead\'s Save as lead saves a race stuck waiting on another phone, after a confirm, and the phone it waited on loses its hold',async({openPhone,request},info)=>{
  const project=info.project.name,code=`SA-${project.toUpperCase()}`,name=`Save as lead sprint ${project}`,jo=`Jo stuck ${project}`;
  await ownEvent(request,code,name);
  const sam=await signInThroughApi(request,`Sam stuck ${project}`),timer=await signInThroughApi(request,jo),priya=await openPhone(`Priya stuck ${project}`);
  await workedHeat(request,code,sam,priya.token,timer);
  await submitRace(request,sam,code);await submitRace(request,priya.token,code);
  const alex=await openPhone(`Alex lead ${project}`,{lead:true});
  await openRaceScreen(alex.page,name);await openRaceScreen(priya.page,name);
  await dockSays(alex.page,`Waiting on ${jo}`);
  // Only a lead has Save as lead.
  await dockSays(priya.page,`You submitted. Waiting on ${jo}`);
  await expect(priya.page.getByRole('button',{name:'Save as lead',exact:true})).toHaveCount(0);
  await alex.page.getByRole('button',{name:'Save as lead',exact:true}).click();
  await expect(alex.page.getByText(`${jo} hasn't submitted. Save anyway?`,{exact:true})).toBeVisible();
  await alex.page.screenshot({path:info.outputPath('save-as-lead-confirm.png'),fullPage:true});
  expect(await lookProblems(alex.page)).toEqual([]);
  await alex.page.getByRole('button',{name:'Save anyway',exact:true}).click();
  for(const page of [alex.page,priya.page]) {
    await expect(page.getByText('Heat 1 saved',{exact:true})).toBeVisible(live);
    await expect(page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible();
  }
  // Jo's hold went with the save; Sam and Priya keep theirs on the next heat.
  expect(Object.keys((await readRaceScreen(request,sam,code)).holds).sort()).toEqual(['check-in','order']);
  await deleteCurrentRace(request,code);
});

test('once a heat is saved the same screen shows "Heat 1 saved" and the empty next heat, and the holder carries on checking in',async({openPhone,request},info)=>{
  const project=info.project.name,code=`HN-${project.toUpperCase()}`,name=`Next heat sprint ${project}`;
  await ownEvent(request,code,name);
  const sam=await openPhone(`Sam next heat ${project}`);
  await openRaceScreen(sam.page,name);
  await expect(sam.page.getByText('Nobody is checked in yet',{exact:true})).toBeVisible();
  await sam.page.getByRole('button',{name:/^Check-in Wristbands/}).click();
  await enterWristband(sam.page,2101);
  await expect(sam.page.getByText('2101 has no place yet',{exact:true})).toBeVisible();
  await writeOrder(request,sam.token,code,[2101]);await writeTimes(request,sam.token,code,[1400]);
  // Sam holds every job, so one press saves the heat.
  await sam.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await expect(sam.page.getByText('Heat 1 saved',{exact:true})).toBeVisible();
  await expect(sam.page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible();
  await expect(sam.page.getByRole('button',{name:/^Check-in Wristbands/})).toHaveAccessibleName(/You are checking in · 0 in$/);
  await sam.page.screenshot({path:info.outputPath('heat-saved.png'),fullPage:true});
  expect(await lookProblems(sam.page)).toEqual([]);
  await enterWristband(sam.page,2102);
  await expect(sam.page.getByText('Heat 2 · 1 runner',{exact:true})).toBeVisible();
  await expect(sam.page.getByText('Heat 1 saved',{exact:true})).toHaveCount(0);
  await deleteCurrentRace(request,code);
});

test('a full heat keeps every row of Order and Times one line high at phone width: a runner added at the finish, two-digit places, a wrong 11th time, Did not finish and a long holder name',async({openPhone,request},info)=>{
  const project=info.project.name,code=`RT-${project.toUpperCase()}`,name=`Full table sprint ${project}`;
  await ownEvent(request,code,name);
  await writeCheckIn(request,await signInThroughApi(request,`Sam full table ${project}`),code,[2101,2102,2103,2104,2105,2106,2107,2108,2109,2110,2111,2112]);
  const {page,token}=await openPhone(`Priya full table ${project}`);
  await writeOrder(request,token,code,[2101,3045,2102,2103,2104,2105,2106,2107,2108,2109,2110,2111],{added:[3045],keptWarnings:[3045],didNotFinish:[2112]});
  const timer=`Wilhelmina Cholmondeley-Warner ${project}`;
  // 11th is faster than 10th, and kept: the longest reason a heat shows.
  await writeTimes(request,await signInThroughApi(request,timer),code,[1201,1250,1302,1345,1388,1402,1455,1499,1560,1580,1570],[10]);
  await openRaceScreen(page,name);await orderCard(page).click();
  const table=page.getByRole('table',{name:'Order and times',exact:true});
  await expect(table.getByRole('row')).toHaveCount(13);
  const lines=(element:Element)=>Math.round(element.getBoundingClientRect().height/parseFloat(getComputedStyle(element).lineHeight));
  // The runner added at the finish is marked in one line, so its row is no taller than the rest.
  await expect(table.getByRole('row').nth(2)).toHaveText(/^2nd\s*3045At finish\s*12.50$/);
  expect(await table.locator('tbody small').first().evaluate(lines)).toBe(1);
  expect(new Set(await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>Math.round(row.getBoundingClientRect().height))))).toEqual(new Set([50]));
  // "Faster than 10th place" stays inside the Time cell's padding.
  const reason=table.getByText('Faster than 10th place',{exact:true});
  expect(await reason.evaluate(element=>{const cell=element.closest('td')!;return element.getBoundingClientRect().right<=cell.getBoundingClientRect().right-parseFloat(getComputedStyle(cell).paddingRight);})).toBe(true);
  // Did not finish sits on one line beside Give a place.
  const noPlace=page.getByRole('list',{name:'No place',exact:true});
  await expect(noPlace).toHaveText(['2112Did not finishGive a place']);
  expect(await noPlace.getByText('Did not finish',{exact:true}).evaluate(lines)).toBe(1);
  // A long holder name stays beside its column's label, with Take over below it.
  const timesRow=page.locator('.race-column',{hasText:timer});
  const [label,holder]=await Promise.all([timesRow.getByText('Times',{exact:true}).boundingBox(),timesRow.getByText(timer,{exact:true}).boundingBox()]);
  expect(holder!.y).toBeLessThan(label!.y+label!.height);
  // Notes in the card keep the card's own spacing, with no paragraph margins on top.
  const kept=page.getByText('Kept as typed. A zone lead will check it.',{exact:true});
  expect(await kept.evaluate(element=>getComputedStyle(element).marginTop+' '+getComputedStyle(element).marginBottom)).toBe('0px 0px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('full-table.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  await deleteCurrentRace(request,code);
});
