import { expect,live,lookProblems,markHere,openRaceScreen,openTeam,openTeams,ownRelay,submitRace,test,tickTeam,writeTeam,writeTeamOrder,writeTimes,type Page } from './fixtures.js';

/** A relay's card on the Teams screen, by its distance heading and Section. */
const card=(page:Page,name:string,section:string)=>page.getByRole('region',{name,exact:true}).getByRole('button',{name:new RegExp(`^${section}`)});
/** The four read-only wristbands of a team on the Teams screen, as shown. */
const legs=(page:Page,name:string,team:number)=>page.getByRole('region',{name,exact:true}).locator('.team-row').filter({has:page.getByText(`Team ${team}`,{exact:true})}).locator('.leg-ro');

test('two phones hold two relays on the Teams screen at once, and a third sees who is entering read-only and takes over after a confirm',async({openPhone},info)=>{
  const project=info.project.name,code=project.toUpperCase(),name=`Teams hold ${project}`;
  await ownRelay(`TH1-${code}`,name,'Girl Cubs');await ownRelay(`TH2-${code}`,name,'Boy Cubs');
  const sam=`Sam Patel ${project}`,priya=`Priya Shah ${project}`,ali=`Ali Khan ${project}`;
  const samPhone=(await openPhone(sam)).page,priyaPhone=(await openPhone(priya)).page,aliPhone=(await openPhone(ali)).page;
  for(const page of [samPhone,priyaPhone,aliPhone]) await openTeams(page);
  await expect(card(samPhone,name,'Girl Cubs')).toContainText('No teams yet · open to start');
  await card(samPhone,name,'Girl Cubs').click();
  await expect(card(samPhone,name,'Girl Cubs')).toContainText('You are entering · No teams yet');
  await card(priyaPhone,name,'Boy Cubs').click();
  await expect(card(priyaPhone,name,'Boy Cubs')).toContainText('You are entering · No teams yet');
  // Both holds stand side by side.
  await expect(card(samPhone,name,'Boy Cubs')).toContainText(`${priya} is entering`,live);
  await expect(card(priyaPhone,name,'Girl Cubs')).toContainText(`${sam} is entering`,live);
  expect(await lookProblems(samPhone)).toEqual([]);
  await samPhone.screenshot({path:info.outputPath('teams-holder.png'),fullPage:true});
  // Ali sees Sam's relay read-only, with Take over.
  await expect(card(aliPhone,name,'Girl Cubs')).toContainText(`${sam} is entering · No teams yet`,live);
  await card(aliPhone,name,'Girl Cubs').click();
  await expect(aliPhone.getByText(`${sam} is entering. You see it read-only.`,{exact:true})).toBeVisible();
  await expect(aliPhone.getByRole('button',{name:'+ Add team',exact:true})).toHaveCount(0);
  await aliPhone.getByRole('button',{name:'Take over the teams',exact:true}).click();
  await expect(aliPhone.getByText(`Take over the teams from ${sam}?`,{exact:false})).toBeVisible();
  expect(await lookProblems(aliPhone)).toEqual([]);
  await aliPhone.screenshot({path:info.outputPath('teams-take-over.png'),fullPage:true});
  await aliPhone.getByRole('button',{name:'Take over',exact:true}).click();
  await expect(card(aliPhone,name,'Girl Cubs')).toContainText('You are entering');
  await expect(aliPhone.getByRole('button',{name:'+ Add team',exact:true})).toBeVisible();
  await expect(card(samPhone,name,'Girl Cubs')).toContainText(`${ali} is entering`,live);
  await expect(samPhone.getByRole('button',{name:'+ Add team',exact:true})).toHaveCount(0);
  // Priya's relay is still hers.
  await expect(card(aliPhone,name,'Boy Cubs')).toContainText(`${priya} is entering`);
});

