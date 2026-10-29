import type { APIRequestContext } from '@playwright/test';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry } from '../src/shared/races.js';
import {expect,live,lookProblems,ownCode,ownRelay,ownWristbands,test,writeTeam,type Page} from './fixtures.js';
const meta=(page:Page)=>page.locator('.rz-prompt__meta');
const footer=(page:Page)=>page.locator('footer.rz-footer');
/** A finalist team's card, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const markButton=(page:Page,team:number,mark:'Here'|'Absent')=>card(page,team).getByRole('button',{name:`Team ${team}: ${mark}`,exact:true});
async function post(request:APIRequestContext,token:string,url:string,data:object) {
  const response=await request.post(url,{headers:{authorization:`Bearer ${token}`},data});
  expect(response.ok(),`${url}: ${await response.text()}`).toBe(true);
  return await response.json() as RaceFlowRead;
}
/** Runs heat 1 to saved through the race flow: every team in it with each child here, placed in list order and timed. */
async function runHeat(request:APIRequestContext,token:string,code:string,teams:number) {
  let read=await post(request,token,'/api/races',{eventCode:code,kind:'heat',number:1});
  const id=read.race.id;
  for(const team of read.teams!.slice(0,teams)) {
    read=await post(request,token,`/api/races/${id}/teams/${team.id}/tick`,{});
    for(const leg of [0,1,2,3]) read=await post(request,token,`/api/races/${id}/teams/${team.id}/here`,{leg,here:true});
  }
  read=await post(request,token,`/api/races/${id}/steps/runners/done`,{});
  const order=(read.race.parts.runners.value||[]).filter(isTeamEntry).sort((a,b)=>a.team.number-b.team.number).map(entry=>entry.id);
  read=await post(request,token,`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order,didNotFinish:[],didNotRun:[],added:[]});
  read=await post(request,token,`/api/races/${id}/steps/positions/done`,{});
  read=await post(request,token,`/api/races/${id}/times`,{raceId:id,version:read.race.parts.times.version,places:order.map((_,index)=>1400+index*50),keptWrong:[]});
  read=await post(request,token,`/api/races/${id}/steps/times/done`,{});
  expect(read.race.state).toBe('saved');
}

test('a lead makes a relay final and two phones run it: Here / Absent per seeded team, That\'s everyone asking about the unmarked one, and the final saving itself with no Times',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Relay final ${project}`;
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',28);
  const lead=await openPhone(`Jo Evans lead final ${project}`,{lead:true});
  const sam=await openPhone(`Sam Patel final start ${project}`),finish=await openPhone(`Priya Shah final finish ${project}`,{job:'finish'});
  for(let team=1;team<=7;team++) await writeTeam(request,sam.token,code,[w(team*10+1),w(team*10+2),w(team*10+3),w(team*10+4)]);
  await runHeat(request,sam.token,code,7);
  // Only a lead makes the final; it seeds the fastest 6 teams, Team 7 left out.
  const refused=await request.post('/api/races',{headers:{authorization:`Bearer ${sam.token}`},data:{eventCode:code,kind:'final'}});
  expect(refused.status()).toBe(403);
  const raceId=(await post(request,lead.token,'/api/races',{eventCode:code,kind:'final'})).race.id;
  const read=async()=>await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${sam.token}`}})).json() as RaceFlowRead;
  for(const phone of [sam,finish]) await phone.page.goto(`/races/${raceId}`);
  const [one,line]=[sam.page,finish.page];

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

  // Taps land at once on the finish line: those Here are its tiles.
  for(const team of [1,2,3,4]) await markButton(one,team,'Here').click();
  await markButton(one,5,'Absent').click();
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
  const tiles=line.getByRole('list',{name:'Teams not yet placed'}).getByRole('button');
  await expect(tiles).toHaveCount(4,live);
  await expect(footer(line).getByRole('button',{name:'+ Team not on the list',exact:true})).toHaveCount(0);
  for(const team of [3,1,4,2]) await line.getByRole('button',{name:new RegExp(`^Team ${team}, 4th leg `)}).click();
  await expect(line.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await footer(line).getByRole('button',{name:'Save the order',exact:true}).click();
  await expect(line.locator('.rz-toast')).toContainText('Finishing order saved');
  // A final has no Times: it saves itself now.
  await expect.poll(async()=>(await read()).race.state).toBe('saved');
  expect((await read()).steps.times).toBeUndefined();
});
