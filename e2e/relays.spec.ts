import { expect,live,lookProblems,markHere,openRaceScreen,openTeams,ownRelay,test,tickTeam,writeTeam,type Page } from './fixtures.js';

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
  const legs=[1101,1102,1103,1104].map(number=>number+at*10);
  await writeTeam(request,priya.token,code,legs,{keptWarnings:legs});
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