test('a team typed on one phone reaches the others on Done; Cancel leaves nothing, a duplicate is refused and a wrong-Section number is kept',async({openPhone},info)=>{
  const project=info.project.name,name=`Teams typing ${project}`,at=['iPhone','Android','desktop'].indexOf(project);
  // The test day is shared: each project types its own wristbands, so no child is also in another project's relay.
  const n=(number:number)=>String(number+at*200),cub=String(1045+at);
  await ownRelay(`TT-${project.toUpperCase()}`,name,'Girl Cubs');
  const sam=`Sam Patel typing ${project}`;
  const samPhone=(await openPhone(sam)).page,priyaPhone=(await openPhone(`Priya Shah typing ${project}`)).page;
  for(const page of [samPhone,priyaPhone]) await openTeams(page);
  await card(samPhone,name,'Girl Cubs').click();
  await expect(card(priyaPhone,name,'Girl Cubs')).toContainText(`${sam} is entering`,live);
  await card(priyaPhone,name,'Girl Cubs').click();
  const box=(team:string,leg:string)=>samPhone.getByLabel(`${team} ${leg} leg`,{exact:true});
  const add=samPhone.getByRole('button',{name:'+ Add team',exact:true}),done=samPhone.getByRole('button',{name:'Done',exact:true});
  // Cancel on a new team leaves no team behind.
  await add.click();
  await box('New team','1st').fill(n(2101));
  await samPhone.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(box('New team','1st')).toHaveCount(0);
  await expect(samPhone.getByRole('region',{name,exact:true}).locator('.team-row')).toHaveCount(0);
  // A half-typed team is kept; the other phone sees it only on Done.
  await add.click();
  await box('New team','1st').fill(n(2101));await box('New team','2nd').fill(n(2134));await box('New team','4th').fill(n(2150));
  expect(await lookProblems(samPhone)).toEqual([]);
  await samPhone.screenshot({path:info.outputPath('teams-typing.png'),fullPage:true});
  await expect(priyaPhone.getByRole('region',{name,exact:true}).locator('.team-row')).toHaveCount(0);
  await done.click();
  await expect(legs(samPhone,name,1)).toHaveText([n(2101),n(2134),'-',n(2150)]);
  await expect(samPhone.getByText('Tap a team to change it.',{exact:true})).toBeVisible();
  await expect(legs(priyaPhone,name,1)).toHaveText([n(2101),n(2134),'-',n(2150)],live);
  await expect(card(priyaPhone,name,'Girl Cubs')).toContainText(`${sam} is entering · 1 team · Team 1 is 3 of 4`);
  // A number already in another team of the relay is refused as it is typed: only Fix number.
  await add.click();
  await box('New team','1st').fill(n(2134));
  await expect(samPhone.getByRole('alert')).toContainText(`${n(2134)} is already in Team 1. Check the wristband.`);
  await expect(done).toBeDisabled();
  await samPhone.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(box('New team','1st')).toHaveValue('');
  // Another Section's number shows amber once the box is left, and Keep lets Done save it.
  await box('New team','1st').fill(cub);
  await box('New team','2nd').fill(n(2201));
  await expect(samPhone.getByRole('alert')).toContainText(`${cub} is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.`);
  await expect(done).toBeDisabled();
  expect(await lookProblems(samPhone)).toEqual([]);
  await samPhone.screenshot({path:info.outputPath('teams-warning.png'),fullPage:true});
  await samPhone.getByRole('button',{name:'Keep',exact:true}).click();
  await done.click();
  await expect(legs(priyaPhone,name,2)).toHaveText([cub,n(2201),'-','-'],live);
  // Tapping a team opens its four boxes; Done changes it on every phone.
  await samPhone.getByRole('button',{name:'Change Team 1',exact:true}).click();
  await expect(box('Team 1','1st')).toHaveValue(n(2101));
  await box('Team 1','3rd').fill(n(2187));
  await done.click();
  await expect(legs(priyaPhone,name,1)).toHaveText([n(2101),n(2134),n(2187),n(2150)],live);
  await expect(card(priyaPhone,name,'Girl Cubs')).toContainText(`${sam} is entering · 2 teams · Team 2 is 2 of 4`);
});

