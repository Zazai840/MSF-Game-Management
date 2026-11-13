import {expect,flowPost,flowRace,jobBand,lookProblems,openLeadMenu,openRace,ownCode,ownEvent,ownName,ownRelay,ownWristbands,press,pullToRefresh,recordRace,resultsCard,startDrag,switchJob,test,writeCheckIn,writeTeam,type Locator,type Page} from './fixtures.js';

test('pulling down from the top of a screen with the Updated at line refreshes it: the pull says when to let go, and a short pull or an open sheet does nothing',async({openPhone},info)=>{
  test.skip(!info.project.use.hasTouch,'a pull is a touch gesture');
  const {page}=await openPhone(ownName('Pull refresh'));
  await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  let reads=0;
  await page.route('**/api/live/races',route=>{if(route.request().method()==='GET') reads++;return route.continue();});
  const touch=await page.context().newCDPSession(page),x=180;
  const send=(type:'touchStart'|'touchMove'|'touchEnd',y?:number)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:y===undefined?[]:[{x,y}]});
  const pull=async(by:number)=>{await send('touchStart',200);for(let y=200;y<=200+by;y+=20) await send('touchMove',y);};
  const hint=page.locator('.rz-pull');
  // A short pull: the hint comes down with the finger and goes back, and nothing is read.
  await pull(60);
  await expect(hint).toHaveText('Pull down to refresh');
  await send('touchEnd');
  await expect(hint).toBeHidden();
  expect(reads).toBe(0);
  // A long pull: it says to let go, and letting go starts Races' live stream again.
  await pull(320);
  await expect(hint).toHaveText('Let go to refresh');
  await page.screenshot({path:info.outputPath('pull-ready.png')});
  await send('touchEnd');
  await expect(hint).toHaveText('Refreshing…');
  await expect.poll(()=>reads).toBe(1);
  await expect(hint).toBeHidden();
  // With a sheet open the pull belongs to the sheet.
  await page.getByRole('button',{name:/New race/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await pull(320);await send('touchEnd');
  await expect(hint).toBeHidden();
  expect(reads).toBe(1);
});

test('no screen has a Refresh button: the Updated at line is one centred line that is announced, and a pull down reads the screen again',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('No button'),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1100,1200]);
  const {page}=await openPhone(ownName('No button lead'),{lead:true});
  /** On one screen: the line with no button, in its polite live region, and a pull that reads `path` again. */
  const screen=async(words:string,path:RegExp)=>{
    const line=page.locator('.rz-refresh');
    await expect(line,words).toHaveText(/^Updated at \d\d:\d\d:\d\d$/);
    await expect(line,words).toHaveAttribute('aria-live','polite');
    await expect(page.getByRole('button',{name:/Refresh/}),words).toHaveCount(0);
    expect(await lookProblems(page),words).toEqual([]);
    const read=page.waitForResponse(response=>response.request().method()==='GET' && path.test(new URL(response.url()).pathname));
    await pullToRefresh(page);
    expect((await read).ok(),words).toBe(true);
    await expect(line,words).toHaveText(/^Updated at \d\d:\d\d:\d\d$/);
  };
  await screen('Races',/\/api\/live\/races$/);
  await openRace(page,name);
  await screen('a race page',/\/api\/lead\/races\/[^/]+$/);
  await openLeadMenu(page,'Results');
  await screen('Results',/\/api\/lead\/results$/);
  await page.screenshot({path:info.outputPath('results-no-button.png')});
  await press(resultsCard(page,code));
  await screen('an event',new RegExp(`/api/lead/events/${code}/results$`));
  await openLeadMenu(page,'Day setup');
  await screen('Day setup',/\/api\/day$/);
  await press(page.getByRole('button',{name:/^Signed in today /}));
  await screen('the signed-in list',/\/api\/day\/phones$/);
});

/** A finger put down at a point and moved down the screen by `by`, still on the glass. The answer lifts it. */
async function fingerDown(page:Page,by:number,{x,y}={x:180,y:200}) {
  const touch=await page.context().newCDPSession(page);
  const send=(type:'touchStart'|'touchMove'|'touchEnd',at?:number)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:at===undefined?[]:[{x,y:at}]});
  await send('touchStart',y);for(let at=y+20;at<=y+by;at+=20) await send('touchMove',at);
  return async()=>{await send('touchEnd');await touch.detach();};
}
/** Counts how many times the page has started the race's live stream. */
function streamStarts(page:Page,raceId:string) {
  const count={starts:0};
  page.on('request',request=>{if(new URL(request.url()).pathname===`/api/live/races/${raceId}`) count.starts++;});
  return count;
}
const middle=async(target:Locator)=>{const box=(await target.boundingBox())!;return {x:box.x+box.width/2,y:box.y+box.height/2};};

