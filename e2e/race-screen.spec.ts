import { checkIn,enterWristband,expect,live,lookProblems,openRaceScreen,ownEvent,recordFinishingOrder,recordTimes,setHidden,signInThroughApi,test,writeCheckIn,type Page } from './fixtures.js';
const checkInCard=(page:Page)=>page.getByRole('button',{name:/^Check-in Wristbands/});
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
  await expect(jo.page.getByRole('button',{name:/^Remove runner/})).toHaveCount(0);
  await expect(jo.page.getByRole('button',{name:'Take over check-in',exact:true})).toBeVisible();
  await jo.page.screenshot({path:info.outputPath('check-in-read-only.png'),fullPage:true});
  expect(await lookProblems(jo.page)).toEqual([]);
  // Collapsing the card only tidies Sam's screen: Sam keeps check-in.
  await checkInCard(sam.page).click();
  await expect(checkInCard(sam.page)).toHaveAttribute('aria-expanded','false');
  await checkInCard(sam.page).click();
  await sam.page.getByRole('button',{name:'Remove runner 2041',exact:true}).click();
  await expect(checkedIn(jo.page)).toHaveText(['2042'],live);
  await expect(checkInCard(jo.page)).toHaveAccessibleName(new RegExp(`Sam hold ${project} is checking in · 1 in$`));
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