test('the Teams button on Home\'s Relays tab counts every team and those not complete, live',async({openPhone,request},info)=>{
  const project=info.project.name,code=`TB-${project.toUpperCase()}`;
  await ownRelay(code,`Teams badge ${project}`,'Boy Scouts');
  const {page}=await openPhone(`Teams badge ${project}`),writer=await openPhone(`Teams badge writer ${project}`);
  await page.getByRole('tab',{name:'Relays',exact:true}).click();
  const teams=page.getByRole('button',{name:/^Teams Type each relay's teams at the prep area/});
  await expect(teams).toBeVisible();
  // The test day is shared, so other tests' teams count too: read the badge first.
  const badge=teams.locator('.badge'),before=(await badge.count())?await badge.innerText():'';
  const [count,short]=[Number(before.match(/^(\d+) team/)?.[1]||0),Number(before.match(/(\d+) not complete/)?.[1]||0)];
  // Another project's badge test may hold the same children: keep any warning.
  await writeTeam(request,writer.token,code,[3101,3102,3103,null],{keptWarnings:[3101,3102,3103]});
  await expect(badge).toHaveText(`${count+1} ${count?'teams':'team'} · ${short+1} not complete`,live);
  await expect(page.getByRole('region',{name:`Teams badge ${project}`,exact:true}).getByRole('button')).toHaveText('Boy ScoutsHeat 1 · 1 team to run');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('home-teams-button.png'),fullPage:true});
  // The Teams screen's back arrow returns to the Relays tab.
  await teams.click();
  await expect(page.getByRole('heading',{level:1,name:'Teams',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Home',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Relays',exact:true})).toHaveAttribute('aria-selected','true');
});

/** From Home: the Relays tab, then the relay's tile, and waits for its race screen. */
async function openRelay(page:Page,name:string,section:string) {
  await page.getByRole('tab',{name:'Relays',exact:true}).click();
  await openRaceScreen(page,name,section);
}
/** The Check-in Teams card's body on a race screen, opened. */
async function openCheckIn(page:Page) {
  await page.getByRole('button',{name:/^Check-in Teams/}).click();
}