test('pull down to refresh on each step of a race: the live stream starts again and the typed wristband number, the changed finishing order and the typed time stay; a pull from an input or a drag handle, with a sheet open or below the top does nothing',async({openPhone,request},info)=>{
  // Three steps on one phone, with eleven pulls.
  test.setTimeout(60000);
  const code=await ownCode(),name=ownName('Pull race'),w=await ownWristbands('Girl Cubs',3);
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(ownName('Pull steps'));
  const {race}=await flowRace(request,token,code),stream=streamStarts(page,race.id),hint=page.locator('.rz-pull');
  await page.goto(`/races/${race.id}`);
  // Check-in: a number typed and not yet entered.
  const number=page.getByLabel('Wristband number',{exact:true});
  await number.fill(String(w(1)));
  await expect.poll(()=>stream.starts).toBe(1);
  // While the box is typed in the keyboard is open, and a pull does nothing.
  await expect(number).toBeFocused();
  let lift=await fingerDown(page,320);
  await expect(hint).toBeHidden();
  await lift();
  // The keyboard closed. A short pull: the hint comes down with the finger and goes back, and the stream stays.
  await number.blur();
  lift=await fingerDown(page,60);
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText('Pull down to refresh');
  await lift();
  await expect(hint).toBeHidden();
  // A long pull: it says to let go, and letting go starts the stream again.
  lift=await fingerDown(page,320);
  await expect(hint).toHaveText('Let go to refresh');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('check-in-pull-ready.png')});
  await lift();
  await expect(hint).toHaveText('Refreshing…');
  await expect.poll(()=>stream.starts).toBe(2);
  await expect(hint).toBeHidden();
  await expect(number).toHaveValue(String(w(1)));
  expect(await lookProblems(page)).toEqual([]);
  // A finger that starts on the number box types; it does not pull.
  await expect(number).not.toBeFocused();
  lift=await fingerDown(page,320,await middle(number));
  await expect(hint).toBeHidden();
  await lift();
  // With a sheet open the pull belongs to the sheet.
  await writeCheckIn(request,token,code,[w(1),w(2),w(3)]);
  await press(jobBand(page));
  await expect(page.getByRole('dialog')).toBeVisible();
  lift=await fingerDown(page,320);
  await expect(hint).toBeHidden();
  await lift();
  expect(stream.starts).toBe(2);
  // Finishing order: a drag down from a row's handle moves the row and never pulls.
  await page.getByRole('radiogroup',{name:'What\'s your job today?'}).getByRole('radio',{name:/^Finish line/}).click();
  for(const [runner,place] of [[w(1),'1st'],[w(2),'2nd'],[w(3),'3rd']] as const) await page.getByRole('button',{name:`${runner} came ${place}`,exact:true}).click();
  const rows=page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
  await expect(rows).toHaveText([`1st${w(1)}No place`,`2nd${w(2)}No place`,`3rd${w(3)}No place`]);
  const drag=await startDrag(page,page.getByRole('button',{name:`Move ${w(1)}`,exact:true}));
  await drag.over(rows.last());
  await expect(hint).toBeHidden();
  await drag.drop();
  await expect(rows).toHaveText([`1st${w(2)}No place`,`2nd${w(3)}No place`,`3rd${w(1)}No place`]);
  expect(stream.starts).toBe(2);
  await pullToRefresh(page);
  await expect.poll(()=>stream.starts).toBe(3);
  await expect(rows).toHaveText([`1st${w(2)}No place`,`2nd${w(3)}No place`,`3rd${w(1)}No place`]);
  await expect(hint).toBeHidden();
  expect(await lookProblems(page)).toEqual([]);
  // Times: a time typed and not yet entered.
  await switchJob(page,'Timer');
  const time=page.getByLabel('Place time',{exact:true});
  await time.fill('1234');
  const typed=await time.inputValue();
  expect(typed).toContain('12');
  await time.blur();
  await pullToRefresh(page);
  await expect.poll(()=>stream.starts).toBe(4);
  await expect(time).toHaveValue(typed);
  await expect(hint).toBeHidden();
  expect(await lookProblems(page)).toEqual([]);
  // With reduced motion the hint appears in its place: it does not move with the finger.
  await page.emulateMedia({reducedMotion:'reduce'});
  lift=await fingerDown(page,60);
  await expect(hint).toBeVisible();
  const shown=(await hint.boundingBox())!.y;
  await lift();
  lift=await fingerDown(page,320);
  await expect(hint).toHaveText('Let go to refresh');
  expect((await hint.boundingBox())!.y).toBe(shown);
  await lift();
  await expect.poll(()=>stream.starts).toBe(5);
  await expect(hint).toBeHidden();
  await page.emulateMedia({reducedMotion:null});
  // Below the top of the screen a finger scrolls the screen up; it does not pull.
  await page.setViewportSize({width:page.viewportSize()!.width,height:320});
  await page.evaluate(()=>scrollTo(0,120));
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(0);
  lift=await fingerDown(page,320,{x:180,y:150});
  await expect(hint).toBeHidden();
  await lift();
  expect(stream.starts).toBe(5);
});

