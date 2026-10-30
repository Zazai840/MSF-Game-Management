import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,expect,flowPost,live,lookProblems,openRelays,ownCode,ownRelay,ownWristbands,runHeat,test,writeTeam,type Page} from './fixtures.js';
/** A relay's card on the Relays tab, by its event name and section. */
const card=(page:Page,name:string,section='Girl Cubs')=>page.getByRole('article',{name:`${name} · ${section}`,exact:true});
/** The relay's Teams row, which opens its teams sheet. */
const teamsRow=(page:Page,name:string)=>card(page,name).getByRole('button',{name:/^Teams \d/});
/** The open sheet, by its title. */
const sheet=(page:Page,title:string)=>page.getByRole('dialog',{name:title,exact:true});
/** The teams sheet's team cards, each as it reads ("Team 1 Still to run 1st 2011 ..."). */
const teamCards=(page:Page)=>page.getByRole('list',{name:'Teams',exact:true}).getByRole('listitem');
const box=(page:Page,leg:string)=>page.getByLabel(`${leg} leg`,{exact:true});
async function typeTeam(page:Page,legs:Array<number|null>) {
  for(const [index,leg] of ['1st','2nd','3rd','4th'].entries()) if(legs[index]!==null) await box(page,leg).fill(String(legs[index]));
}
async function openTeamsSheet(page:Page,name:string) {
  await openRelays(page);
  await teamsRow(page,name).click();
  await expect(sheet(page,`${name} · Girl Cubs`)).toBeVisible();
}