test('two phones check in one relay heat at once: ticks and here marks from both land, live, with the amber 3 of 4 here and Cancel',async({openPhone,request},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),name=`Relay check-in ${project}`,code=`RCI-${project.toUpperCase()}`;
  // The test day is shared: each project types its own wristbands.
  const n=(number:number)=>number+at*200;
  await ownRelay(code,name,'Girl Cubs');
  const sam=await openPhone(`Sam Patel check-in ${project}`),priya=await openPhone(`Priya Shah check-in ${project}`),jo=await openPhone(`Jo Evans check-in ${project}`);
  // Another test's relay may hold the same children: keep any warning.
  await writeTeam(request,sam.token,code,[n(2101),n(2134),n(2187),n(2150)],{keptWarnings:[n(2101),n(2134),n(2187),n(2150)]});
  await writeTeam(request,sam.token,code,[n(2201),n(2202),null,n(2204)],{keptWarnings:[n(2201),n(2202),n(2204)]});
  // Jo watches Home: the tile counts the teams to run, then the teams ticked, live.
  await jo.page.getByRole('tab',{name:'Relays',exact:true}).click();
  const tile=jo.page.getByRole('region',{name,exact:true}).getByRole('button');
  await expect(tile).toHaveText('Girl CubsHeat 1 · 2 teams to run');
  for(const phone of [sam,priya]) {await openRelay(phone.page,name,'Girl Cubs');await openCheckIn(phone.page);}
  const card=(page:Page)=>page.getByRole('button',{name:/^Check-in Teams/});
  await expect(sam.page.locator('.race-line')).toHaveText('Heat 1 · 0 teams');
  await expect(sam.page.getByText('Tick the teams running heat 1, then tap each child as they arrive.',{exact:true})).toBeVisible();
  await expect(sam.page.getByRole('button',{name:/^Team 2 /})).toContainText(`${n(2201)} · ${n(2202)} · - · ${n(2204)} · 3 of 4`);
  await expect(sam.page.getByRole('button',{name:'Do the check-in'})).toHaveCount(0);
  await expect(sam.page.getByText(/is checking in/)).toHaveCount(0);
  expect(await lookProblems(sam.page)).toEqual([]);
  await sam.page.screenshot({path:info.outputPath('check-in-teams.png'),fullPage:true});
  // Sam ticks Team 1 while Priya ticks Team 2: both land on both phones.
  await Promise.all([sam.page.getByRole('button',{name:/^Team 1 /}).click(),priya.page.getByRole('button',{name:/^Team 2 /}).click()]);
  for(const phone of [sam,priya]) {
    await expect(phone.page.locator('.race-line')).toHaveText('Heat 1 · 2 teams',live);
    await expect(card(phone.page)).toContainText('2 teams in · 0 of 8 here',live);
  }
  await expect(tile).toHaveText('Girl CubsHeat 1 · Checking in · 2 teams',live);
  // A just-ticked team with nobody here shows Cancel; Priya taps children of Team 1 while Sam taps Team 2's.
  const legButton=(page:Page,team:number,leg:string)=>page.locator('.ci-team').filter({has:page.getByText(`Team ${team}`,{exact:true})}).getByRole('button',{name:new RegExp(`^${leg} `)});
  await expect(sam.page.getByRole('button',{name:'Cancel Team 1',exact:true})).toBeVisible();
  await Promise.all([legButton(priya.page,1,'1st').click(),legButton(sam.page,2,'1st').click()]);
  await legButton(priya.page,1,'2nd').click();
  await legButton(priya.page,1,'4th').click();
  await expect(legButton(sam.page,1,'1st')).toHaveText(`1st${n(2101)}Here`,live);
  await expect(legButton(sam.page,1,'3rd')).toHaveText(`3rd${n(2187)}Tap when here`);
  await expect(legButton(priya.page,2,'1st')).toHaveAttribute('aria-pressed','true',live);
  await expect(sam.page.getByText('3 of 4 here. A team can run short: a lead sees it in To check.',{exact:true})).toBeVisible(live);
  await expect(card(priya.page)).toContainText('2 teams in · 4 of 8 here',live);
  // Once a child is here, Cancel goes until they are unmarked.
  await expect(sam.page.getByRole('button',{name:'Cancel Team 1',exact:true})).toHaveCount(0,live);
  expect(await lookProblems(sam.page)).toEqual([]);
  await sam.page.screenshot({path:info.outputPath('check-in-teams-here.png'),fullPage:true});
  // The last tap on a child wins: Sam unmarks the 4th leg Priya marked.
  await legButton(sam.page,1,'4th').click();
  await expect(legButton(priya.page,1,'4th')).toHaveAttribute('aria-pressed','false',live);
  // Cancel on Team 2 after its child is unmarked takes it off on both phones, and Jo's tile follows.
  await legButton(sam.page,2,'1st').click();
  await sam.page.getByRole('button',{name:'Cancel Team 2',exact:true}).click();
  await expect(priya.page.locator('.race-line')).toHaveText('Heat 1 · 1 team',live);
  await expect(priya.page.getByRole('button',{name:/^Team 2 /})).toHaveAttribute('aria-pressed','false');
  await expect(tile).toHaveText('Girl CubsHeat 1 · Checking in · 1 team',live);
  // A tap through the API as another phone shows too.
  await markHere(request,jo.token,code,1,3);
  await expect(legButton(sam.page,1,'3rd')).toHaveText(`3rd${n(2187)}Here`,live);
});