test('pull down to refresh on each step of a relay: the live stream starts again and the team placed and the typed time stay',async({openPhone,request},info)=>{
  test.setTimeout(60000);
  const code=await ownCode(),w=await ownWristbands('Girl Cubs',8);
  await ownRelay(code,ownName('Pull relay'),'Girl Cubs');
  const {page,token}=await openPhone(ownName('Pull relay steps'));
  await writeTeam(request,token,code,[w(1),w(2),w(3),w(4)]);
  await writeTeam(request,token,code,[w(5),w(6),w(7),w(8)]);
  const made=await flowRace(request,token,code),id=made.race.id,stream=streamStarts(page,id),hint=page.locator('.rz-pull');
  await flowPost(request,token,`/api/races/${id}/teams/${made.teams![0].id}/tick`,{});
  await page.goto(`/races/${id}`);
  // Check-in: the first team is in, the second is still to come.
  const teamOne=page.getByRole('region',{name:'Team 1',exact:true});
  await expect(teamOne).toBeVisible();
  await expect.poll(()=>stream.starts).toBe(1);
  await page.evaluate(()=>(document.activeElement as HTMLElement|null)?.blur());
  await pullToRefresh(page);
  await expect.poll(()=>stream.starts).toBe(2);
  await expect(teamOne).toBeVisible();
  await expect(hint).toBeHidden();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-check-in-pulled.png')});
  // Finishing order: the team placed stays.
  await flowPost(request,token,`/api/races/${id}/teams/${made.teams![1].id}/tick`,{});
  await switchJob(page,'Finish line');
  await press(page.getByRole('button',{name:`${w(8)} came 1st`,exact:true}));
  const first=page.getByRole('button',{name:/^1st place: .*\. Change$/});
  await expect(first).toBeVisible();
  await pullToRefresh(page);
  await expect.poll(()=>stream.starts).toBe(3);
  await expect(first).toBeVisible();
  await expect(page.getByRole('button',{name:`${w(4)} came 2nd`,exact:true})).toBeVisible();
  await expect(hint).toBeHidden();
  expect(await lookProblems(page)).toEqual([]);
  // Times: a time typed and not yet entered.
  await switchJob(page,'Timer');
  const time=page.getByLabel('Place time',{exact:true});
  await time.fill('1234');
  const typed=await time.inputValue();
  expect(typed).toContain('12');
  await time.blur();
  await pullToRefresh(page);
  await expect.poll(()=>stream.starts).toBe(4);
  await expect(time).toHaveValue(typed);
  await expect(hint).toBeHidden();
  expect(await lookProblems(page)).toEqual([]);
});

test('pull down to refresh on a lead screen with no Updated at line: Rename and a runner screen read again, and the typed name and the reason tapped stay',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Pull lead'),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const race=await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1100,1200]);
  const {page}=await openPhone(ownName('Pull lead forms'),{lead:true}),hint=page.locator('.rz-pull');
  /** A pull that reads `path` again. */
  const pulled=async(path:string)=>{
    const read=page.waitForResponse(response=>response.request().method()==='GET' && new URL(response.url()).pathname===path);
    await pullToRefresh(page);
    expect((await read).ok()).toBe(true);
    await expect(hint).toBeHidden();
    expect(await lookProblems(page)).toEqual([]);
  };
  await page.goto(`/day/events/${code}/rename`);
  const field=page.getByLabel('Event name',{exact:true});
  await expect(field).toHaveValue(name);
  await field.fill(`${name} typed`);await field.blur();
  await pulled('/api/day');
  await expect(field).toHaveValue(`${name} typed`);
  await page.goto(`/results/${code}/races/${race.id}/runners/${race.parts.runners.value![0].id}/disqualify`);
  const reason=page.getByRole('group',{name:'Reason',exact:true}).getByRole('button').first();
  await press(reason);
  await expect(reason).toHaveAttribute('aria-pressed','true');
  await pulled(`/api/lead/events/${code}/results`);
  await expect(reason).toHaveAttribute('aria-pressed','true');
});
