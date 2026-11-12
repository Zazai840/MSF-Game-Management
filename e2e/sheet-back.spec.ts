import {eventTab,ownName,ownCode,expect,lookProblems,openLeadMenu,openRace,ownEvent,press,recordRace,test,type Locator,type Page} from './fixtures.js';

const owner=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
async function onRaces(page:Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
}
const jobChip=(page:Page)=>page.getByRole('button',{name:/^Your role is .*\. Change job$/}).first();
/** Every way a sheet closes: the phone's Back, the close button, Escape, a tap on the screen above it. */
const closers={
  back:(page:Page)=>page.goBack(),
  close:(page:Page,sheet:Locator)=>press(sheet.getByLabel('Close',{exact:true})),
  escape:(page:Page)=>page.keyboard.press('Escape'),
  outside:(page:Page)=>page.locator('.rz-scrim').click({position:{x:8,y:8}})
};
/** Opens a sheet, closes it one way, and checks the screen behind is where it was. */
async function opensAndCloses(page:Page,open:()=>Promise<unknown>,sheet:Locator,how:keyof typeof closers,here:()=>Promise<void>) {
  await open();await expect(sheet).toBeVisible();
  await closers[how](page,sheet);
  await expect(sheet).toHaveCount(0);await here();
}

test('the phone\'s Back closes the job sheet, New race and Add heat on Races, and a sheet closed any other way leaves no extra Back',async({openPhone,request},info)=>{
  const name=ownName('Sheet back sprint'),code=await ownCode();
  await ownEvent(request,code,name);
  expect((await request.post('/api/races',{headers:owner(),data:{eventCode:code,kind:'heat',number:1}})).ok()).toBe(true);
  const {page}=await openPhone(ownName('Sheet back volunteer'));
  const job=page.getByRole('dialog',{name:'What\'s your job today?'}),newRace=page.getByRole('dialog',{name:'New race'});
  const races=()=>onRaces(page),card=page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
  await opensAndCloses(page,()=>press(jobChip(page)),job,'back',races);
  await opensAndCloses(page,()=>press(page.getByRole('button',{name:'New race',exact:true})),newRace,'back',races);
  await opensAndCloses(page,()=>press(card.getByRole('button',{name:'Add heat 2',exact:true})),newRace,'back',races);
  await expect(newRace.getByRole('button',{name:'Create heat 2',exact:true})).toHaveCount(0);
  // On a race: Back closes the job sheet and stays on the race; the next Back goes to Races.
  await openRace(page,name);
  const race=page.url(),onRace=async()=>{await expect(page).toHaveURL(race);await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();};
  await press(jobChip(page));await expect(job).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('job-sheet-on-race.png')});
  await closers.back(page);await expect(job).toHaveCount(0);await onRace();
  await page.goBack();await races();
  // Closed with the close button, Escape or a tap outside, a sheet leaves nothing behind: the next Back leaves the race.
  for(const how of ['close','escape','outside'] as const) {
    await openRace(page,name);
    await opensAndCloses(page,()=>press(jobChip(page)),job,how,onRace);
    await page.goBack();await races();
  }
  // Create heat 2 opens the new race, and Back from it goes to Races, not to the sheet.
  await press(card.getByRole('button',{name:'Add heat 2',exact:true}));
  await press(newRace.getByRole('button',{name:'Create heat 2',exact:true}));
  await expect(page).toHaveURL(/\/races\/[^/]+$/);await expect(newRace).toHaveCount(0);
  await page.goBack();await races();
  await expect(newRace).toHaveCount(0);
});

