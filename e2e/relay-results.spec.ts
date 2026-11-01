import type {APIRequestContext,TestInfo} from '@playwright/test';
import {eventTab,ownName,ownWristbands,ownCode,back,dragTo,expect,expectToast,lookProblems,markFinalHere,markHere,openLeadMenu,ownRelay,signInThroughApi,submitRace,test,tickTeam,writeTeam,writeTeamOrder,writeTimes} from './fixtures.js';

test('a relay\'s results name its teams\' issues: a kept wrong-Section number, a child in two relays and a team that ran short clear with Mark checked, a team added at the finish with Mark addition checked',async({openPhone,request},info)=>{
  const cubs=await ownCode(),scouts=await ownCode();
  const name=ownName('Relay warnings');
  await ownRelay(cubs,name,'Girl Cubs');await ownRelay(scouts,name,'Girl Scouts');
  // The test day is shared: each project's children use wristbands no other relay test types.
  const cub=await ownWristbands('Girl Cubs',16),scout=await ownWristbands('Girl Scouts',16),borrowed=(await ownWristbands('Boy Cubs',1))(1),shared=cub(7);
  const token=await signInThroughApi(request,ownName('To check relay volunteer'));
  await writeTeam(request,token,cubs,[cub(1),borrowed,cub(2),cub(3)],{keptWarnings:[borrowed]});
  await writeTeam(request,token,cubs,[cub(4),cub(5),cub(6),shared]);
  await writeTeam(request,token,cubs,[cub(8),cub(9),cub(10),cub(11)]);
  await writeTeam(request,token,cubs,[cub(12),cub(13),cub(14),cub(15)]);
  await writeTeam(request,token,scouts,[scout(1),shared,scout(2),scout(3)],{keptWarnings:[shared]});
  // Teams 1 to 3 are checked in, Team 3 with one child not marked here; Team 4 crosses the line unchecked.
  for(const team of [1,2,3]) {await tickTeam(request,token,cubs,team);for(let leg=1;leg<=(team===3?3:4);leg++) await markHere(request,token,cubs,team,leg);}
  await writeTeamOrder(request,token,cubs,[1,2,3],{addedTeams:[4]});await writeTimes(request,token,cubs,[1400,1500,1600,1700]);await submitRace(request,token,cubs);

  const {page}=await openPhone(ownName('To check relay lead'),{lead:true});
  // A relay's issues are on its results: each team's row names them, and its actions settle them.
  await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${cubs} · Girl Cubs`)}).click();
  const board=page.getByRole('list',{name:'Provisional leaderboard',exact:true});
  const teamRow=(team:number)=>board.getByRole('button',{name:new RegExp(`^Team ${team} · .* · Heat 1$`)});
  // Each team with an open issue says Check on its row; the sheet and the race page name it.
  for(const team of [1,2,3,4]) await expect(teamRow(team)).toContainText('Check');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-warnings.png'),fullPage:true});
  /** Opens the team's runner sheet from its row and presses the check, which saves at once. */
  async function settle(team:number,button:string,toast:string) {
    await teamRow(team).click();
    const sheet=page.getByRole('dialog',{name:`Team ${team}`,exact:true});
    // Disqualifying for wrong section or age is a reason under the one Disqualify button, not a button of its own.
    await expect(sheet).toBeVisible();await expect(sheet.getByRole('button',{name:'Disqualify for wrong section or age',exact:true})).toHaveCount(0);
    if(team===1) {expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('relay-team-actions.png'),fullPage:true});}
    await sheet.getByRole('button',{name:button,exact:true}).click();await expectToast(page,`${toast} · Team ${team}`);await expect(sheet).toHaveCount(0);
  }
  await settle(1,'Mark checked','Warning checked');
  await settle(2,'Mark checked','Warning checked');
  await settle(3,'Mark checked','Warning checked');
  await settle(4,'Mark addition checked','Addition checked');
  // Checked, no row says Check any more.
  const checked=`Checked by ${ownName('To check relay lead')}: `;
  await expect(board.getByText('Check',{exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-checked-rows.png'),fullPage:true});
  // The race page's Current record shows the same checked warnings beside each team, grey and worded as on the leaderboard.
  await eventTab(page,'Races');await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  const record=page.getByRole('list',{name:'Current record',exact:true});
  await expect(record.locator('.record-warning')).toHaveText([`${checked}${borrowed} is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.`,`${checked}${shared} is in Girl Cubs Team 2 and Girl Scouts Team 1.`,`${checked}Team 3 ran with 3 of 4 children marked here.`]);
  for(const warning of await record.locator('.record-warning').all()) expect(await warning.evaluate(element=>getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 244, 220)');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-race-page-checked.png'),fullPage:true});
});

test('a lead sees a relay\'s two saved heats as team rows with four wristbands and the qualifying line, the race page lists teams, and Heats complete seeds the six fastest',async({openPhone,request},info)=>{
  const name=ownName('Relay results'),code=await ownCode();
  await ownRelay(code,name,'Girl Cubs');
  // The test day is shared: each project's teams use Girl Cubs wristbands no other relay test types, and Team 4 runs a
  // borrowed Boy Cub, kept.
  const n=await ownWristbands('Girl Cubs',30),legs=(team:number)=>[1,2,3,4].map(leg=>n((team-1)*4+leg)),borrowed=(await ownWristbands('Boy Cubs',1))(1);
  const token=await signInThroughApi(request,ownName('Relay results volunteer'));
  for(let team=1;team<=7;team++) await writeTeam(request,token,code,team===4?[legs(4)[0],borrowed,legs(4)[2],legs(4)[3]]:legs(team),{keptWarnings:team===4?[borrowed]:[]});
  /** One phone ticks the teams in, places them in this order with these times, and marks every step done, which saves the heat. */
  async function heat(placed:number[],times:number[]) {
    for(const team of placed) await tickTeam(request,token,code,team);
    await writeTeamOrder(request,token,code,placed);await writeTimes(request,token,code,times);await submitRace(request,token,code);
  }
  await heat([2,1,3,4],[1400,1500,1700,1900]);
  await heat([5,6,7],[1450,1600,1800]);
  const {page}=await openPhone(ownName('Relay results lead'),{lead:true});
  await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  // One row per team: Team N and its four children in leg order, then the time and where it ran.
  const board=page.getByRole('list',{name:'Provisional leaderboard',exact:true}),rows=board.locator(':scope > li');
  const team=(number:number,race:number)=>board.getByRole('button',{name:`Team ${number} · ${legs(number).map(String).join(' · ')} · Heat ${race}`,exact:true});
  await expect(team(2,1)).toContainText('14.00');await expect(team(2,1)).toContainText('Heat 1 · 1st in race');await expect(team(2,1)).toContainText('Q');
  await expect(team(5,2)).toContainText('Heat 2 · 1st in race');
  await expect(board.getByRole('button',{name:`Team 4 · ${legs(4)[0]} · ${borrowed} · ${legs(4)[2]} · ${legs(4)[3]} · Heat 1`,exact:true})).not.toContainText('Q');
  // The qualifying line falls after the sixth team, Team 7.
  await expect(rows.nth(5)).toContainText('Team 7');await expect(rows.nth(6)).toHaveText('Qualifying line');
  await expect(page.getByText('Fastest 6 go to the final',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-leaderboard.png'),fullPage:true});
  // The race page lists Heat 1's teams in place of runners, Team 4 with its kept warning.
  await eventTab(page,'Races');await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  await expect(page.getByText('Teams: Team 2 · Team 1 · Team 3 · Team 4',{exact:true})).toBeVisible();
  const record=page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem');
  await expect(record.nth(0)).toContainText(`Team 2${legs(2).join(' · ')}`);await expect(record.nth(0)).toContainText('14.00');
  // Open, so amber, and worded as on the leaderboard.
  const kept=record.nth(3).locator('.record-warning').filter({hasText:String(borrowed)});
  await expect(kept).toHaveText(`${borrowed} is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.`);
  expect(await kept.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(255, 244, 220)');
  // Each team's button keeps its four children on one line, at 360 as at 390.
  const lines=await page.locator('.record-team .result-legs').evaluateAll(all=>all.map(legs=>{
    const range=document.createRange();range.selectNodeContents(legs);
    return new Set([...range.getClientRects()].map(line=>Math.round(line.top))).size;
  }));
  expect(lines).toEqual([1,1,1,1]);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-race-page.png'),fullPage:true});
  await page.getByRole('banner').getByRole('button',{name:/^Back to /}).click();await eventTab(page,'Heats');
  // Heats complete: the line-up is the six fastest teams across the heats.
  await page.getByRole('button',{name:'Heats complete',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Heats complete',exact:true});
  await expect(sheet).toContainText('Nothing to settle');
  await expect(sheet.locator('.stage-creates li')).toHaveText([2,5,1,6,3,7].map((number,index)=>`${['1st','2nd','3rd','4th','5th','6th'][index]}: Team ${number} · ${legs(number).join(' · ')}`));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-heats-complete.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();await eventTab(page,'Final');
  await expect(page.locator('.final-lineup li')).toHaveText([2,5,1,6,3,7].map((number,index)=>`${index+1}: Team ${number} · ${legs(number).join(' · ')}`));
  // The final runs (its race screen is another slice's), then the Final leaderboard and Input - Running name each
  // medal team's four children.
  await markFinalHere(request,token,code,[3,2,5,1,6,7]);await writeTeamOrder(request,token,code,[3,2,5,1,6,7]);await submitRace(request,token,code);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  const winner=page.getByRole('list',{name:'Final leaderboard',exact:true}).getByRole('button',{name:`Team 3 · ${legs(3).join(' · ')} · Final`,exact:true});
  await expect(winner).toContainText('1st');
  // A team on the Final tab opens the same runner sheet, with its final place and "Open final".
  await winner.click();
  const winnerSheet=page.getByRole('dialog',{name:'Team 3',exact:true});
  await expect(winnerSheet).toContainText(`${name} · Girl Cubs · Final · 1st in race`);await expect(winnerSheet.getByRole('button',{name:'Open final',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await winnerSheet.getByRole('button',{name:'Close',exact:true}).click();await expect(winnerSheet).toHaveCount(0);
  await page.getByRole('button',{name:'Final complete',exact:true}).click();
  await page.getByRole('dialog',{name:'Final complete',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('table',{name:'Input - Running',exact:true}).locator('tbody td')).toHaveText([code,...[3,2,5].map(number=>`Team ${number}${legs(number).join('')}`)]);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-final-panel.png'),fullPage:true});
});

/**
 * A Boy Scouts relay for this project with `count` teams typed by a volunteer, each child from this test's own block.
 */
async function scoutsRelay(request:APIRequestContext,info:TestInfo,title:string,count:number) {
  const code=await ownCode(),name=ownName(`${title}`);
  await ownRelay(code,name,'Boy Scouts');
  const n=await ownWristbands('Boy Scouts',count*4),legs=(team:number)=>[1,2,3,4].map(leg=>n((team-1)*4+leg));
  const token=await signInThroughApi(request,ownName(`${title} volunteer`));
  for(let team=1;team<=count;team++) await writeTeam(request,token,code,legs(team));
  /** One phone ticks the teams in, places them in this order with these times, and marks every step done, which saves the heat. */
  async function heat(placed:number[],times:number[]) {
    for(const team of placed) await tickTeam(request,token,code,team);
    await writeTeamOrder(request,token,code,placed);await writeTimes(request,token,code,times);await submitRace(request,token,code);
  }
  return {code,name,legs,heat};
}

test('a lead disqualifies a whole team for a handover outside the zone, and lifts it',async({openPhone,request},info)=>{
  const {code,legs,heat}=await scoutsRelay(request,info,'Relay disqualify',3);
  await heat([1,2,3],[1400,1500,1600]);
  const {page}=await openPhone(ownName('Relay disqualify lead'),{lead:true});
  await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Boy Scouts`)}).click();
  const board=page.getByRole('list',{name:'Provisional leaderboard',exact:true});
  const team1=board.getByRole('button',{name:`Team 1 · ${legs(1).join(' · ')} · Heat 1`,exact:true});
  await team1.click();
  const sheet=page.getByRole('dialog',{name:'Team 1',exact:true});
  await sheet.getByRole('button',{name:'Disqualify Team 1',exact:true}).click();
  // A handover outside the zone goes under Other; the comment is optional, given here.
  await page.getByRole('button',{name:'Other',exact:true}).click();
  await page.getByLabel('Comment (optional)',{exact:true}).fill('Handover outside the zone');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-disqualify.png'),fullPage:true});
  await page.getByRole('button',{name:'Disqualify Team 1',exact:true}).click();await expectToast(page,'Team 1 disqualified · Other');
  await expect(team1).toContainText('Disqualified: Other - Handover outside the zone');
  await expect(board.locator(':scope > li').first()).toContainText('Team 2');
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('disqualified Team 1 (Heat 1): Other - Handover outside the zone');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-disqualified.png'),fullPage:true});
  await eventTab(page,'Heats');await team1.click();
  await expect(sheet.getByRole('button',{name:'Disqualify Team 1',exact:true})).toHaveCount(0);
  await sheet.getByRole('button',{name:'Lift disqualification',exact:true}).click();
  await page.getByLabel('Comment',{exact:true}).fill('Judge saw the baton inside the zone');
  await page.getByRole('button',{name:'Lift disqualification',exact:true}).click();await expectToast(page,'Team 1 counts again');
  await expect(team1).not.toContainText('Disqualified');
  await expect(board.locator(':scope > li').first()).toContainText('Team 1');
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('lifted the disqualification of Team 1 (Heat 1)');
});

