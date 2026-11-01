import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,expect,flowPost,live,lookProblems,ownCode,ownRelay,ownWristbands,runHeat,test,writeTeam,type Page} from './fixtures.js';
/** A team's card at check-in, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const prompt=(page:Page)=>page.getByRole('heading',{level:2});
const box=(page:Page)=>page.locator('main .rz-field__input');
const footer=(page:Page)=>page.locator('footer.rz-footer');
/** A finalist team's leg chips as they read: "1st2041". */
const chips=(page:Page,team:number)=>card(page,team).locator('.rz-legchip');
const chip=(page:Page,team:number,leg:string)=>card(page,team).getByRole('button',{name:new RegExp(`^Team ${team} ${leg} leg: .*\\. Change$`)});

test('a relay final: a finalist team\'s leg chip changes that child, Here or not marked, with Here / Absent per team unchanged',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay final edit');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',10);
  const lead=await openPhone(ownName('Jo Evans final edit'),{lead:true}),sam=await openPhone(ownName('Sam Patel final edit'));
  for(const team of [1,2]) await writeTeam(request,sam.token,code,[w(team*10+1),w(team*10+2),w(team*10+3),w(team*10+4)]);
  await runHeat(request,sam.token,code,2);
  const final:RaceFlowRead=await flowPost(request,lead.token,'/api/races',{eventCode:code,kind:'final'});
  for(const phone of [lead,sam]) await phone.page.goto(`/races/${final.race.id}`);
  const page=sam.page;
  await expect(prompt(page)).toHaveText('Which teams are here?');
  await card(page,2).getByRole('button',{name:'Team 2: Here',exact:true}).click();
  // A finalist team shows four leg chips, and the four-box team sheet is no longer opened from the final.
  await expect(chips(page,2)).toHaveText([`1st${w(21)}`,`2nd${w(22)}`,`3rd${w(23)}`,`4th${w(24)}`]);
  await expect(page.getByRole('button',{name:/^Edit Team/})).toHaveCount(0);

  // Tapping a chip opens the box on that leg; Save changes it, on both phones, the team still Here.
  await chip(page,2,'1st').click();
  await expect(prompt(page)).toHaveText("Change Team 2's 1st leg");
  await expect(box(page)).toHaveValue(String(w(21)));
  await box(page).fill(String(w(25)));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-leg-change.png'),fullPage:true});
  await footer(page).getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.locator('p.rz-note[role=status]')).toHaveText(`Team 2: 1st leg changed to ${w(25)}`);
  await expect(prompt(page)).toHaveText('Which teams are here?');
  for(const phone of [page,lead.page]) await expect(chips(phone,2)).toHaveText([`1st${w(25)}`,`2nd${w(22)}`,`3rd${w(23)}`,`4th${w(24)}`],live);
  await expect(card(page,2).getByRole('button',{name:'Team 2: Here',exact:true})).toHaveAttribute('aria-pressed','true');

  // A team not marked yet takes the change too, and keeps it once marked Here.
  await chip(page,1,'4th').click();
  await box(page).fill(String(w(26)));
  await footer(page).getByRole('button',{name:'Save',exact:true}).click();
  await expect(chips(page,1)).toHaveText([`1st${w(11)}`,`2nd${w(12)}`,`3rd${w(13)}`,`4th${w(26)}`]);
  await card(page,1).getByRole('button',{name:'Team 1: Here',exact:true}).click();
  await expect(card(page,1).getByRole('button',{name:'Team 1: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(chips(page,1)).toHaveText([`1st${w(11)}`,`2nd${w(12)}`,`3rd${w(13)}`,`4th${w(26)}`]);
  await expect(page.locator('.rz-prompt__meta')).toHaveText('Final · 2 of 2 teams here');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-check-in.png'),fullPage:true});

  // Cancel closes the box with nothing changed; an Absent team's chips can't be tapped.
  await chip(page,1,'2nd').click();
  await footer(page).getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(footer(page).getByRole('button',{name:"That's everyone",exact:true})).toBeVisible();
  await card(page,1).getByRole('button',{name:'Team 1: Absent',exact:true}).click();
  await expect(card(page,1).getByRole('button',{name:'Team 1: Absent',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(card(page,1).getByRole('button',{name:/ leg: /})).toHaveCount(0);
});