test('a relay with no teams says where they are typed, and the Teams screen shows a team in the heat read-only',async({openPhone,request},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),name=`Relay in heat ${project}`,code=`RIH-${project.toUpperCase()}`;
  await ownRelay(code,name,'Boy Cubs');
  const sam=await openPhone(`Sam Patel in heat ${project}`),priya=await openPhone(`Priya Shah in heat ${project}`);
  await openRelay(sam.page,name,'Boy Cubs');
  await openCheckIn(sam.page);
  await expect(sam.page.getByText('No teams yet. They are typed on the Teams screen at the prep area.',{exact:true})).toBeVisible();
  const wristbands=[1101,1102,1103,1104].map(number=>number+at*10);
  await writeTeam(request,priya.token,code,wristbands,{keptWarnings:wristbands});
  await expect(sam.page.getByRole('button',{name:/^Team 1 /})).toBeVisible(live);
  await tickTeam(request,sam.token,code,1);
  await expect(sam.page.getByText('Every other team has run.',{exact:true})).toBeVisible(live);
  // Priya holds the relay on the Teams screen: Team 1 reads In heat 1 and can't be tapped.
  await openTeams(priya.page);
  await card(priya.page,name,'Boy Cubs').click();
  const row=priya.page.getByRole('region',{name,exact:true}).locator('.team-row').filter({has:priya.page.getByText('Team 1',{exact:true})});
  await expect(row).toContainText('In heat 1');
  await expect(priya.page.getByRole('button',{name:'Change Team 1',exact:true})).toHaveCount(0);
  expect(await lookProblems(priya.page)).toEqual([]);
  await priya.page.screenshot({path:info.outputPath('teams-in-heat.png'),fullPage:true});
});

/** Wristbands for the "is changing" tests: Girl Cubs numbers no other test or project uses, so no Keep is needed. */
const changingWristband=(project:string,offset:number)=>2700+['iPhone','Android','desktop'].indexOf(project)*40+offset;
/** The ids of a relay's teams, in number order, from the Home snapshot a team write answers. */
const teamIds=(home:Awaited<ReturnType<typeof writeTeam>>,code:string)=>home.events.find(event=>event.code===code)!.teams!.map(team=>team.id);

test('a team being changed shows who is changing it on other phones, live, and Take over closes it on the old holder\'s phone',async({openPhone,request},info)=>{
  const project=info.project.name,code=`TMC-${project.toUpperCase()}`,name=`Teams changing ${project}`,n=(offset:number)=>String(changingWristband(project,offset));
  await ownRelay(code,name,'Girl Cubs');
  const priya=`Priya Shah changing ${project}`,sam=`Sam Patel changing ${project}`;
  const priyaPhone=await openPhone(priya),samPhone=await openPhone(sam);
  await writeTeam(request,priyaPhone.token,code,[Number(n(1)),Number(n(2)),null,null]);
  for(const {page} of [priyaPhone,samPhone]) await openTeams(page);
  await card(priyaPhone.page,name,'Girl Cubs').click();
  await card(samPhone.page,name,'Girl Cubs').click();
  await priyaPhone.page.getByRole('button',{name:'Change Team 1',exact:true}).click();
  await expect(priyaPhone.page.getByLabel('Team 1 1st leg',{exact:true})).toHaveValue(n(1));
  // Sam sees Priya is changing Team 1, and can't open it.
  await expect(samPhone.page.getByText(`${priya} is changing this team`,{exact:true})).toBeVisible(live);
  await expect(samPhone.page.getByRole('button',{name:'Change Team 1',exact:true})).toHaveCount(0);
  expect(await lookProblems(samPhone.page)).toEqual([]);
  await samPhone.page.screenshot({path:info.outputPath('teams-is-changing.png'),fullPage:true});
  // Take over of the teams closes Priya's open team and clears her mark.
  await samPhone.page.getByRole('button',{name:'Take over the teams',exact:true}).click();
  await samPhone.page.getByRole('button',{name:'Take over',exact:true}).click();
  await expect(samPhone.page.getByText(`${priya} is changing this team`,{exact:true})).toHaveCount(0);
  await expect(priyaPhone.page.getByLabel('Team 1 1st leg',{exact:true})).toHaveCount(0,live);
  await expect(legs(priyaPhone.page,name,1)).toHaveText([n(1),n(2),'-','-']);
});

