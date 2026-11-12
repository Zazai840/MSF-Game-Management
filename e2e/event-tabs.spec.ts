import {becomeLead,deleteCurrentRace,eventTab,expect,join,lookProblems,openLeadMenu,ownCode,ownEvent,ownName,ownWristbands,press,recordRace,signInThroughApi,test,writeCheckIn,type Page,notStartedCard,resultsCard} from './fixtures.js';
const owner={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
/** As a new lead: Results, then the event's card (under the Not started line while the event has no races). */
async function openEvent(page:Page,code:string,lead:string,notStarted=false) {
  await page.goto('/');await join(page,ownName(lead),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await press(notStarted?await notStartedCard(page,code):resultsCard(page,code));
}
const tabs=(page:Page)=>page.getByRole('navigation',{name:'Event'}).getByRole('button');
const tab=(page:Page,name:string)=>page.getByRole('navigation',{name:'Event'}).getByRole('button',{name,exact:true});
const board=(page:Page)=>page.getByRole('list',{name:'Provisional leaderboard'}).locator(':scope > li');

test('an event opens on Heats: the scoreboard states only the rule, stars and Qs the fastest, says Check on an open warning, and puts Did not finish last',async({page},info)=>{
  const code=await ownCode(),name=ownName('Heats tab'),girls=await ownWristbands('Girl Cubs',3),scout=(await ownWristbands('Boy Scouts',1))(1);
  await ownEvent(page.request,code,name);
  await recordRace(page.request,await signInThroughApi(page.request,ownName('Heats tab timer')),code,[scout,girls(1),girls(2),girls(3)],[1200,1300,1400],[scout]);
  await openEvent(page,code,'Heats tab lead');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(tabs(page)).toHaveText(['Heats','Final','Notes']);
  await expect(tab(page,'Heats')).toHaveAttribute('aria-current','page');
  await expect(page.getByText('Fastest 6 go to the final',{exact:true})).toBeVisible();
  await expect(page.getByText(/highlighted/)).toHaveCount(0);
  await expect(board(page).first()).toContainText(`${scout}QCheck`);
  await expect(board(page).first()).toContainText('Heat 1 · 1st in race12.00');
  await expect(board(page).nth(3)).toHaveText('Qualifying line');
  await expect(board(page).last()).toContainText(`${girls(3)}Heat 1 · Did not finish-`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('heats-tab.png'),fullPage:true});
  // No final yet: the Final tab says what will appear there.
  await eventTab(page,'Final');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/final$`));
  await expect(page.getByText("The final's order appears here once its finishing order is saved.",{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});

test('a timed event has tabs Heats and Notes, states the medal places, and each empty tab says what will appear',async({page},info)=>{
  const code=await ownCode(),name=ownName('Timed tabs'),girls=await ownWristbands('Girl Cubs',2);
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  await openEvent(page,code,'Timed tabs lead',true);
  await expect(tabs(page)).toHaveText(['Heats','Notes']);
  await expect(page.getByText('Runners appear here once a heat is saved.',{exact:true})).toBeVisible();
  await expect(page.getByText('Deleted races appear here when a lead deletes a race.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await eventTab(page,'Notes');
  await expect(page.getByText("Notes appear here when a lead changes this event's results.",{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await recordRace(page.request,await signInThroughApi(page.request,ownName('Timed tabs timer')),code,[girls(1),girls(2)],[1200,1300]);
  await eventTab(page,'Heats');
  await expect(page.getByText('Medal places: 1st, 2nd, 3rd',{exact:true})).toBeVisible({timeout:6500});
  await expect(board(page)).toHaveCount(2);
  await expect(board(page).first()).toContainText(`${girls(1)}1st`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('timed-heats-tab.png'),fullPage:true});
});

test('Heats lists each heat with its runners and whether it is in Results, then the scoreboard, then Deleted races; Back from a race returns to Heats and the old Races address opens Heats',async({page},info)=>{
  const code=await ownCode(),name=ownName('Heat rows'),girls=await ownWristbands('Girl Cubs',4);
  await ownEvent(page.request,code,name);
  const timer=await signInThroughApi(page.request,ownName('Heat rows timer'));
  await recordRace(page.request,timer,code,[girls(1),girls(2)],[1200,1300]);
  const {race}=await writeCheckIn(page.request,timer,code,[girls(3)]);
  expect((await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:owner,data:{permanent:false}})).ok()).toBe(true);
  await writeCheckIn(page.request,timer,code,[girls(4)]);
  await openEvent(page,code,'Heat rows lead');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(page.getByText('Not ranked yet')).toHaveCount(0);
  const heat1=page.getByRole('button',{name:'Open Heat 1',exact:true}),unsaved=page.locator('.rz-listrow',{hasText:'not in Results yet'});
  const deleted=page.getByRole('button',{name:/^Open deleted Heat 2 · deleted\s\d\d:\d\d$/});
  await expect(heat1).toHaveAccessibleDescription(/^2 runners · in Results · checked in \d\d:\d\d$/);
  await expect(unsaved).toHaveAccessibleDescription(/^1 runner · not in Results yet · checked in \d\d:\d\d Runners 1 so far Finishing order Not started Times Not started Not in Results yet: \d+ has no place\.$/);
  await expect(deleted).toHaveAccessibleDescription('1 runner');
  // Top to bottom: the heat rows, the scoreboard, Deleted races.
  const tops=await Promise.all([heat1,unsaved,page.getByRole('region',{name:'Heats',exact:true}),page.getByRole('heading',{name:'Deleted races',exact:true}),deleted].map(async part=>(await part.boundingBox())!.y));
  expect(tops).toEqual([...tops].sort((a,b)=>a-b));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('heats-tab-rows.png'),fullPage:true});
  await eventTab(page,'Notes');
  await expect(page.getByRole('list',{name:'Audit notes'})).toContainText(/^\d\d:\d\d.*moved to Deleted races Heat 2$/);
  expect(await lookProblems(page)).toEqual([]);
  // Switching tabs replaced the address in place; a race opened from Heats comes back to Heats.
  await eventTab(page,'Heats');
  await press(heat1);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(tab(page,'Heats')).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('button',{name:'Back to Results',exact:true})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/results$/);
  // A link kept to the old Races tab opens Heats.
  await page.goto(`/results/${code}/races`);
  await expect(tab(page,'Heats')).toHaveAttribute('aria-current','page');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/heats$`));
  await expect(heat1).toBeVisible();
  // The race not in Results yet would sit on every phone's Races: it goes.
  await deleteCurrentRace(page.request,code);
});
