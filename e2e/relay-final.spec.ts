import type { APIRequestContext } from '@playwright/test';
import { isTeamEntry } from '../src/shared/races.js';
import {ownName,expect,flowPost,live,lookProblems,openLeadMenu,ownCode,ownRelay,ownWristbands,runHeat,test,writeTeam,type Page} from './fixtures.js';
/** A finalist team's card on the final's start line, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
/** The final a lead makes, from the heats run so far; answers its id. */
const makeFinal=async(request:APIRequestContext,leadToken:string,code:string)=>(await flowPost(request,leadToken,'/api/races',{eventCode:code,kind:'final'})).race.id;
async function openFinalResults(page:Page,code:string) {
  await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Scouts`)}).click();
}

test('a lead\'s call-up shows live on a relay final\'s start line, and once the final saves itself the Final leaderboard lists each medal team\'s four children',async({openPhone,request},info)=>{
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
  // Team 5 isn't here: Absent frees its seed, and the lead calls up the next-ranked team, which appears at once.
  await card(sam.page,5).getByRole('button',{name:'Team 5: Absent',exact:true}).click();
  await openFinalResults(lead.page,code);
  await lead.page.getByRole('button',{name:'Call up next-ranked team: Team 7 (7th)',exact:true}).click();
  await expect(lead.page.locator('.final-lineup li').last()).toHaveText(`5: Team 7 · ${legs(7).join(' · ')} · Called up from heat rank 7`);
  await expect(card(sam.page,7).getByRole('heading',{level:3})).toHaveText('Called up · Team 7',live);
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
  await lead.page.getByRole('button',{name:'Refresh',exact:true}).click();
  const board=lead.page.getByRole('list',{name:'Final leaderboard',exact:true});
  await expect(board.getByRole('button')).toHaveCount(6);
  for(const [index,number] of [[0,3],[1,2],[2,7]] as const) await expect(board.getByRole('button').nth(index)).toHaveAccessibleName(`Team ${number} · ${legs(number).join(' · ')} · Final`);
  expect(await lookProblems(lead.page)).toEqual([]);
  await lead.page.screenshot({path:info.outputPath('relay-final-leaderboard.png'),fullPage:true});
});

test('a lead adds a team to a relay Final by picking it from the relay\'s teams, and it shows Added on the final\'s start line',async({openPhone,request},info)=>{
  const name=ownName('Relay final add'),code=await ownCode();
  await ownRelay(code,name,'Girl Scouts');
  const n=await ownWristbands('Girl Scouts',12),legs=(number:number)=>[1,2,3,4].map(leg=>n((number-1)*4+leg));
  const sam=await openPhone(ownName('Sam Patel final add')),lead=await openPhone(ownName('Jo Evans final add'),{lead:true});
  // Two teams run the heat, and Team 3 is typed after it: a lead adds it to the Final.
  for(let number=1;number<=2;number++) await writeTeam(request,sam.token,code,legs(number),{keptWarnings:legs(number)});
  await runHeat(request,sam.token,code,2);
  await writeTeam(request,sam.token,code,legs(3),{keptWarnings:legs(3)});
  const finalId=await makeFinal(request,lead.token,code);
  await sam.page.goto(`/races/${finalId}`);
  await expect(card(sam.page,2)).toBeVisible();
  await openFinalResults(lead.page,code);
  await lead.page.getByRole('button',{name:'Add a team to the final',exact:true}).click();
  // The pick list is the relay's teams not in the Final yet.
  const picks=lead.page.locator('.final-add .pick-list').getByRole('button');
  await expect(picks).toHaveText([`Team 3${legs(3).join(' · ')}`]);
  expect(await lookProblems(lead.page)).toEqual([]);
  await lead.page.screenshot({path:info.outputPath('relay-final-add-team.png'),fullPage:true});
  await picks.first().click();
  await expect(lead.page.locator('.final-lineup li').last()).toHaveText(`Team 3 · ${legs(3).join(' · ')} · Added team`);
  await expect(card(sam.page,3).getByRole('heading',{level:3})).toHaveText('Added · Team 3',live);
});