test('the Relays tab lists relays as race-flow cards with a Teams row: heats in progress, teams with no heats under Teams ready, no Beta tag, and + New relay makes the next heat',async({openPhone,request},info)=>{
  const running=ownName('Relay tab running'),ready=ownName('Relay tab ready'),empty=ownName('Relay tab empty'),w=await ownWristbands('Girl Cubs',12);
  const [runningCode,readyCode,emptyCode]=[await ownCode(),await ownCode(),await ownCode()];
  for(const [code,name] of [[runningCode,running],[readyCode,ready],[emptyCode,empty]]) await ownRelay(code,name);
  const {page,token}=await openPhone(ownName('Sam Patel relay tab'));
  for(const team of [1,2,3]) await writeTeam(request,token,runningCode,[w(team*2),w(team*2+1),null,null]);
  for(const team of [1,2]) await writeTeam(request,token,readyCode,[w(team*2+6),w(team*2+7),null,null]);
  const heat=await flowPost(request,token,'/api/races',{eventCode:runningCode,kind:'heat',number:1});
  await flowPost(request,token,`/api/races/${heat.race.id}/teams/${heat.teams![0].id}/tick`,{});
  await openRelays(page);
  await expect(page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:'Relays',exact:true})).toHaveAttribute('aria-current','page');
  await expect(card(page,running).getByRole('button',{name:/^Heat 1, /})).toBeVisible();
  await expect(teamsRow(page,running)).toHaveText('Teams 3 · 2 still to run');
  // A relay with teams and no heats sits under its own heading after In progress, with no chips; one with neither is not listed.
  await expect(card(page,ready)).toContainText('2 teams ready · no heats yet');
  await expect(card(page,ready).getByRole('list',{name:'Heats'})).toHaveCount(0);
  await expect(card(page,ready)).not.toContainText('A lead makes the final');
  await expect(teamsRow(page,ready)).toHaveText('Teams 2 · 2 still to run');
  await expect(card(page,empty)).toHaveCount(0);
  expect((await page.getByRole('heading',{level:2}).allTextContents()).at(-1)).toBe('Teams ready, no heats yet');
  // A team of the ready relay joins the next heat as it is typed.
  await writeTeam(request,token,readyCode,[w(12),null,null,null]);
  await expect(teamsRow(page,ready)).toHaveText('Teams 3 · 3 still to run',live);
  for(const name of ['New team','New relay']) await expect(page.locator('footer').getByRole('button',{name,exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relays-tab.png'),fullPage:true});
  await page.screenshot({path:info.outputPath('relays-tab-viewport.png')});
  // + New relay lists the relays, and makes the chosen one's next heat.
  await page.getByRole('button',{name:'New relay',exact:true}).click();
  const newRelay=sheet(page,'New relay');
  await newRelay.getByRole('button',{name:ready,exact:true}).click();
  await newRelay.getByRole('button',{name:/^Girl Cubs/}).click();
  await newRelay.getByRole('button',{name:'Create heat 1',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${ready} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{level:2,name:'Which teams are running?'})).toBeVisible();
});

test('two prep phones type different teams of one relay at once in the teams sheet, neither locked out; a team someone else set asks Change anyway, and a Save on an older version says who changed it',async({openPhone,request},info)=>{
  const name=ownName('Teams sheet two phones'),code=await ownCode(),w=await ownWristbands('Girl Cubs',12);
  await ownRelay(code,name);
  const aisha=ownName('Aisha Noor sheet'),a=await openPhone(aisha),b=await openPhone(ownName('Sam Patel sheet'));
  await writeTeam(request,a.token,code,[w(1),w(2),w(3),w(4)]);
  for(const {page} of [a,b]) await openTeamsSheet(page,name);
  await expect(sheet(a.page,`${name} · Girl Cubs`)).toContainText('1 team · 1 still to run. Tap a team still to run to change it.');
  // Both type a new team at once: both land, numbered one after the other.
  for(const {page} of [a,b]) {
    await sheet(page,`${name} · Girl Cubs`).getByRole('button',{name:'New team',exact:true}).click();
    await expect(sheet(page,'New team 2')).toBeVisible();
  }
  await typeTeam(a.page,[w(5),w(6),w(7),w(8)]);
  await typeTeam(b.page,[w(9),w(10),null,null]);
  expect(await lookProblems(b.page)).toEqual([]);
  await b.page.screenshot({path:info.outputPath('teams-sheet-new-team.png')});
  await Promise.all([a.page.getByRole('button',{name:'Save team 2',exact:true}).click(),b.page.getByRole('button',{name:'Save team 2',exact:true}).click()]);
  for(const {page} of [a,b]) {
    await expect(teamCards(page)).toHaveCount(3,live);
    await expect(sheet(page,`${name} · Girl Cubs`)).toContainText('3 teams · 3 still to run.');
  }
  await expect(teamCards(a.page).nth(0)).toContainText(`Team 1Still to run1st${w(1)}2nd${w(2)}3rd${w(3)}4th${w(4)}`);
  await expect(teamCards(a.page).filter({hasText:'Still to run · 2 of 4'})).toContainText(`3rd–4th–`);
  expect(await lookProblems(a.page)).toEqual([]);
  await a.page.screenshot({path:info.outputPath('teams-sheet-list.png')});
  // Sam taps Team 1, which Aisha set: he is asked first, and Cancel leaves the list.
  await b.page.getByRole('button',{name:/^Change Team 1:/}).click();
  const asking=b.page.getByRole('alertdialog');
  await expect(asking).toContainText(`${aisha} has already set this team.`);
  await expect(asking).toContainText(`Team 1 · ${w(1)} · ${w(2)} · ${w(3)} · ${w(4)}`);
  expect(await lookProblems(b.page)).toEqual([]);
  await b.page.screenshot({path:info.outputPath('teams-sheet-change-anyway.png')});
  await asking.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(asking).toHaveCount(0);
  await expect(teamCards(b.page)).toHaveCount(3);
  await b.page.getByRole('button',{name:/^Change Team 1:/}).click();
  await b.page.getByRole('alertdialog').getByRole('button',{name:'Change anyway',exact:true}).click();
  await expect(sheet(b.page,'Edit team 1')).toBeVisible();
  await expect(box(b.page,'2nd')).toHaveValue(String(w(2)));
  // Aisha changes Team 1 meanwhile: Sam's Save is refused, saying who, and Show latest starts again from hers.
  await a.page.getByRole('button',{name:/^Change Team 1:/}).click();
  await expect(sheet(a.page,'Edit team 1')).toBeVisible();
  await box(a.page,'4th').fill(String(w(11)));
  await a.page.getByRole('button',{name:'Save team 1',exact:true}).click();
  await expect(teamCards(a.page).nth(0)).toContainText(`4th${w(11)}`);
  await box(b.page,'3rd').fill(String(w(12)));
  await b.page.getByRole('button',{name:'Save team 1',exact:true}).click();
  // The leg boxes' drag announcements are a status too, so the callout is found by its words.
  await expect(sheet(b.page,'Edit team 1').getByRole('status').filter({hasText:`${aisha} changed this a moment ago.`})).toBeVisible();
  await b.page.getByRole('button',{name:'Show latest',exact:true}).click();
  await expect(box(b.page,'3rd')).toHaveValue(String(w(3)));
  await expect(box(b.page,'4th')).toHaveValue(String(w(11)));
  await box(b.page,'3rd').fill(String(w(12)));
  await b.page.getByRole('button',{name:'Save team 1',exact:true}).click();
  await expect(teamCards(a.page).nth(0)).toContainText(`3rd${w(12)}4th${w(11)}`,live);
});

test('New team from the foot of Relays: four leg boxes, a number already in the relay refused with Fix number only, a wrong-Section number warned with Fix number / Keep; Cancel leaves nothing, and Remove team takes a team never in a race off for good',async({openPhone,request},info)=>{
  const name=ownName('Teams sheet new'),other=ownName('Teams sheet other'),w=await ownWristbands('Girl Cubs',8),boy=await ownWristbands('Boy Cubs',1);
  const [code,otherCode]=[await ownCode(),await ownCode()];
  await ownRelay(code,name);await ownRelay(otherCode,other);
  const {page,token}=await openPhone(ownName('Priya Shah new team'));
  for(const team of [1,2]) await writeTeam(request,token,code,[w(team),null,null,null]);
  const heat=await flowPost(request,token,'/api/races',{eventCode:code,kind:'heat',number:1});
  await flowPost(request,token,`/api/races/${heat.race.id}/teams/${heat.teams![0].id}/tick`,{});
  await openRelays(page);
  // More than one relay: New team first asks which.
  await page.locator('footer').getByRole('button',{name:'New team',exact:true}).click();
  const which=sheet(page,'New team');
  await which.getByRole('button',{name,exact:true}).click();
  await which.getByRole('button',{name:/^Girl Cubs/}).click();
  await which.getByRole('button',{name:'Type a new team',exact:true}).click();
  const typing=sheet(page,'New team 3');
  await expect(typing).toContainText(`${name} · Girl Cubs`);
  for(const leg of ['1st','2nd','3rd','4th']) await expect(box(page,leg)).toBeVisible();
  await expect(typing.getByRole('button',{name:'Save team 3',exact:true})).toBeDisabled();
  // A number already in Team 2 is refused: Fix number only.
  await box(page,'1st').fill(String(w(2)));
  const refused=typing.getByRole('alert');
  await expect(refused).toHaveText(`${w(2)} is already in Team 2. Check the wristband.Fix number`);
  await expect(refused.getByRole('button',{name:'Keep'})).toHaveCount(0);
  await refused.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(box(page,'1st')).toHaveValue('');
  await box(page,'1st').fill(String(w(3)));
  // A Boy Cubs number warns once its box is left: Fix number or Keep.
  await box(page,'2nd').fill(String(boy(1)));
  await box(page,'3rd').focus();
  const warned=typing.getByRole('alert');
  await expect(warned).toContainText(`${boy(1)} is not a Girl Cubs number.`);
  await expect(typing.getByRole('button',{name:'Save team 3',exact:true})).toBeDisabled();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('teams-sheet-warning.png')});
  await warned.getByRole('button',{name:'Keep',exact:true}).click();
  await typing.getByRole('button',{name:'Save team 3',exact:true}).click();
  const list=sheet(page,`${name} · Girl Cubs`);
  await expect(teamCards(page)).toHaveCount(3);
  // Team 1 is in heat 1: it says so and can't be tapped here.
  await expect(teamCards(page).nth(0)).toContainText('Team 1Heat 1 · change it at check-in');
  await expect(page.getByRole('button',{name:/^Change Team 1:/})).toHaveCount(0);
  await expect(teamCards(page).nth(2)).toContainText(`Team 3Still to run · 2 of 4`);
  // Cancel leaves nothing.
  await list.getByRole('button',{name:'New team',exact:true}).click();
  await box(page,'1st').fill(String(w(5)));
  await sheet(page,'New team 4').getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(teamCards(page)).toHaveCount(3);
  // Remove team 3, after its confirm: the next team is Team 4, never 3 again.
  await page.getByRole('button',{name:/^Change Team 3:/}).click();
  const editing=sheet(page,'Edit team 3');
  await expect(editing.getByRole('button',{name:'Remove team 3',exact:true})).toBeVisible();
  await editing.getByRole('button',{name:'Remove team 3',exact:true}).click();
  await expect(editing.getByRole('alert')).toContainText('Remove Team 3? Its number won\'t be used again.');
  await editing.getByRole('button',{name:'Remove',exact:true}).click();
  await expect(teamCards(page)).toHaveCount(2);
  await list.getByRole('button',{name:'New team',exact:true}).click();
  await expect(sheet(page,'New team 4')).toBeVisible();
  // A team in a race has nothing to remove; nor has a new one.
  await expect(page.getByRole('button',{name:/^Remove team/})).toHaveCount(0);
});

