import {ownCode,ownEvent,ownName,ownWristbands,deleteCurrentRace,expect,lookProblems,openRace,press,recordRace,test,writeCheckIn,type Page} from './fixtures.js';
const items=(page:Page)=>page.getByRole('menu').getByRole('menuitem');
const title=(page:Page,name:string)=>expect(page.getByRole('banner').getByRole('heading',{level:1,name,exact:true})).toBeVisible();
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();

test('a lead\'s avatar menu is on every lead screen and the Race screen: Races, Results, Day setup, Log out, each opening its screen',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Menu walk'),event=`${name} · Girl Cubs`,w=await ownWristbands('Girl Cubs',3);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const race=await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1100,1200]);
  // Heat 2 is not in Results yet: a lead's Race screen (a saved race is its race page).
  const open=(await writeCheckIn(request,process.env.E2E_OWNER_TOKEN!,code,[w(3)])).race;
  const {page}=await openPhone(ownName('Menu lead'),{lead:true});
  /** On this screen: the avatar at the top right of the bar, its four items, and the one picked. */
  const pick=async(item:string,screen:string)=>{
    const avatar=page.getByRole('banner').getByRole('button',{name:`${ownName('Menu lead')}: Races, Results, Day setup and Log out`,exact:true});
    // Nothing in the bar sits to the right of the avatar, and it is in the bar's top row.
    const box=(await avatar.boundingBox())!,bar=(await page.getByRole('banner').boundingBox())!;
    const rights=await page.getByRole('banner').getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.getBoundingClientRect().right));
    expect(box.x+box.width,screen).toBe(Math.max(...rights));expect(box.x,screen).toBeGreaterThan(bar.x+bar.width/2);
    await press(avatar);
    await expect(items(page),screen).toHaveText(['Races','Results','Day setup','Log out']);
    expect(await lookProblems(page),screen).toEqual([]);
    await page.screenshot({path:info.outputPath(`${screen}.png`)});
    await press(items(page).getByText(item,{exact:true}));
    await expect(page.getByRole('menu')).toHaveCount(0);
  };
  await pick('Results','races');await title(page,'Results');
  // Results, its event and the lead's race page.
  await press(page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}));await title(page,event);
  await pick('Results','event');await title(page,'Results');
  await page.goto(`/results/${code}/races/${race.id}`);await title(page,`Heat ${race.number}`);
  await pick('Day setup','race-page');await title(page,'Day setup');
  // Day setup, Signed in today and Events.
  await press(page.getByRole('button',{name:/^Signed in today /}));await title(page,'Signed in today');
  await pick('Day setup','signed-in-today');await title(page,'Day setup');
  await press(page.getByRole('button',{name:/^Events /}));await title(page,'Events');
  await pick('Races','events');await races(page);
  // The Race screen: the menu leaves the race for Results, and the back arrow still returns to the race.
  await openRace(page,name,'Girl Cubs','H2');
  await pick('Results','race');await title(page,'Results');
  await press(page.getByRole('banner').getByRole('button',{name:/^Back to /}));
  await title(page,event);await expect(page).toHaveURL(new RegExp(`/races/${open.id}$`));
  await press(page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true}));await races(page);
  await deleteCurrentRace(request,code);
});
test('a volunteer\'s avatar menu on the Race screen has Log out only',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Menu heat');
  await ownEvent(request,code,name);
  const volunteer=ownName('Menu volunteer'),{page}=await openPhone(volunteer);
  expect((await request.post('/api/races',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{eventCode:code,kind:'heat',number:1}})).ok()).toBe(true);
  await openRace(page,name);
  await press(page.getByRole('banner').getByRole('button',{name:`${volunteer}: Log out`,exact:true}));
  await expect(items(page)).toHaveText(['Log out']);
  expect(await lookProblems(page)).toEqual([]);
  await press(items(page).getByText('Log out',{exact:true}));
  await expect(page.getByRole('heading',{level:1,name:/Join( the Running Zone)?$/})).toBeVisible();
});
