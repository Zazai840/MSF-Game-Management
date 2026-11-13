import {eventTab,press,raceAction,ownName,ownWristbands,ownCode,back,expect,expectToast,live,lookProblems,openLeadsBarTab,ownRelay,signInThroughApi,submitRace,test,tickTeam,writeTeam,writeTeamOrder,writeTimes,resultsCard} from './fixtures.js';
import type {APIRequestContext,Page} from '@playwright/test';
import type {RaceFlowRead,RacesRead} from '../src/shared/race-flow.js';

/** A lead's Results for the relay, then its event page. */
async function openRelayResults(page:Page,code:string) {
  await openLeadsBarTab(page,'Results');
  await press(resultsCard(page,code));
}
/** One phone ticks the teams in, places them in this order with these times, and marks every step done, which saves the heat. */
async function runHeat(request:APIRequestContext,token:string,code:string,placed:number[],times:number[]) {
  for(const team of placed) await tickTeam(request,token,code,team);
  await writeTeamOrder(request,token,code,placed);await writeTimes(request,token,code,times);await submitRace(request,token,code);
}

test('a lead\'s Correct teams on a saved relay heat fixes a child\'s number, takes a team off and adds one, and the team keeps the fix for its next race',async({openPhone,request},info)=>{
  test.setTimeout(60000);
  const name=ownName('Correct teams'),code=await ownCode();
  await ownRelay(code,name,'Boy Scouts');
  // The test day is shared: each project's Boy Scouts wristbands are its own, and no other test types them.
  const n=await ownWristbands('Boy Scouts',16),legs=(team:number)=>[1,2,3,4].map(leg=>n((team-1)*4+leg));
  const volunteer=await openPhone(ownName('Correct teams volunteer'));
  for(let team=1;team<=3;team++) await writeTeam(request,volunteer.token,code,legs(team),{keptWarnings:legs(team)});
  await runHeat(request,volunteer.token,code,[2,1],[1500,1600]);
  const {page,token:lead}=await openPhone(ownName('Correct teams lead'),{lead:true});
  await openRelayResults(page,code);
  await eventTab(page,'Heats');await press(page.getByRole('listitem').getByRole('button',{name:'Open Heat 1',exact:true}));
  const racePage=page.url(),docked=page.getByRole('contentinfo'),record=page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem');
  const teamCard=(number:number)=>page.getByRole('region',{name:`Team ${number}`,exact:true});
  const legsOf=(numbers:number[])=>numbers.map((number,index)=>`${['1st','2nd','3rd','4th'][index]}${number}`);
  const stillToRun=page.getByRole('list',{name:'Still to run',exact:true});
  // Leaving without Save changes nothing.
  await raceAction(page,'Correct teams');
  await expect(page).toHaveURL(`${racePage}/correct-teams`);
  await press(teamCard(1).getByRole('button',{name:'Take off',exact:true}));await expect(teamCard(1)).toHaveCount(0);
  await page.goBack();await expect(page).toHaveURL(racePage);await expect(record).toHaveText([/Team 2/,/Team 1/]);
  await raceAction(page,'Correct teams');
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Correct teams',exact:true})).toBeVisible();
  await expect(docked.getByText('Change a team first.',{exact:true})).toBeVisible();
  await expect(teamCard(2).getByRole('listitem')).toHaveText(legsOf(legs(2)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('correct-teams-open.png'),fullPage:true});
  // Team 2's 3rd child was typed wrong at the prep area: the fix keeps Team 2's place.
  await press(teamCard(2).getByRole('button',{name:`Team 2 3rd leg: ${legs(2)[2]}. Change`,exact:true}));
  const box=page.getByLabel('New number',{exact:true});await expect(box).toBeFocused();
  await box.fill(String(n(13)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('correct-teams-edit.png'),fullPage:true});
  await press(docked.getByRole('button',{name:'Done',exact:true}));
  const fixed=[legs(2)[0],legs(2)[1],n(13),legs(2)[3]];
  await expect(teamCard(2).getByRole('listitem')).toHaveText(legsOf(fixed));
  // Team 1 never ran, and Team 3 did.
  await press(teamCard(1).getByRole('button',{name:'Take off',exact:true}));
  await expect(teamCard(1)).toHaveCount(0);
  await expect(stillToRun.getByRole('listitem')).toHaveText([new RegExp(`^Team 1${legs(1).join(' · ')}`),new RegExp(`^Team 3${legs(3).join(' · ')}`)]);
  await press(stillToRun.getByRole('button',{name:'Add Team 3',exact:true}));
  await expect(page.getByRole('region',{name:/^Team \d+$/})).toHaveCount(2);
  await expect(teamCard(3).getByRole('listitem')).toHaveText(legsOf(legs(3)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('correct-teams.png'),fullPage:true});
  // One save for every change: one toast and one Notes line, back on the race page.
  await press(docked.getByRole('button',{name:'Save teams',exact:true}));
  await expectToast(page,'Teams saved');await expect(page).toHaveURL(racePage);
  // Team 1's time went with Team 1: Team 3 has its place, and no time until a lead types its own.
  await expect(record).toHaveText([/^1st\s*Team 2\s*15\.00/,/^2nd\s*Team 3\s*No time/]);
  const leadRace=`/api/lead/races/${racePage.split('/').at(-1)}`,headers={authorization:`Bearer ${lead}`};
  const timesVersion=(await (await request.get(leadRace,{headers})).json()).race.parts.times.version;
  expect((await request.post(`${leadRace}/times`,{headers,data:{baseVersion:timesVersion,places:[1500,1650]}})).ok()).toBe(true);
  // Heat 1 is Team 2's latest race, so the team takes the fix too: the typo won't come back at the Final. Team 1,
  // taken off, is still to run.
  const team=async(number:number)=>{
    const get=async<T>(url:string)=>(await (await request.get(url,{headers:{authorization:`Bearer ${volunteer.token}`}})).json()) as T;
    const heat=(await get<RacesRead>('/api/races')).groups.find(group=>group.event.code===code)!.races[0];
    return (await get<RaceFlowRead>(`/api/races/${heat.id}`)).teams!.find(item=>item.number===number)!;
  };
  expect((await team(2)).legs.map(leg=>leg.wristband)).toEqual(fixed);
  expect((await team(1)).races).toEqual([]);
  // Correct number on one child of Team 2, from its leaderboard row: the team takes it too.
  await back(page,`${name} · Boy Scouts`);await eventTab(page,'Heats');
  await page.getByRole('button',{name:`Team 2 · ${fixed.join(' · ')} · Heat 1`,exact:true}).click();
  await page.getByRole('button',{name:'Correct number',exact:true}).click();
  // On a team, the screen asks which child first.
  await expect(page.getByText('Choose the child first.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:`2nd leg · ${legs(2)[1]}`,exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:`New number for ${legs(2)[1]}?`,exact:true})).toBeVisible();
  await page.getByLabel('New wristband number',{exact:true}).fill(String(n(14)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('correct-number-team.png'),fullPage:true});
  await page.getByRole('button',{name:'Save number',exact:true}).click();await expectToast(page,`Number saved · ${n(14)}`);
  const corrected=[legs(2)[0],n(14),n(13),legs(2)[3]];
  await expect(page.getByRole('button',{name:`Team 2 · ${corrected.join(' · ')} · Heat 1`,exact:true})).toBeVisible(live);
  expect((await team(2)).legs.map(leg=>leg.wristband)).toEqual(corrected);
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText(`corrected ${legs(2)[1]} to ${n(14)} in Team 2 (Heat 1)`);
  // Correct teams saved once, so it left one Notes line.
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').filter({hasText:'corrected the teams'})).toHaveText([/corrected the teams for Heat 1: Team 2, Team 3$/]);
});

test('Delete then Restore on a relay heat: its teams are still to run, then a team in two heats ran twice until the lead chooses which result counts',async({openPhone,request},info)=>{
  const name=ownName('Relay ran twice'),code=await ownCode();
  await ownRelay(code,name,'Boy Scouts');
  const n=await ownWristbands('Boy Scouts',12),legs=(team:number)=>[1,2,3,4].map(leg=>n((team-1)*4+leg));
  const token=await signInThroughApi(request,ownName('Relay ran twice volunteer'));
  for(let team=1;team<=2;team++) await writeTeam(request,token,code,legs(team),{keptWarnings:legs(team)});
  await runHeat(request,token,code,[1,2],[1500,1600]);
  const {page}=await openPhone(ownName('Relay ran twice lead'),{lead:true});
  await openRelayResults(page,code);
  await eventTab(page,'Heats');await press(page.getByRole('listitem').getByRole('button',{name:'Open Heat 1',exact:true}));
  const racePage=page.url();
  await raceAction(page,'Delete Heat 1');await press(page.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 1',exact:true}));
  await expectToast(page,'Heat 1 moved to Deleted races');
  await page.getByRole('button',{name:/^Open deleted Heat 1 · deleted\s\d\d:\d\d$/}).click();await expect(page).toHaveURL(racePage);
  // Heat 1 deleted, Team 1 is still to run, and runs again in Heat 2.
  await runHeat(request,token,code,[1],[1450]);
  // The heat Team 1 ran again took the freed number, so Heat 1 comes back as Heat 2, and the toast says so.
  await raceAction(page,'Restore Heat 1');await press(page.getByRole('contentinfo').getByRole('button',{name:'Restore Heat 1',exact:true}));
  await expectToast(page,'Heat 2 restored');await expect(page).toHaveURL(racePage);
  await back(page,`${name} · Boy Scouts`);await eventTab(page,'Heats');
  const row=(heat:number)=>page.getByRole('button',{name:`Team 1 · ${legs(1).join(' · ')} · Heat ${heat}`,exact:true});
  // Both rows rank; Team 1's sheet offers the choice because it ran twice.
  await expect(row(1)).toContainText('Heat 1');
  await row(2).click();
  await page.getByRole('button',{name:'Choose which result counts',exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:'Which result counts for Team 1?',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Heat 2 · /}).click();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-choose-result.png'),fullPage:true});
  await page.getByRole('button',{name:'Save counted result',exact:true}).click();await expectToast(page,'Result counts · Team 1');
  await expect(row(1)).toContainText('Not counted');await expect(row(2)).not.toContainText('Not counted');
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('counted Team 1 from Heat 2; Heat 1 not counted');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-ran-twice-settled.png'),fullPage:true});
});
