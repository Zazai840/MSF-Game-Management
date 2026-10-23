import { back,dashboardMenuButton,expect,lookProblems,markHere,openDashboard,ownRelay,signInThroughApi,submitRace,test,tickTeam,toCheckItem,writeTeam,writeTeamOrder,writeTimes } from './fixtures.js';

test('To check names relay teams: a kept wrong-Section number, a child in two relays and a team that ran short clear with Mark checked, a team added at the finish with Mark addition checked',async({openPhone,request},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),cubs=`TCC-${project.toUpperCase()}`,scouts=`TCS-${project.toUpperCase()}`;
  const name=`To check relay ${project}`;
  await ownRelay(cubs,name,'Girl Cubs');await ownRelay(scouts,name,'Girl Scouts');
  // The test day is shared: each project's children use wristbands no other relay test types.
  const cub=(n:number)=>2740+at*16+n,scout=(n:number)=>4340+at*16+n,borrowed=1740+at,shared=cub(7);
  const token=await signInThroughApi(request,`To check relay volunteer ${project}`);
  await writeTeam(request,token,cubs,[cub(1),borrowed,cub(2),cub(3)],{keptWarnings:[borrowed]});
  await writeTeam(request,token,cubs,[cub(4),cub(5),cub(6),shared]);
  await writeTeam(request,token,cubs,[cub(8),cub(9),cub(10),cub(11)]);
  await writeTeam(request,token,cubs,[cub(12),cub(13),cub(14),cub(15)]);
  await writeTeam(request,token,scouts,[scout(1),shared,scout(2),scout(3)],{keptWarnings:[shared]});
  // Teams 1 to 3 are checked in, Team 3 with one child not marked here; Team 4 crosses the line unchecked.
  for(const team of [1,2,3]) {await tickTeam(request,token,cubs,team);for(let leg=1;leg<=(team===3?3:4);leg++) await markHere(request,token,cubs,team,leg);}
  await writeTeamOrder(request,token,cubs,[1,2,3],{addedTeams:[4]});await writeTimes(request,token,cubs,[1400,1500,1600,1700]);await submitRace(request,token,cubs);

  const {page}=await openPhone(`To check relay lead ${project}`,{lead:true});
  await openDashboard(page);
  const race=`${cubs} · ${name} Girl Cubs · Heat 1`;
  const item=(text:string)=>toCheckItem(page,new RegExp(`^${race} [0-9:]+ ${text.replace(/[.]/g,'\\.')} Open race$`));
  const wrongNumber=item(`A wristband number needs checking In Team 1: ${borrowed} is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999. Correct it or mark it checked.`);
  const twoRelays=item(`A child is in two relays ${shared} is in Girl Cubs Team 2 and Girl Scouts Team 1.`);
  const ranShort=item('A team ran short Team 3 ran with 3 of 4 children marked here.');
  const added=item('A team was added at the finish Team 4 crossed the line but was not checked in at the start. Check it ran in this race.');
  for(const each of [wrongNumber,twoRelays,ranShort,added]) await expect(each).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-to-check.png'),fullPage:true});

  /** Opens the item, presses the button on the team's actions sheet, and is back on To check with the item gone. */
  async function settle(item:ReturnType<typeof toCheckItem>,team:number,button:string,offers:{wrongSection:boolean}={wrongSection:false}) {
    await item.click();
    const sheet=page.getByRole('dialog',{name:`Actions for Team ${team}`,exact:true});
    await expect(sheet.getByRole('button',{name:'Disqualify for wrong section or age',exact:true})).toHaveCount(offers.wrongSection?1:0);
    if(team===1) {expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('relay-team-actions.png'),fullPage:true});}
    await sheet.getByRole('button',{name:button,exact:true}).click();await expect(sheet).toHaveCount(0);
    await back(page,'Dashboard');
    await expect(item).toHaveCount(0);
  }
  await settle(wrongNumber,1,'Mark checked',{wrongSection:true});
  await settle(twoRelays,2,'Mark checked');
  await settle(ranShort,3,'Mark checked');
  await settle(added,4,'Mark addition checked');
  // Each team's row keeps its warnings, now checked.
  await dashboardMenuButton(page,'Results').click();
  await page.getByRole('button',{name:new RegExp(`^${cubs} · Girl Cubs`)}).click();
  const board=page.getByRole('list',{name:'Provisional leaderboard',exact:true});
  await expect(board.locator('.checked-warning')).toHaveText([`${borrowed} is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.`,`${shared} is in Girl Cubs Team 2 and Girl Scouts Team 1.`,'Team 3 ran with 3 of 4 children marked here.','Added at the finish']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-checked-rows.png'),fullPage:true});
});

