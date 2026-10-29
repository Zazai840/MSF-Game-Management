import {ownWristbands,ownCode,openRelays,expect,live,lookProblems,openLeadMenu,openRaceScreen,ownRelay,submitRace,test,tickTeam,writeTeam,writeTeamOrder,writeTimes,type Page} from './fixtures.js';

/** A team's block in Check-in Teams, ticked or Absent. */
const team=(page:Page,number:number)=>page.locator('.ci-list > div').filter({has:page.getByText(`Team ${number}`,{exact:true})});

test('a relay Final on two phones and a lead: six seeded teams ticked, one Absent, the call-up live, a child swapped with Edit, the order only, then the medal teams with four wristbands each',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Relay final ${project}`,code=await ownCode();
  await ownRelay(code,name,'Girl Scouts');
  const n=await ownWristbands('Girl Scouts',40),legs=(number:number)=>[1,2,3,4].map(leg=>n((number-1)*4+leg)),swapped=n(36);
  const sam=await openPhone(`Sam Patel final ${project}`),priyaName=`Priya Shah final ${project}`,priya=await openPhone(priyaName);
  const lead=await openPhone(`Jo Evans final ${project}`,{lead:true});
  for(let number=1;number<=7;number++) await writeTeam(request,sam.token,code,legs(number),{keptWarnings:legs(number)});
  // Two heats: Teams 2, 5, 1, 6, 3 and 7 are the six fastest, Team 4 is 7th.
  for(const [placed,times] of [[[2,1,3,4],[1400,1500,1700,1900]],[[5,6,7],[1450,1600,1800]]]) {
    for(const number of placed) await tickTeam(request,sam.token,code,number);
    await writeTeamOrder(request,sam.token,code,placed);await writeTimes(request,sam.token,code,times);await submitRace(request,sam.token,code);
  }
  expect((await request.post(`/api/lead/events/${code}/complete-stage`,{headers:{authorization:`Bearer ${lead.token}`},data:{stage:'heats'}})).ok()).toBe(true);
  // Home's tile reads just Final.
  await openRelays(priya.page);
  await expect(priya.page.getByRole('region',{name,exact:true}).getByRole('button')).toHaveText('Girl ScoutsFinal',live);
  for(const phone of [sam,priya]) {
    await openRelays(phone.page);
    await openRaceScreen(phone.page,name,'Girl Scouts');
    await expect(phone.page.locator('.race-line')).toHaveText('Final · 6 teams');
    await phone.page.getByRole('button',{name:/^Check-in Teams/}).click();
  }
  // The six seeded teams are already ticked, by seed; there is no picking from teams still to run.
  const heads=(page:Page)=>page.locator('.ci-list > div .ci-row-text');
  await expect(heads(sam.page)).toHaveText([[2,'1st'],[5,'2nd'],[1,'3rd'],[6,'4th'],[3,'5th'],[7,'6th']].map(([number,seed])=>`Team ${number}${seed} seed0 of 4 here`));
  await expect(sam.page.getByRole('button',{name:'Cancel Team 2',exact:true})).toHaveCount(0);
  // Team 5 isn't here: one tap marks it Absent on every phone, freeing its seed.
  await sam.page.getByRole('button',{name:'Team 5 Absent',exact:true}).click();
  await expect(team(priya.page,5)).toHaveText('Team 52nd seed · Absent · tap if here',live);
  await expect(priya.page.locator('.race-line')).toHaveText('Final · 5 teams');
  // The lead calls up the next-ranked team: it appears ticked on both phones.
  await openLeadMenu(lead.page,'Results');
  await lead.page.getByRole('button',{name:new RegExp(`^${code} · Girl Scouts`)}).click();
  await lead.page.getByRole('button',{name:'Call up next-ranked team: Team 4 (7th)',exact:true}).click();
  await expect(lead.page.locator('.final-lineup li').last()).toHaveText(`2: Team 4 · ${legs(4).join(' · ')} · Called up from heat rank 7`);
  for(const phone of [sam,priya]) await expect(team(phone.page,4).locator('.ci-row-text')).toHaveText('Team 4Called up0 of 4 here',live);
  expect(await lookProblems(lead.page)).toEqual([]);
  await lead.page.screenshot({path:info.outputPath('relay-final-call-up.png'),fullPage:true});
  // Sam swaps Team 2's 3rd leg with Edit, then the children arrive: Team 1 is one short, in amber.
  await sam.page.getByRole('button',{name:'Edit Team 2',exact:true}).click();
  await sam.page.getByLabel('Team 2 3rd leg',{exact:true}).fill(String(swapped));
  await sam.page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(team(priya.page,2).locator('.ci-leg-w')).toHaveText([legs(2)[0],legs(2)[1],swapped,legs(2)[3]].map(String),live);
  for(const leg of ['1st','2nd','3rd']) await team(sam.page,1).getByRole('button',{name:new RegExp(`^${leg} `)}).click();
  await expect(team(priya.page,1).locator('.is-short')).toHaveText('3 of 4 here',live);
  expect(await lookProblems(sam.page)).toEqual([]);
  await sam.page.screenshot({path:info.outputPath('relay-final-check-in.png'),fullPage:true});
  // The orderer has only the finishing order, and only the teams not Absent.
  const order=priya.page.getByRole('button',{name:/^Finishing order/});
  await order.click();
  await expect(priya.page.getByRole('button',{name:'Do the times'})).toHaveCount(0);
  const buttons=priya.page.locator('.race-numbers').getByRole('button');
  await expect(buttons).toHaveCount(6);
  await expect(buttons.filter({hasText:'Team 5'})).toHaveCount(0);
  // A Final's teams are its seeds, call-ups and a lead's additions: none is added at the finish.
  await expect(priya.page.getByRole('button',{name:'Add team',exact:true})).toHaveCount(0);
  for(const number of [3,2,4,1,6,7]) await buttons.filter({hasText:new RegExp(`Team ${number}$`)}).click();
  expect(await lookProblems(priya.page)).toEqual([]);
  await priya.page.screenshot({path:info.outputPath('relay-final-order.png'),fullPage:true});
  // Only the order holder is asked: her one press saves the Final.
  await expect(sam.page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  await priya.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await expect(sam.page.getByText('Final saved',{exact:true})).toBeVisible(live);
  // The Final leaderboard shows the medal teams, each with the four children who ran it; Team 5 has left the Final.
  await lead.page.getByRole('button',{name:'Refresh',exact:true}).click();
  const board=lead.page.getByRole('list',{name:'Final leaderboard',exact:true});
  await expect(board.getByRole('button')).toHaveCount(6);
  for(const [index,number,wristbands] of [[0,3,legs(3)],[1,2,[legs(2)[0],legs(2)[1],swapped,legs(2)[3]]],[2,4,legs(4)]] as const) await expect(board.getByRole('button').nth(index)).toHaveAccessibleName(`Team ${number} · ${wristbands.join(' · ')} · Final`);
  expect(await lookProblems(lead.page)).toEqual([]);
  await lead.page.screenshot({path:info.outputPath('relay-final-leaderboard.png'),fullPage:true});
});

test('a lead adds a team to a relay Final by picking it from the relay\'s teams, and it shows Added at check-in',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Relay final add ${project}`,code=await ownCode();
  await ownRelay(code,name,'Girl Scouts');
  const n=await ownWristbands('Girl Scouts',20),legs=(number:number)=>[1,2,3,4].map(leg=>n((number-1)*4+leg));
  const sam=await openPhone(`Sam Patel final add ${project}`),lead=await openPhone(`Jo Evans final add ${project}`,{lead:true});
  // Two teams run the heat, and Team 3 is typed after it: a lead adds it to the Final.
  for(let number=1;number<=2;number++) await writeTeam(request,sam.token,code,legs(number),{keptWarnings:legs(number)});
  for(const number of [1,2]) await tickTeam(request,sam.token,code,number);
  await writeTeamOrder(request,sam.token,code,[1,2]);await writeTimes(request,sam.token,code,[1400,1500]);await submitRace(request,sam.token,code);
  await writeTeam(request,sam.token,code,legs(3),{keptWarnings:legs(3)});
  expect((await request.post(`/api/lead/events/${code}/complete-stage`,{headers:{authorization:`Bearer ${lead.token}`},data:{stage:'heats'}})).ok()).toBe(true);
  await openRelays(sam.page);
  await openRaceScreen(sam.page,name,'Girl Scouts');
  await sam.page.getByRole('button',{name:/^Check-in Teams/}).click();
  await openLeadMenu(lead.page,'Results');
  await lead.page.getByRole('button',{name:new RegExp(`^${code} · Girl Scouts`)}).click();
  await lead.page.getByRole('button',{name:'Add a team to the final',exact:true}).click();
  // The pick list is the relay's teams not in the Final yet.
  const picks=lead.page.locator('.final-add .pick-list').getByRole('button');
  await expect(picks).toHaveText([`Team 3${legs(3).join(' · ')}`]);
  expect(await lookProblems(lead.page)).toEqual([]);
  await lead.page.screenshot({path:info.outputPath('relay-final-add-team.png'),fullPage:true});
  await picks.first().click();
  await expect(lead.page.locator('.final-lineup li').last()).toHaveText(`Team 3 · ${legs(3).join(' · ')} · Added team`);
  await expect(team(sam.page,3).locator('.ci-row-text')).toHaveText('Team 3Added0 of 4 here',live);
});
