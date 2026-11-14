import type { APIRequestContext } from '@playwright/test';
import { isTeamEntry } from '../src/shared/races.js';
import {eventTab,expectToast,ownName,expect,flowPost,lookProblems,openLeadsBarTab,ownCode,ownRelay,ownWristbands,press,runHeat,test,writeTeam,pullToRefresh,type Page,resultsCard} from './fixtures.js';
/** A finalist team's card on the final's start line, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
/** The final a lead makes, from the heats run so far; answers its id. */
const makeFinal=async(request:APIRequestContext,leadToken:string,code:string)=>(await flowPost(request,leadToken,'/api/races',{eventCode:code,kind:'final'})).race.id;
/** The rows of the Final tab's "Line-up, fastest first", opened. */
async function lineUp(page:Page) {
  const rows=page.getByRole('list',{name:'Line-up, fastest first'}).getByRole('listitem');
  if(!await rows.first().isVisible()) await page.getByText('Line-up, fastest first',{exact:true}).click();
  return rows;
}
async function openFinalResults(page:Page,code:string) {
  await openLeadsBarTab(page,'Results');
  await press(resultsCard(page,code));
  await eventTab(page,'Final');
}

test('the start line calls up the next-ranked team at a relay final\'s check-in, Here at once, and once the final saves itself the Final leaderboard lists each medal team\'s four children',async({openPhone,request},info)=>{
  const name=ownName('Relay final'),code=await ownCode();
  await ownRelay(code,name,'Girl Scouts');
  const n=await ownWristbands('Girl Scouts',28),legs=(number:number)=>[1,2,3,4].map(leg=>n((number-1)*4+leg));
  const sam=await openPhone(ownName('Sam Patel final')),lead=await openPhone(ownName('Jo Evans final'),{lead:true});
  for(let number=1;number<=7;number++) await writeTeam(request,sam.token,code,legs(number),{keptWarnings:legs(number)});
  // Teams 1 to 6 are the six fastest, Team 7 is 7th.
  await runHeat(request,sam.token,code,7);
  const finalId=await makeFinal(request,lead.token,code);
  await sam.page.goto(`/races/${finalId}`);
  await expect(sam.page.getByRole('heading',{level:3})).toHaveText(['1st fastest · Team 1','2nd fastest · Team 2','3rd fastest · Team 3','4th fastest · Team 4','5th fastest · Team 5','6th fastest · Team 6']);
  // Team 5 isn't here: Absent frees its seed, and the start line calls up the next-ranked team, Here with no second tap.
  const callUp=sam.page.getByRole('button',{name:/^Call up next fastest/});
  await expect(callUp).toHaveCount(0);
  await press(card(sam.page,5).getByRole('button',{name:'Team 5: Absent',exact:true}));
  await expect(callUp).toHaveText('Call up next fastest: Team 7 (7th)');
  expect(await lookProblems(sam.page)).toEqual([]);
  await press(callUp);
  await expectToast(sam.page,'Team 7 called up');
  await expect(card(sam.page,7).getByRole('heading',{level:3})).toHaveText('Called up · Team 7');
  await expect(card(sam.page,7).getByRole('button',{name:'Team 7: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(callUp).toHaveCount(0);
  // The lead's Final tab names the same call-up, and has no button that adds a team.
  await openFinalResults(lead.page,code);
  await expect(lead.page.getByRole('button',{name:'Add a team to the final',exact:true})).toHaveCount(0);
  // Until the final's order is saved, the row shows the call-up's audit note under it.
  const calledUp=(await lineUp(lead.page)).last();
  await expect(calledUp).toContainText(`Called up from heat rank 7 · Team 7 · ${legs(7).join(' · ')}`);
  await expect(calledUp.getByRole('group',{name:`Notes on Team 7 · ${legs(7).join(' · ')}`,exact:true})).toContainText('called up Team 7 (heat rank 7) for absent Team 5');
  expect(await lookProblems(sam.page)).toEqual([]);
  await sam.page.screenshot({path:info.outputPath('relay-final-call-up.png'),fullPage:true});
  // Everyone else is here; the finish line places them, and the final saves itself.
  const teams=(await (await request.get(`/api/races/${finalId}`,{headers:{authorization:`Bearer ${sam.token}`}})).json()).teams as Array<{id:string;number:number}>;
  for(const number of [1,2,3,4,6,7]) await flowPost(request,sam.token,`/api/races/${finalId}/teams/${teams.find(team=>team.number===number)!.id}/absent`,{mark:'here'});
  let read=await flowPost(request,sam.token,`/api/races/${finalId}/steps/runners/done`,{});
  const entry=(number:number)=>read.race.parts.runners.value!.filter(isTeamEntry).find(item=>item.team.number===number)!.id;
  read=await flowPost(request,sam.token,`/api/races/${finalId}/order`,{raceId:finalId,version:read.race.parts.finish.version,order:[3,2,7,1,6,4].map(entry),didNotFinish:[],didNotRun:[],added:[]});
  read=await flowPost(request,sam.token,`/api/races/${finalId}/steps/positions/done`,{});
  expect(read.race.state).toBe('saved');
  await pullToRefresh(lead.page);
  const board=lead.page.getByRole('list',{name:'Final leaderboard',exact:true});
  await expect(board.getByRole('button')).toHaveCount(6);
  for(const [index,number] of [[0,3],[1,2],[2,7]] as const) await expect(board.getByRole('button').nth(index)).toHaveAccessibleName(`Team ${number} · ${legs(number).join(' · ')} · Final`);
  expect(await lookProblems(lead.page)).toEqual([]);
  await lead.page.screenshot({path:info.outputPath('relay-final-leaderboard.png'),fullPage:true});
});