test('Change anyway after its confirm opens the team with what was last saved, and a Done overtaken by another change snaps back to the server\'s copy',async({openPhone,request},info)=>{
  const project=info.project.name,code=`TMA-${project.toUpperCase()}`,name=`Teams change anyway ${project}`,n=(offset:number)=>String(changingWristband(project,offset));
  await ownRelay(code,name,'Girl Cubs');
  const priya=`Priya Shah anyway ${project}`,sam=`Sam Patel anyway ${project}`;
  const priyaPhone=await openPhone(priya),samPhone=await openPhone(sam);
  const [team1]=teamIds(await writeTeam(request,samPhone.token,code,[Number(n(11)),Number(n(12)),null,null]),code);
  await openTeams(samPhone.page);
  await card(samPhone.page,name,'Girl Cubs').click();
  // Priya left Team 1 open (here through the API, as an Edit at check-in would).
  await openTeam(request,priyaPhone.token,code,team1);
  await expect(samPhone.page.getByText(`${priya} is changing this team`,{exact:true})).toBeVisible(live);
  await samPhone.page.getByRole('button',{name:'Change Team 1',exact:true}).click();
  await expect(samPhone.page.getByText(`${priya} is changing this team. Change it anyway? Their changes will be lost.`,{exact:true})).toBeVisible();
  expect(await lookProblems(samPhone.page)).toEqual([]);
  await samPhone.page.screenshot({path:info.outputPath('teams-change-anyway.png'),fullPage:true});
  await samPhone.page.getByRole('button',{name:'Change anyway',exact:true}).click();
  const box=(leg:string)=>samPhone.page.getByLabel(`Team 1 ${leg} leg`,{exact:true});
  await expect(box('1st')).toHaveValue(n(11));
  await expect(box('2nd')).toHaveValue(n(12));
  await expect(samPhone.page.getByText(`${priya} is changing this team`,{exact:true})).toHaveCount(0);
  // Meanwhile Team 1 is changed and saved elsewhere, so this Done is refused and the boxes snap back.
  await box('3rd').fill(n(13));
  await writeTeam(request,samPhone.token,code,[Number(n(11)),Number(n(14)),null,null],{teamId:team1});
  await samPhone.page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(samPhone.page.getByRole('alert')).toHaveText(`${sam} changed this team - check it and enter it again`);
  await expect(box('1st')).toHaveCount(0);
  await expect(legs(samPhone.page,name,1)).toHaveText([n(11),n(14),'-','-']);
  // Opening it again carries on from the server's copy.
  await samPhone.page.getByRole('button',{name:'Change Team 1',exact:true}).click();
  await box('3rd').fill(n(13));
  await samPhone.page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(legs(samPhone.page,name,1)).toHaveText([n(11),n(14),n(13),'-']);
});

test('Remove team, after its confirm, takes a team off the list for good: the list reads Team 1, 2, 4',async({openPhone,request},info)=>{
  const project=info.project.name,code=`TMR-${project.toUpperCase()}`,name=`Teams remove ${project}`,n=(offset:number)=>changingWristband(project,offset);
  await ownRelay(code,name,'Girl Cubs');
  const samPhone=await openPhone(`Sam Patel remove ${project}`),priyaPhone=await openPhone(`Priya Shah remove ${project}`);
  for(const offset of [21,22,23]) await writeTeam(request,samPhone.token,code,[n(offset),null,null,null]);
  for(const {page} of [samPhone,priyaPhone]) await openTeams(page);
  await card(samPhone.page,name,'Girl Cubs').click();
  await card(priyaPhone.page,name,'Girl Cubs').click();
  // A new team being added has nothing to remove.
  await samPhone.page.getByRole('button',{name:'+ Add team',exact:true}).click();
  await expect(samPhone.page.getByRole('button',{name:'Remove team',exact:true})).toHaveCount(0);
  await samPhone.page.getByRole('button',{name:'Cancel',exact:true}).click();
  await samPhone.page.getByRole('button',{name:'Change Team 3',exact:true}).click();
  await samPhone.page.screenshot({path:info.outputPath('teams-edit.png'),fullPage:true});
  await samPhone.page.getByRole('button',{name:'Remove team',exact:true}).click();
  await expect(samPhone.page.getByText('Remove Team 3? Its number won\'t be used again.',{exact:true})).toBeVisible();
  expect(await lookProblems(samPhone.page)).toEqual([]);
  await samPhone.page.screenshot({path:info.outputPath('teams-remove.png'),fullPage:true});
  await samPhone.page.getByRole('button',{name:'Remove',exact:true}).click();
  const names=(page:Page)=>page.getByRole('region',{name,exact:true}).locator('.team-name > span');
  await expect(names(samPhone.page)).toHaveText(['Team 1','Team 2']);
  await expect(names(priyaPhone.page)).toHaveText(['Team 1','Team 2'],live);
  await samPhone.page.getByRole('button',{name:'+ Add team',exact:true}).click();
  await samPhone.page.getByLabel('New team 1st leg',{exact:true}).fill(String(n(24)));
  await samPhone.page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(names(priyaPhone.page)).toHaveText(['Team 1','Team 2','Team 4'],live);
});

