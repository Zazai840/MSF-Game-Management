import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,expect,flowPost,lookProblems,ownCode,ownRelay,ownWristbands,runHeat,test,writeTeam,type Page} from './fixtures.js';
/** A team's card at check-in, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const sheet=(page:Page,title:string)=>page.getByRole('dialog',{name:title,exact:true});

test('a relay final: Edit on a seeded team swaps its children at check-in, Here marks following them',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay final edit');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',24);
  const lead=await openPhone(ownName('Jo Evans final edit'),{lead:true}),sam=await openPhone(ownName('Sam Patel final edit'));
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
