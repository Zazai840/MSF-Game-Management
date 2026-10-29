import {ownWristbands,ownCode,back,expect,live,lookProblems,openLeadMenu,openRelays,ownRelay,signInThroughApi,submitRace,test,tickTeam,writeTeam,writeTeamOrder,writeTimes} from './fixtures.js';
import type {APIRequestContext,Page} from '@playwright/test';

/** A lead's Results for the relay, then its event page. */
async function openRelayResults(page:Page,code:string) {
  await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Boy Scouts`)}).click();
}
/** One phone ticks the teams in, places them in this order with these times, and marks every step done, which saves the heat. */
async function runHeat(request:APIRequestContext,token:string,code:string,placed:number[],times:number[]) {
  for(const team of placed) await tickTeam(request,token,code,team);
  await writeTeamOrder(request,token,code,placed);await writeTimes(request,token,code,times);await submitRace(request,token,code);
}

test('a lead\'s Correct teams on a saved relay heat fixes a child\'s number, takes a team off and adds one, and the teams sheet shows the fix',async({openPhone,request},info)=>{
  test.setTimeout(60000);
  const project=info.project.name,name=`Correct teams ${project}`,code=await ownCode();
  await ownRelay(code,name,'Boy Scouts');
  // The test day is shared: each project's Boy Scouts wristbands are its own, and no other test types them.
  const n=await ownWristbands('Boy Scouts',16),legs=(team:number)=>[1,2,3,4].map(leg=>n((team-1)*4+leg));
  const volunteer=await openPhone(`Correct teams volunteer ${project}`);
  for(let team=1;team<=3;team++) await writeTeam(request,volunteer.token,code,legs(team),{keptWarnings:legs(team)});
  await runHeat(request,volunteer.token,code,[2,1],[1500,1600]);
  const {page}=await openPhone(`Correct teams lead ${project}`,{lead:true});
  await openRelayResults(page,code);
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  await page.getByRole('button',{name:'Correct teams',exact:true}).click();
  await expect(page.getByRole('button',{name:'Correct runner list',exact:true})).toHaveCount(0);
  const sheet=page.getByRole('dialog',{name:'Correct teams · Heat 1',exact:true});
  // Team 2's 3rd child was typed wrong at the prep area: the fix keeps Team 2's place.
  await sheet.getByRole('button',{name:'Change Team 2',exact:true}).click();
  await sheet.getByLabel('Team 2 3rd leg',{exact:true}).fill(String(n(13)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('correct-teams-edit.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Done',exact:true}).click();
  const fixed=[legs(2)[0],legs(2)[1],n(13),legs(2)[3]];
  await expect(sheet.getByRole('button',{name:'Change Team 2',exact:true})).toHaveText(`Team 2${fixed.join('')}`);
  // Team 1 never ran, and Team 3 did.
  await sheet.getByRole('button',{name:'Take Team 1 off Heat 1',exact:true}).click();
  await sheet.getByRole('button',{name:'Take off',exact:true}).click();
  await expect(sheet.getByRole('button',{name:'Change Team 1',exact:true})).toHaveCount(0);
  await sheet.getByRole('button',{name:'+ Add team',exact:true}).click();
  await expect(sheet.getByRole('button',{name:/^Add Team /})).toHaveText([`Team 1${legs(1).join('')}`,`Team 3${legs(3).join('')}`]);
  await sheet.getByRole('button',{name:'Add Team 3',exact:true}).click();
  await expect(sheet.getByRole('button',{name:/^Change Team /})).toHaveText([`Team 2${fixed.join('')}`,`Team 3${legs(3).join('')}`]);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('correct-teams.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByText('Teams: Team 2 · Team 3',{exact:true})).toBeVisible();
  // Heat 1 is Team 2's latest race, so the teams sheet has the fix: the typo won't come back at the Final.
  await openRelays(volunteer.page);
  await volunteer.page.getByRole('article',{name:`${name} · Boy Scouts`,exact:true}).getByRole('button',{name:/^Teams 3/}).click();
  const team=(number:number)=>volunteer.page.getByRole('list',{name:'Teams',exact:true}).getByRole('listitem').filter({hasText:`Team ${number}`});
  const legsOf=(wristbands:number[])=>wristbands.map((wristband,index)=>`${['1st','2nd','3rd','4th'][index]}${wristband}`).join('');
  await expect(team(2)).toContainText(`Team 2Heat 1 · ran${legsOf(fixed)}`,live);
  await expect(team(1)).toContainText('Team 1Still to run');
  expect(await lookProblems(volunteer.page)).toEqual([]);
  await volunteer.page.screenshot({path:info.outputPath('correct-teams-teams-sheet.png')});
  // Correct number on one child of Team 2, from its leaderboard row: the teams sheet changes live.
  await back(page,`${name} Boy Scouts`);
  await page.getByRole('button',{name:`Team 2 · ${fixed.join(' · ')} · Heat 1`,exact:true}).click();
  await page.getByRole('button',{name:'Correct number',exact:true}).click();
  await page.getByRole('button',{name:`2nd leg · ${legs(2)[1]}`,exact:true}).click();
  await page.getByLabel('New wristband number',{exact:true}).fill(String(n(14)));
  await page.getByRole('button',{name:'Check number',exact:true}).click();
  await expect(page.getByText(`Change ${legs(2)[1]} to ${n(14)} in Team 2?`,{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('correct-number-team.png'),fullPage:true});
  await page.getByRole('button',{name:'Save correction',exact:true}).click();
  await expect(team(2)).toContainText(legsOf([legs(2)[0],n(14),n(13),legs(2)[3]]),live);
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText(`corrected ${legs(2)[1]} to ${n(14)} in Team 2 (Heat 1)`);
});

test('Delete then Restore on a relay heat: its teams are still to run, then a team in two heats ran twice until the lead chooses which result counts',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Relay ran twice ${project}`,code=await ownCode();
  await ownRelay(code,name,'Boy Scouts');
  const n=await ownWristbands('Boy Scouts',12),legs=(team:number)=>[1,2,3,4].map(leg=>n((team-1)*4+leg));
  const token=await signInThroughApi(request,`Relay ran twice volunteer ${project}`);
  for(let team=1;team<=2;team++) await writeTeam(request,token,code,legs(team),{keptWarnings:legs(team)});
  await runHeat(request,token,code,[1,2],[1500,1600]);
  const {page}=await openPhone(`Relay ran twice lead ${project}`,{lead:true});
  await openRelayResults(page,code);
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  await page.getByRole('button',{name:'Delete race',exact:true}).click();
  await page.getByRole('button',{name:'Move to Deleted races',exact:true}).click();
  await expect(page.getByText('Deleted race',{exact:true})).toBeVisible();
  // Heat 1 deleted, Team 1 is still to run, and runs again in Heat 2.
  await runHeat(request,token,code,[1],[1450]);
  await page.getByRole('button',{name:'Restore race',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm restore',exact:true}).click();
  await expect(page.getByRole('button',{name:'Re-run race',exact:true})).toBeVisible();
  await back(page,`${name} Boy Scouts`);
  const row=(heat:number)=>page.getByRole('button',{name:`Team 1 · ${legs(1).join(' · ')} · Heat ${heat}`,exact:true});
  await expect(row(1)).toContainText('Ran twice in this event');await expect(row(2)).toContainText('Ran twice in this event');
  await row(2).click();
  await page.getByRole('button',{name:'Choose which result counts',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Choose the result that counts for Team 1.');
  await page.getByLabel('Count Heat 2',{exact:true}).check();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-choose-result.png'),fullPage:true});
  await page.getByRole('button',{name:'Save counted result',exact:true}).click();
  await expect(row(1)).toContainText('Not counted');await expect(row(2)).not.toContainText('Ran twice in this event');
  await expect(page.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText('counted Team 1 from Heat 2; Heat 1 not counted');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-ran-twice-settled.png'),fullPage:true});
});
