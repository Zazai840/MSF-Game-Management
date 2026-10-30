import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,expect,live,lookProblems,openRelays,ownCode,ownRelay,ownWristbands,flowPost,runHeat,test,writeTeam,type Page} from './fixtures.js';
const meta=(page:Page)=>page.locator('.rz-prompt__meta');
const footer=(page:Page)=>page.locator('footer.rz-footer');
/** A finalist team's card, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const markButton=(page:Page,team:number,mark:'Here'|'Absent')=>card(page,team).getByRole('button',{name:`Team ${team}: ${mark}`,exact:true});
test('a lead makes a relay final and two phones run it: Here / Absent per seeded team, That\'s everyone asking about the unmarked one, and the final saving itself with no Times',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay final');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',28);
  const lead=await openPhone(ownName('Jo Evans lead final'),{lead:true});
  const sam=await openPhone(ownName('Sam Patel final start')),finish=await openPhone(ownName('Priya Shah final finish'),{job:'finish'});
  for(let team=1;team<=7;team++) await writeTeam(request,sam.token,code,[w(team*10+1),w(team*10+2),w(team*10+3),w(team*10+4)]);
  await runHeat(request,sam.token,code,7);
  // Only a lead makes the final; it seeds the fastest 6 teams, Team 7 left out.
  const refused=await request.post('/api/races',{headers:{authorization:`Bearer ${sam.token}`},data:{eventCode:code,kind:'final'}});
  expect(refused.status()).toBe(403);
  const raceId=(await flowPost(request,lead.token,'/api/races',{eventCode:code,kind:'final'})).race.id;
  const read=async()=>await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${sam.token}`}})).json() as RaceFlowRead;
  for(const phone of [sam,finish]) await phone.page.goto(`/races/${raceId}`);
  const [one,line]=[sam.page,finish.page];
  // As on a children's final, only teams marked Here run it: before the start line marks anyone, there is no team to place.
  await expect(line.getByRole('heading',{level:2,name:'No team is marked Here yet'})).toBeVisible();
  await expect(line.getByRole('list',{name:'Teams not yet placed'})).toHaveCount(0);

  // The start line: each seeded team's card, fastest first, its four children, Here / Absent with neither lit.
  await expect(meta(one)).toHaveText('Final · 0 of 6 teams here · 6 not marked');
  await expect(one.getByRole('heading',{level:2,name:'Which teams are here?'})).toBeVisible();
  await expect(one.getByRole('heading',{level:3})).toHaveText(['1st seed · Team 1','2nd seed · Team 2','3rd seed · Team 3','4th seed · Team 4','5th seed · Team 5','6th seed · Team 6']);
  await expect(card(one,7)).toHaveCount(0);
  for(const leg of [1,2,3,4]) await expect(card(one,2)).toContainText(String(w(20+leg)));
  await expect(card(one,2).getByText('4th leg',{exact:true})).toBeVisible();
  for(const mark of ['Here','Absent'] as const) await expect(markButton(one,1,mark)).toHaveAttribute('aria-pressed','false');
  // No per-child Here on a final.
  await expect(one.getByRole('button',{name:`${w(11)}: Here`,exact:true})).toHaveCount(0);
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('relay-final-start-line.png'),fullPage:true});
  await one.screenshot({path:info.outputPath('relay-final-start-line-viewport.png')});

  // Taps land at once on the finish line: those Here are its tiles, and the Absent or unmarked are not.
  for(const team of [1,2,3,4]) await markButton(one,team,'Here').click();
  await markButton(one,5,'Absent').click();
  const tiles=line.getByRole('list',{name:'Teams not yet placed'}).getByRole('button');
  await expect(tiles).toHaveText([1,2,3,4].map(team=>`Team ${team}${w(team*10+4)}`),live);
  await expect(meta(one)).toHaveText('Final · 4 of 6 teams here · 1 not marked');
  await expect(markButton(one,5,'Absent')).toHaveAttribute('aria-pressed','true');
  // Tapping a lit mark again unmarks it.
  await markButton(one,4,'Here').click();
  await expect(meta(one)).toHaveText('Final · 3 of 6 teams here · 2 not marked');
  await markButton(one,4,'Here').click();
  await expect(meta(one)).toHaveText('Final · 4 of 6 teams here · 1 not marked');

  // That's everyone asks about Team 6 before recording it absent.
  await footer(one).getByRole('button',{name:"That's everyone",exact:true}).click();
  const ask=one.getByRole('alert').filter({hasText:'not marked'});
  await expect(ask).toHaveText('Team 6 is not marked. Record them absent?Record them absentGo back');
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('relay-final-ask.png')});
  await ask.getByRole('button',{name:'Record them absent',exact:true}).click();
  await expect(one.locator('.rz-toast')).toContainText('Runners saved');
  expect((await read()).steps.runners!.state).toBe('done');

  // The finish line: the four teams Here, and no + Team not on the list on a final.
  await expect(tiles).toHaveCount(4,live);
  await expect(footer(line).getByRole('button',{name:'+ Team not on the list',exact:true})).toHaveCount(0);
  for(const team of [3,1,4,2]) await line.getByRole('button',{name:new RegExp(`^Team ${team}, 4th leg `)}).click();
  await expect(line.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await footer(line).getByRole('button',{name:'Save the order',exact:true}).click();
  await expect(line.locator('.rz-toast')).toContainText('Finishing order saved');
  // A final has no Times: it saves itself now.
  await expect.poll(async()=>(await read()).race.state).toBe('saved');
  expect((await read()).steps.times).toBeUndefined();

  // The lead's Races home: the relay waits on the lead. Confirm the medals opens Final complete; once confirmed the card
  // is in Done as Medals decided, and Results names every child of each team.
  const boss=lead.page,legs=(team:number)=>[1,2,3,4].map(leg=>w(team*10+leg)).join(' · ');
  await boss.reload();
  await openRelays(boss);
  const relayCard=boss.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
  await expect(relayCard.locator('.rz-racecard__status')).toHaveText('Final saved · confirm the medals',live);
  expect(await lookProblems(boss)).toEqual([]);
  await boss.screenshot({path:info.outputPath('relay-final-waiting.png'),fullPage:true});
  await relayCard.getByRole('button',{name:'Confirm the medals',exact:true}).click();
  const sheet=boss.getByRole('dialog',{name:'Final complete',exact:true});
  await expect(sheet.locator('.stage-creates li')).toHaveText([3,1,4].map((team,index)=>`${['1st','2nd','3rd'][index]}: Team ${team} · ${legs(team)}`));
  await boss.screenshot({path:info.outputPath('relay-final-complete-sheet.png'),fullPage:true});
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  const board=boss.getByRole('list',{name:'Final leaderboard',exact:true});
  for(const team of [3,1,4,2]) await expect(board.getByRole('button',{name:`Team ${team} · ${legs(team)} · Final`,exact:true})).toBeVisible();
  expect(await lookProblems(boss)).toEqual([]);
  await boss.screenshot({path:info.outputPath('relay-final-results.png'),fullPage:true});
  await boss.getByRole('button',{name:'Back to Races',exact:true}).click();
  const done=boss.locator('details',{hasText:/^Done \(\d+\)/});
  await done.locator('summary').click();
  await expect(done.getByRole('article',{name:`${name} · Girl Cubs`,exact:true}).locator('.rz-racecard__status')).toHaveText('Medals decided');
  await expect(relayCard.getByRole('button',{name:'Confirm the medals',exact:true})).toHaveCount(0);
});
