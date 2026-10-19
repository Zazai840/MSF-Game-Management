import { checkIn,deleteCurrentRace,enterWristband,expect,live,lookProblems,openRaceScreen,ownEvent,recordFinishingOrder,recordTimes,setHidden,signInThroughApi,takeJob,test,writeCheckIn,type Page } from './fixtures.js';
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
  await expect(orderCard(orderer)).toHaveAccessibleName('Order and Times Order: You · Times: nobody');
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
  await expect(rows(timer.page)).toHaveText([/^Place/,/^1st\s*2072\s*$/,/^2nd\s*$/,/^3rd\s*$/],live);
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
  const project=info.project.name,code=`LS-${project.toUpperCase()}`,name=`Live sprint ${project}`,scoring={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  expect((await request.post('/api/day/events',{headers:scoring,data:{code,name,section:'Girl Cubs',format:'heats'}})).ok()).toBe(true);
  const sam=await openPhone(`Sam live ${project}`),jo=await signInThroughApi(request,`Jo live ${project}`);
  const page=sam.page;
  await page.getByRole('region',{name,exact:true}).getByRole('button',{name:`${name} Girl Cubs · Heat 1`,exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} Girl Cubs`,exact:true})).toBeVisible();
  await expect(page.getByText('Heat 1 · 0 runners',{exact:true})).toBeVisible();
  const checkInCard=page.getByRole('button',{name:/^Check-in Wristbands/}),orderAndTimes=page.getByRole('button',{name:/^Order and Times/});
  await checkInCard.click();await orderAndTimes.click();
  await expect(checkInCard).toHaveAttribute('aria-expanded','true');await expect(orderAndTimes).toHaveAttribute('aria-expanded','true');
  await expect(page.getByText('No runners checked in yet',{exact:true})).toBeVisible();
  let loads=0;page.on('load',()=>loads++);

  const race=await checkIn(request,jo,code,[2041,2042]);
  await expect(page.getByText('Heat 1 · 2 runners',{exact:true})).toBeVisible(live);
  await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText(['2041','2042'],live);
  await recordFinishingOrder(request,jo,race,{order:[2042,2041]});
  const table=page.getByRole('table',{name:'Order and times'});
  await expect(table.getByRole('row')).toHaveText([/^Place\s*Wristband\s*Time$/,/^1st\s*2042\s*$/,/^2nd\s*2041\s*$/],live);
  // One time for two finishers does not count yet, so Heat 1 stays on the screen.
  await recordTimes(request,jo,race,[1234]);
  await expect(table.getByRole('row')).toHaveText([/^Place/,/^1st\s*2042\s*12\.34$/,/^2nd\s*2041\s*$/],live);
  await page.screenshot({path:info.outputPath('race-screen-live.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  // Once Heat 1 counts the event moves on: Heat 2 with empty cards.
  await recordTimes(request,jo,race,[1234,1301],1);
  await expect(page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible(live);
  await expect(page.getByText('No runners checked in yet',{exact:true})).toBeVisible();
  await expect(page.getByText('Places appear here once runners are checked in',{exact:true})).toBeVisible();
  expect(loads).toBe(0);
  await page.getByRole('button',{name:'Back to Home',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
});