test('a sheet takes focus as it opens, keeps Tab inside it, and gives focus back to what opened it however it closes',async({openPhone})=>{
  const {page}=await openPhone(ownName('Sheet focus volunteer'));
  const job=page.getByRole('dialog',{name:'What\'s your job today?'}),chip=jobChip(page),close=job.getByRole('button',{name:'Close',exact:true}).first();
  const inside=()=>job.evaluate(sheet=>sheet.contains(document.activeElement));
  for(const how of ['escape','close','back','outside'] as const) {
    await chip.focus();await page.keyboard.press('Enter');
    // The sheet itself takes focus, not a field or button in it.
    await expect(job).toBeVisible();await expect(job).toBeFocused();
    // Shift+Tab from the sheet goes to its last button, and Tab walks every button back round to its × (Close).
    await page.keyboard.press('Shift+Tab');expect(await inside()).toBe(true);
    await page.keyboard.press('Tab');await expect(close).toBeFocused();
    const count=await job.locator('button:not(:disabled),select,textarea,input,a[href]').count();
    for(let tab=0;tab<count;tab++) {expect(await inside()).toBe(true);await page.keyboard.press('Tab');}
    await expect(close).toBeFocused();
    if(how==='close') await page.keyboard.press('Enter');else await closers[how](page);
    await expect(job).toHaveCount(0);await expect(chip).toBeFocused();
  }
});

test('the phone\'s Back closes + Final and the lead\'s runner sheet, and the screen behind stays',async({openPhone,request})=>{
  const name=ownName('Sheet back heats'),code=await ownCode(),event=`${name} · Girl Cubs`;
  await ownEvent(request,code,name);
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2041,2042],[1200,1300]);
  const {page}=await openPhone(ownName('Sheet back lead'),{lead:true});
  const races=()=>onRaces(page),card=page.getByRole('article',{name:event,exact:true});
  const final=page.getByRole('dialog',{name:'Have all Girl Cubs heats run?',exact:true});
  await opensAndCloses(page,()=>press(card.getByRole('button',{name:'Create the final from the fastest 6',exact:true})),final,'back',races);
  // New race's Create the final swaps its sheet for the + Final question; Back closes that one too.
  await press(page.getByRole('button',{name:'New race',exact:true}));
  const newRace=page.getByRole('dialog',{name:'New race'});
  await press(newRace.getByRole('button',{name,exact:true}));await press(newRace.getByRole('button',{name:`Girl Cubs ${code}`,exact:true}));
  await press(newRace.getByRole('button',{name:'Final',exact:true}));await press(newRace.getByRole('button',{name:'Create the final',exact:true}));
  await expect(final).toBeVisible();await expect(newRace).toHaveCount(0);
  await page.goBack();await expect(final).toHaveCount(0);await races();
  // The runner sheet on an event: Back closes it and the event stays; the next Back goes to Results.
  await openLeadMenu(page,'Results');
  await press(page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}));
  const eventPage=async(tab='heats')=>{await expect(page).toHaveURL(new RegExp(`/results/${code}/${tab}$`));await expect(page.getByRole('banner').getByRole('heading',{level:1,name:event,exact:true})).toBeVisible();};
  await eventPage();
  const runner=page.getByRole('dialog',{name:/^Runner /}),row=page.getByRole('button',{name:/2042.* · Heat 1$/});
  await opensAndCloses(page,()=>press(row),runner,'back',eventPage);
  await opensAndCloses(page,()=>press(row),runner,'escape',eventPage);
  await press(row);await press(runner.getByRole('button',{name:'Close',exact:true}));await expect(runner).toHaveCount(0);await eventPage();
  // Race actions on a race page: Back closes it and the race page stays. Delete from it goes to its screen, and the
  // delete goes back to the event, past the race and the screen; the next Back goes to Results.
  await eventTab(page,'Heats');await press(page.getByRole('button',{name:'Open Heat 1',exact:true}));
  const racePage=async()=>{await expect(page).toHaveURL(new RegExp(`/results/${code}/races/[^/]+$`));await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Heat 1',exact:true})).toBeVisible();};
  await racePage();
  const actions=page.getByRole('dialog',{name:'Heat 1 · actions',exact:true}),more=page.getByRole('main').getByRole('button',{name:'Correct or delete Heat 1',exact:true});
  await opensAndCloses(page,()=>press(more),actions,'back',racePage);
  await opensAndCloses(page,()=>press(more),actions,'outside',racePage);
  expect(await lookProblems(page)).toEqual([]);
  await press(more);await press(actions.getByRole('button',{name:'Delete Heat 1',exact:true}));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/[^/]+/delete$`));
  await press(page.getByRole('button',{name:/^Delete for good/}));
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 1 for good',exact:true}));
  await eventPage();
  await page.goBack();await expect(page).toHaveURL(/\/results$/);
});
