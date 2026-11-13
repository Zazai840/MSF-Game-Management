import {expect,lookProblems,openLeadMenu,openRace,ownCode,ownEvent,ownName,ownWristbands,press,pullToRefresh,recordRace,resultsCard,test} from './fixtures.js';

test('pulling down from the top of a screen with the Updated at line refreshes it: the pull says when to let go, and a short pull or an open sheet does nothing',async({openPhone},info)=>{
  test.skip(!info.project.use.hasTouch,'a pull is a touch gesture');
  const {page}=await openPhone(ownName('Pull refresh'));
  await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  let reads=0;
  await page.route('**/api/races',route=>{if(route.request().method()==='GET') reads++;return route.continue();});
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
  // A long pull: it says to let go, and letting go reads Races again.
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
  await screen('Races',/\/api\/races$/);
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