test('a lead settles a tie between two teams on the tie screen: a run-off puts Team 7 through',async({openPhone,request},info)=>{
  const {code,legs,heat}=await scoutsRelay(request,info,'Relay tie',8);
  await heat([1,2,3,4],[1400,1500,1600,1700]);
  await heat([5,6,7,8],[1450,1550,1700,1800]);
  const {page}=await openPhone(ownName('Relay tie lead'),{lead:true});
  await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Boy Scouts`)}).click();
  // Team 4 and Team 7 share 6th place at 17.00: one of them misses the final.
  await page.getByRole('button',{name:'TIE at 17.00 for Team 4',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Tie at 17.00',exact:true})).toBeVisible();
  await expect(page.locator('.rz-prompt__meta')).toHaveText(`${ownName('Relay tie')} · Boy Scouts · decides 6th and 7th`);
  await expect(page.locator('.rz-prompt__help')).toHaveText('Team 4 (Heat 1) and Team 7 (Heat 2) both ran 17.00.');
  await page.getByRole('button',{name:'Run-off held',exact:true}).click();
  const order=page.getByRole('list',{name:'Tie order',exact:true});
  await expect(order.getByRole('listitem')).toHaveText([`6thTeam 4Heat 1 · ${legs(4).join(' · ')}`,`7thTeam 7Heat 2 · ${legs(7).join(' · ')}`]);
  await dragTo(page,order.getByRole('button',{name:'Move Team 7',exact:true}),order.getByRole('listitem').first());
  await expect(order.getByRole('listitem').first()).toContainText('Team 7');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-tie-screen.png'),fullPage:true});
  await page.getByRole('button',{name:'Save tie',exact:true}).click();
  await expectToast(page,/^Tie saved · /);
  const rows=page.getByRole('list',{name:'Provisional leaderboard',exact:true}).locator(':scope > li');
  await expect(rows.nth(5)).toContainText('Team 7');await expect(rows.nth(6)).toHaveText('Qualifying line');
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('recorded a run-off at 17.00: Team 7 then Team 4');
  // Settled, the tie no longer holds Heats complete back.
  await eventTab(page,'Heats');await page.getByRole('button',{name:'Heats complete',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Heats complete',exact:true})).toContainText('Nothing to settle');
});

test('a lead corrects a relay heat\'s finishing order by dragging teams, and Didn\'t run makes a team still to run again',async({openPhone,request},info)=>{
  const {code,name,heat}=await scoutsRelay(request,info,'Relay order fix',3);
  await heat([1,2,3],[1400,1500,1600]);
  const {page}=await openPhone(ownName('Relay order fix lead'),{lead:true});
  await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Boy Scouts`)}).click();
  await eventTab(page,'Races');await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  await page.getByRole('button',{name:'Correct finishing order',exact:true}).click();
  const sheet=page.getByRole('dialog'),rows=sheet.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
  await expect(rows).toHaveText(['1st14.00Team 1No place','2nd15.00Team 2No place','3rd16.00Team 3No place']);
  // Times stay by place: Team 2 dragged to 1st takes 1st place's time.
  await dragTo(page,sheet.getByRole('button',{name:'Drag to move Team 2',exact:true}),rows.first());
  await expect(rows).toHaveText(['1st14.00Team 2No place','2nd15.00Team 1No place','3rd16.00Team 3No place']);
  await sheet.getByRole('button',{name:'No place for Team 3',exact:true}).click();
  await expect(sheet.getByText('Team 3 has no place. What happened?',{exact:true})).toBeVisible();
  await expect(sheet.getByText('Didn\'t run takes Team 3 off this race: it is still to run again.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-order-no-place.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Didn\'t run',exact:true}).click();
  await expect(rows).toHaveText(['1st14.00Team 2No place','2nd15.00Team 1No place']);
  // Taken off the race, Team 3 has no row left in it.
  await expect(sheet.getByRole('list',{name:'No place',exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-order-corrected.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Done',exact:true}).click();await expect(sheet).toHaveCount(0);
  await back(page,`${name} · Boy Scouts`);
  await eventTab(page,'Notes');await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').last()).toContainText('corrected the finishing order for Heat 1: Team 2, Team 1; Didn\'t run Team 3');
});
