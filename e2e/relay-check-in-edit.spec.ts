import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {expect,flowPost,live,lookProblems,ownCode,ownRelay,ownWristbands,runHeat,test,writeTeam,type Page} from './fixtures.js';
/** A team's card at check-in, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const sheet=(page:Page,title:string)=>page.getByRole('dialog',{name:title,exact:true});
const here=(page:Page,wristband:number)=>page.getByRole('button',{name:`${wristband}: Here`,exact:true});

test('two start-line phones: Edit opens a team\'s leg boxes with no popup, the other phone sees who is changing it, and New team joins this heat',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Relay edit ${project}`;
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',44);
  const samName=`Sam Patel edit ${project}`,sam=await openPhone(samName),priya=await openPhone(`Priya Shah edit ${project}`);
  // Priya set Team 1, so on the teams sheet Sam would be asked first; at check-in he is not.
  await writeTeam(request,priya.token,code,[w(11),w(12),w(13),w(14)]);
  await writeTeam(request,priya.token,code,[w(21),w(22),w(23),w(24)]);
  const made=await flowPost(request,sam.token,'/api/races',{eventCode:code,kind:'heat',number:1}),raceId=made.race.id;
  await flowPost(request,sam.token,`/api/races/${raceId}/teams/${made.teams![0].id}/tick`,{});
  for(const phone of [sam,priya]) await phone.page.goto(`/races/${raceId}`);
  const [one,two]=[sam.page,priya.page];
  await here(one,w(11)).click();
  await expect(here(two,w(11))).toHaveAttribute('aria-pressed','true',live);

  // Edit: Team 1's four leg boxes straight away, filled in leg order.
  await card(one,1).getByRole('button',{name:'Edit Team 1',exact:true}).click();
  const edit=sheet(one,'Edit team 1');
  await expect(edit).toBeVisible();
  await expect(one.getByText('has already set this team')).toHaveCount(0);
  for(const [leg,wristband] of [['1st leg',w(11)],['2nd leg',w(12)],['3rd leg',w(13)],['4th leg',w(14)]] as const) await expect(edit.getByLabel(leg,{exact:true})).toHaveValue(String(wristband));
  await expect(card(two,1)).toContainText(`${samName} is changing this team`,live);
  // Only other phones see it: this one's card behind the sheet does not name itself.
  await expect(card(one,1)).not.toContainText('is changing this team');
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('check-in-edit.png')});
  // 1st and 2nd swap, and the 3rd leg is a new child: Here follows the child, and both phones see the new legs.
  await edit.getByLabel('1st leg',{exact:true}).fill(String(w(12)));
  await edit.getByLabel('2nd leg',{exact:true}).fill(String(w(11)));
  await edit.getByLabel('3rd leg',{exact:true}).fill(String(w(33)));
  await edit.getByRole('button',{name:'Save team 1',exact:true}).click();
  await expect(edit).toHaveCount(0);
  for(const page of [one,two]) {
    await expect(card(page,1).locator('.rz-attendance__who')).toHaveText([`1st leg${w(12)}`,`2nd leg${w(11)}`,`3rd leg${w(33)}`,`4th leg${w(14)}`],live);
    await expect(here(page,w(11))).toHaveAttribute('aria-pressed','true');
    await expect(here(page,w(12))).toHaveAttribute('aria-pressed','false');
  }
  await expect(card(two,1)).not.toContainText('is changing this team');
  // Cancel clears the mark too.
  await card(one,1).getByRole('button',{name:'Edit Team 1',exact:true}).click();
  await expect(card(two,1)).toContainText('is changing this team',live);
  await sheet(one,'Edit team 1').getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(card(two,1)).not.toContainText('is changing this team',live);

  // New team: the next number, joining this heat on both phones.
  await one.getByRole('button',{name:'New team',exact:true}).click();
  const added=sheet(one,'New team · joins this heat');
  await expect(added).toBeVisible();
  await expect(added.getByLabel('1st leg',{exact:true})).toBeFocused();
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('check-in-new-team.png')});
  for(const [leg,wristband] of [['1st leg',w(41)],['2nd leg',w(42)],['3rd leg',w(43)],['4th leg',w(44)]] as const) await added.getByLabel(leg,{exact:true}).fill(String(wristband));
  await added.getByRole('button',{name:'Save team 3',exact:true}).click();
  await expect(added).toHaveCount(0);
  for(const page of [one,two]) await expect(card(page,3)).toContainText(String(w(44)),live);
  await expect(one.locator('.rz-prompt__meta')).toHaveText('Heat 1 · 2 teams · 1 child here');
});

test('a relay final: Edit on a seeded team swaps its children at check-in, Here marks following them',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Relay final edit ${project}`;
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',24);
  const lead=await openPhone(`Jo Evans final edit ${project}`,{lead:true}),sam=await openPhone(`Sam Patel final edit ${project}`);
  for(const team of [1,2]) await writeTeam(request,sam.token,code,[w(team*10+1),w(team*10+2),w(team*10+3),w(team*10+4)]);
  await runHeat(request,sam.token,code,2);
  const final:RaceFlowRead=await flowPost(request,lead.token,'/api/races',{eventCode:code,kind:'final'});
  await sam.page.goto(`/races/${final.race.id}`);
  const page=sam.page;
  await card(page,2).getByRole('button',{name:'Team 2: Here',exact:true}).click();
  await card(page,2).getByRole('button',{name:'Edit Team 2',exact:true}).click();
  const edit=sheet(page,'Edit team 2');
  await expect(edit.getByLabel('4th leg',{exact:true})).toHaveValue(String(w(24)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-check-in-edit.png')});
  await edit.getByLabel('1st leg',{exact:true}).fill(String(w(24)));
  await edit.getByLabel('4th leg',{exact:true}).fill(String(w(21)));
  await edit.getByRole('button',{name:'Save team 2',exact:true}).click();
  await expect(edit).toHaveCount(0);
  await expect(card(page,2).locator('.rz-teamlegs li')).toHaveText([`1st leg${w(24)}`,`2nd leg${w(22)}`,`3rd leg${w(23)}`,`4th leg${w(21)}`]);
  await expect(card(page,2).getByRole('button',{name:'Team 2: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-check-in.png'),fullPage:true});
  // A team not in the race (unmarked teams are in it; Absent takes it out) has no Edit.
  await card(page,1).getByRole('button',{name:'Team 1: Absent',exact:true}).click();
  await expect(card(page,1).getByRole('button',{name:'Edit Team 1',exact:true})).toHaveCount(0);
});