test('a lead sees a relay\'s two saved heats as team rows with four wristbands and the qualifying line, the race page lists teams, and Heats complete seeds the six fastest',async({openPhone,request},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),name=`Relay results ${project}`,code=`RRS-${project.toUpperCase()}`;
  await ownRelay(code,name,'Girl Cubs');
  // The test day is shared: each project's teams use Girl Cubs wristbands no other relay test types, and Team 4 runs a
  // borrowed Boy Cub, kept.
  const legs=(team:number)=>[1,2,3,4].map(leg=>2000+at*30+(team-1)*4+leg),borrowed=1060+at;
  const token=await signInThroughApi(request,`Relay results volunteer ${project}`);
  for(let team=1;team<=7;team++) await writeTeam(request,token,code,team===4?[legs(4)[0],borrowed,legs(4)[2],legs(4)[3]]:legs(team),{keptWarnings:team===4?[borrowed]:[]});
  /** One phone ticks the teams in, places them in this order with these times, and presses Submit Race. */
  async function heat(placed:number[],times:number[]) {
    for(const team of placed) await tickTeam(request,token,code,team);
    await writeTeamOrder(request,token,code,placed);await writeTimes(request,token,code,times);await submitRace(request,token,code);
  }
  await heat([2,1,3,4],[1400,1500,1700,1900]);
  await heat([5,6,7],[1450,1600,1800]);
  const {page}=await openPhone(`Relay results lead ${project}`,{lead:true});
  await openDashboard(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  // One row per team: Team N and its four children in leg order, then the time and where it ran.
  const board=page.getByRole('list',{name:'Provisional leaderboard',exact:true}),rows=board.locator(':scope > li');
  const team=(number:number,race:number)=>board.getByRole('button',{name:`Team ${number} · ${legs(number).map(String).join(' · ')} · Heat ${race}`,exact:true});
  await expect(team(2,1)).toContainText('14.00');await expect(team(2,1)).toContainText('Heat 1 · 1st in race');await expect(team(2,1)).toContainText('Q');
  await expect(team(5,2)).toContainText('Heat 2 · 1st in race');
  await expect(board.getByRole('button',{name:`Team 4 · ${legs(4)[0]} · ${borrowed} · ${legs(4)[2]} · ${legs(4)[3]} · Heat 1`,exact:true})).not.toContainText('Q');
  // The qualifying line falls after the sixth team, Team 7.
  await expect(rows.nth(5)).toContainText('Team 7');await expect(rows.nth(6)).toHaveText('Qualifying line');
  await expect(page.getByText('Top 8 highlighted · Q: fastest 6',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-leaderboard.png'),fullPage:true});
  // The race page lists Heat 1's teams in place of runners, Team 4 with its kept warning.
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  await expect(page.getByText('Teams: Team 2 · Team 1 · Team 3 · Team 4',{exact:true})).toBeVisible();
  const record=page.getByRole('list',{name:'Current record',exact:true}).getByRole('listitem');
  await expect(record.nth(0)).toContainText(`Team 2${legs(2).join(' · ')}`);await expect(record.nth(0)).toContainText('14.00');
  await expect(record.nth(3)).toContainText(`${borrowed} is not a Girl Cubs number.`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-race-page.png'),fullPage:true});
  await page.getByRole('navigation',{name:'Back',exact:true}).getByRole('button').click();
  // Heats complete: the line-up is the six fastest teams across the heats.
  await page.getByRole('button',{name:'Heats complete',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Heats complete',exact:true});
  await expect(sheet).toContainText('Nothing to settle');
  await expect(sheet.locator('.stage-creates li')).toHaveText([2,5,1,6,3,7].map((number,index)=>`${['1st','2nd','3rd','4th','5th','6th'][index]}: Team ${number} · ${legs(number).join(' · ')}`));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-heats-complete.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.locator('.final-lineup li')).toHaveText([2,5,1,6,3,7].map((number,index)=>`${index+1}: Team ${number} · ${legs(number).join(' · ')}`));
  // The final runs (its race screen is another slice's), then the Final leaderboard and Input - Running name each
  // medal team's four children.
  await writeTeamOrder(request,token,code,[3,2,5,1,6,7]);await submitRace(request,token,code);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('list',{name:'Final leaderboard',exact:true}).getByRole('button',{name:`Team 3 · ${legs(3).join(' · ')} · Final`,exact:true})).toContainText('1st');
  await page.getByRole('button',{name:'Final complete',exact:true}).click();
  await page.getByRole('dialog',{name:'Final complete',exact:true}).getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(page.getByRole('table',{name:'Input - Running',exact:true}).locator('tbody td')).toHaveText([code,...[3,2,5].map(number=>`Team ${number}${legs(number).join('')}`)]);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-final-panel.png'),fullPage:true});
});
