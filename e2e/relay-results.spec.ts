import { expect,lookProblems,openDashboard,ownRelay,signInThroughApi,submitRace,test,tickTeam,writeTeam,writeTeamOrder,writeTimes } from './fixtures.js';

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