test('a relay heat on three phones: check-in on one, the order by 4th-leg buttons on another, times on a third; Submit Race by the two holders saves it and the next heat offers only the teams still to run',async({openPhone,request},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),name=`Relay order ${project}`,code=`ROT-${project.toUpperCase()}`;
  await ownRelay(code,name,'Girl Cubs');
  const sam=await openPhone(`Sam Patel order ${project}`),priyaName=`Priya Shah order ${project}`,joName=`Jo Evans order ${project}`;
  const priya=await openPhone(priyaName),jo=await openPhone(joName),ali=await openPhone(`Ali Khan order ${project}`);
  // The test day is shared: each project has its own Girl Cubs wristbands, which no other relay test types.
  const n=(offset:number)=>2900+at*20+offset,team=(legs:Array<number|null>)=>writeTeam(request,sam.token,code,legs,{keptWarnings:legs.filter((leg):leg is number=>leg!==null)});
  await team([n(1),n(2),n(3),n(4)]);await team([n(5),n(6),n(7),null]);await team([n(8),n(9),n(10),n(11)]);
  // Ali watches Home: the relay's tile follows the heat live.
  await ali.page.getByRole('tab',{name:'Relays',exact:true}).click();
  const tile=ali.page.getByRole('region',{name,exact:true}).getByRole('button');
  await expect(tile).toHaveText('Girl CubsHeat 1 · 3 teams to run');
  // Sam checks Teams 1 and 2 in.
  await openRelay(sam.page,name,'Girl Cubs');await openCheckIn(sam.page);
  await sam.page.getByRole('button',{name:/^Team 1 /}).click();
  await expect(sam.page.locator('.race-line')).toHaveText('Heat 1 · 1 team');
  await sam.page.getByRole('button',{name:/^Team 2 /}).click();
  await expect(sam.page.locator('.race-line')).toHaveText('Heat 1 · 2 teams');
  // Priya does the order; then the times are the one free column, so opening the card gives them to Jo.
  const orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
  for(const phone of [priya,jo]) await openRelay(phone.page,name,'Girl Cubs');
  await orderCard(priya.page).click();
  await priya.page.getByRole('button',{name:'Do the order',exact:true}).click();
  await expect(orderCard(jo.page)).toHaveAccessibleName(`Order and Times Order: ${priyaName} · Times: Nobody`,live);
  await orderCard(jo.page).click();
  await expect(orderCard(jo.page)).toHaveAccessibleName(`Order and Times Order: ${priyaName} · Times: You`);
  await orderCard(sam.page).click();
  await expect(tile).toHaveText(`Girl CubsHeat 1 · Order and times · ${priyaName}, ${joName}`,live);
  // Submit Race is blocked in team words.
  await expect(priya.page.locator('.race-blocked')).toHaveText('2 teams have no place yet',live);
  // The order holder taps each team as its 4th leg crosses: the 4th-leg wristband large, "Team N" small under it.
  await expect(priya.page.getByRole('heading',{name:'Who came 1st?',exact:true})).toBeVisible(live);
  const team1=priya.page.locator('.race-numbers').getByRole('button',{name:new RegExp(`^${n(4)}\\s*Team 1$`)});
  const team2=priya.page.locator('.race-numbers').getByRole('button',{name:/^Team 2\s*no 4th leg$/});
  await expect(team1).toBeVisible();await expect(team2).toBeVisible();
  expect(await lookProblems(priya.page)).toEqual([]);
  // Above the docked Submit Race, so the buttons show in the picture.
  await team2.evaluate(button=>button.scrollIntoView({block:'center'}));
  await priya.page.screenshot({path:info.outputPath('relay-order-buttons.png')});
  await team2.click();
  await expect(priya.page.getByRole('heading',{name:'Who came 2nd?',exact:true})).toBeVisible();
  await expect(priya.page.locator('.race-blocked')).toHaveText('Team 1 has no place yet');
  // Once the order has entries its holder is asked; Sam, who only checked teams in, is not.
  await expect(sam.page.locator('.race-blocked')).toHaveText('Team 1 has no place yet',live);
  await expect(sam.page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  await team1.click();
  // The table, Place | Team | Time, fills live on every phone; the Team cell matches the button.
  const rows=(page:Page)=>page.getByRole('table',{name:'Order and times'}).getByRole('row');
  for(const phone of [sam,priya,jo]) await expect(rows(phone.page)).toHaveText([/^Place\s*Team\s*Time$/,/^1st\s*Team 2\s*no 4th leg\s*(Next)?$/,new RegExp(`^2nd\\s*${n(4)}\\s*Team 1\\s*$`)],live);
  // One time per team, on today's pad.
  await expect(jo.page.getByText(/^One time per team: the start to the 4th leg crossing\./)).toBeVisible();
  for(const time of ['1520','1610']) {await jo.page.getByLabel('Place time',{exact:true}).fill(time);await jo.page.getByRole('button',{name:'Next',exact:true}).click();}
  for(const phone of [sam,priya]) await expect(rows(phone.page)).toHaveText([/^Place/,/^1st\s*Team 2\s*no 4th leg\s*15\.20$/,new RegExp(`^2nd\\s*${n(4)}\\s*Team 1\\s*16\\.10$`)],live);
  expect(await lookProblems(jo.page)).toEqual([]);
  await jo.page.screenshot({path:info.outputPath('relay-order-times.png'),fullPage:true});
  // Change the order drags teams.
  await priya.page.getByRole('button',{name:'Change the order',exact:true}).click();
  await expect(priya.page.getByText('Drag a team to its place: times stay by place.',{exact:true})).toBeVisible();
  await expect(priya.page.getByRole('list',{name:'Finishing order'}).getByRole('listitem')).toHaveText([/Team 2\s*no 4th leg/,new RegExp(`${n(4)}\\s*Team 1`)]);
  await priya.page.screenshot({path:info.outputPath('relay-change-order.png'),fullPage:true});
  await priya.page.getByRole('button',{name:'Done',exact:true}).click();
  // Submit Race by the two holders: Priya first, then Jo saves it.
  await priya.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await expect(jo.page.locator('.race-waiting')).toHaveText('Waiting on you',live);
  await expect(tile).toHaveText(`Girl CubsHeat 1 · Waiting on 1 to submit · ${joName}`,live);
  await expect(sam.page.getByRole('table',{name:'Results'}).getByRole('row')).toHaveText([/^Place\s*Team\s*Time$/,/^1st\s*Team 2\s*no 4th leg\s*15\.20$/,new RegExp(`^2nd\\s*${n(4)}\\s*Team 1\\s*16\\.10$`)],live);
  expect(await lookProblems(sam.page)).toEqual([]);
  await sam.page.screenshot({path:info.outputPath('relay-results.png'),fullPage:true});
  await jo.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  for(const phone of [sam,priya,jo]) {
    await expect(phone.page.getByText('Heat 1 saved',{exact:true})).toBeVisible(live);
    await expect(phone.page.locator('.race-line')).toHaveText('Heat 2 · 0 teams');
  }
  // Heat 2's check-in offers only Team 3: Teams 1 and 2 have run.
  await expect(sam.page.locator('.ci-list').getByRole('button')).toHaveText([/^Team 3/]);
  await expect(tile).toHaveText('Girl CubsHeat 2 · 1 team to run',live);
  // Once Team 3 has run too, the tile says the heats are done.
  await tickTeam(request,sam.token,code,3);
  await writeTeamOrder(request,priya.token,code,[3]);
  await writeTimes(request,jo.token,code,[1490]);
  await submitRace(request,priya.token,code);await submitRace(request,jo.token,code);
  await expect(tile).toHaveText('Girl CubsHeats done · Final next',live);
});