test('once the heats are complete the teams sheet is read-only with the reason in place; + Final shows only in the Zone lead role, behind a confirm worded for teams',async({openPhone,request})=>{
  const name=ownName('Teams sheet final'),code=await ownCode(),w=await ownWristbands('Girl Cubs',8);
  await ownRelay(code,name);
  const sam=await openPhone(ownName('Sam Patel final sheet')),lead=await openPhone(ownName('Jo Evans final sheet'),{lead:true});
  for(const team of [1,2]) await writeTeam(request,sam.token,code,[w(team*4-3),w(team*4-2),w(team*4-1),w(team*4)]);
  await runHeat(request,sam.token,code,2);
  await openRelays(sam.page);
  await expect(card(sam.page,name)).toContainText('A lead makes the final once every heat has run.');
  await expect(card(sam.page,name).getByRole('button',{name:/Final/})).toHaveCount(0);
  await openRelays(lead.page);
  await card(lead.page,name).getByRole('button',{name:'Create the final from the fastest 6',exact:true}).click();
  const confirm=sheet(lead.page,'Have all Girl Cubs heats run?');
  await expect(confirm).toContainText('1 heat saved. The final takes the fastest 6 teams, and no more heats can be added.');
  await confirm.getByRole('button',{name:'Make the final',exact:true}).click();
  await expect(lead.page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  // The final made, the list is read-only: the reason, no New team, no team to tap.
  await teamsRow(sam.page,name).click();
  const list=sheet(sam.page,`${name} · Girl Cubs`);
  await expect(list).toContainText('The final has been made, so the teams can\'t change. A lead can correct a team in Results.',live);
  await expect(list.getByRole('button',{name:'New team'})).toHaveCount(0);
  await expect(list.getByRole('button',{name:/^Change Team/})).toHaveCount(0);
  await expect(teamCards(sam.page).nth(0)).toContainText('Team 1Final · change it at check-in');
  // The final's start line has the seeded teams.
  const final=(await (await request.get('/api/races',{headers:{authorization:`Bearer ${sam.token}`}})).json()).groups.find((group:{event:{code:string}})=>group.event.code===code).races.find((race:{kind:string})=>race.kind==='final');
  expect(((await (await request.get(`/api/races/${final.id}`,{headers:{authorization:`Bearer ${sam.token}`}})).json()) as RaceFlowRead).race.final!.entries).toHaveLength(2);
});
