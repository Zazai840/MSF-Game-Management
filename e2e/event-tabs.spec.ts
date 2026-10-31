import {becomeLead,expect,join,lookProblems,openLeadMenu,ownCode,ownEvent,ownName,ownWristbands,press,recordRace,signInThroughApi,test,writeCheckIn,type Page} from './fixtures.js';
const owner={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
/** As a new lead: Results, then the event's card. */
async function openEvent(page:Page,code:string,lead:string,section='Girl Cubs') {
  await page.goto('/');await join(page,ownName(lead),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await press(page.getByRole('button',{name:new RegExp(`^${code} · ${section}`)}));
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
  await expect(tabs(page)).toHaveText(['Heats','Final','Races','Notes']);
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
  await press(tab(page,'Final'));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/final$`));
  await expect(page.getByText("The final's order appears here once its finishing order is saved.",{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
});

test('a timed event has tabs Heats, Races and Notes, states the medal places, and each empty tab says what will appear',async({page},info)=>{
  const code=await ownCode(),name=ownName('Timed tabs'),girls=await ownWristbands('Girl Cubs',2);
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  await openEvent(page,code,'Timed tabs lead');
  await expect(tabs(page)).toHaveText(['Heats','Races','Notes']);
  await expect(page.getByText('Runners appear here once a heat is saved.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await press(tab(page,'Races'));
  await expect(page.getByText('Races appear here once one is checked in.',{exact:true})).toBeVisible();
  await expect(page.getByText('Deleted races appear here when a lead deletes a race.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await press(tab(page,'Notes'));
  await expect(page.getByText("Notes appear here when a lead changes this event's results.",{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await recordRace(page.request,await signInThroughApi(page.request,ownName('Timed tabs timer')),code,[girls(1),girls(2)],[1200,1300]);
  await press(tab(page,'Heats'));
  await expect(page.getByText('Medal places: 1st, 2nd, 3rd',{exact:true})).toBeVisible({timeout:6500});
  await expect(board(page)).toHaveCount(2);
  await expect(board(page).first()).toContainText(`${girls(1)}1st`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('timed-heats-tab.png'),fullPage:true});
});

test('the Races tab lists each live race with why it does not count yet, then Deleted races, and Back from a race returns to the tab',async({page},info)=>{
  const code=await ownCode(),name=ownName('Races tab'),girls=await ownWristbands('Girl Cubs',4);
  await ownEvent(page.request,code,name);
  const timer=await signInThroughApi(page.request,ownName('Races tab timer'));
  await recordRace(page.request,timer,code,[girls(1),girls(2)],[1200,1300]);
  const {race}=await writeCheckIn(page.request,timer,code,[girls(3)]);
  expect((await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:owner,data:{permanent:false}})).ok()).toBe(true);
  await writeCheckIn(page.request,timer,code,[girls(4)]);
  await openEvent(page,code,'Races tab lead');
  await expect(page.getByText('Not ranked yet')).toHaveCount(0);
  await press(tab(page,'Races'));
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races$`));
  const heat1=page.getByRole('button',{name:'Open Heat 1',exact:true});
  await expect(heat1).toHaveAccessibleDescription(/^2 runners · saved · checked in \d\d:\d\d$/);
  await expect(page.locator('.rz-listrow',{hasText:'not saved yet'})).toHaveAccessibleDescription(/^1 runner · not saved yet · checked in \d\d:\d\d$/);
  await expect(page.getByRole('button',{name:'Open deleted Heat 2',exact:true})).toHaveAccessibleDescription('1 runner');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('races-tab.png'),fullPage:true});
  await press(tab(page,'Notes'));
  await expect(page.getByRole('list',{name:'Audit notes'})).toContainText(/^\d\d:\d\d.*moved to Deleted races Heat 2$/);
  expect(await lookProblems(page)).toEqual([]);
  // Switching tabs replaced the address in place; a race opened from Races comes back to Races.
  await press(tab(page,'Races'));
  await press(heat1);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races$`));
  await expect(tab(page,'Races')).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('button',{name:'Back to Results',exact:true})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/results$/);
});
