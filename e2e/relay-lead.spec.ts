import type { APIRequestContext } from '@playwright/test';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry } from '../src/shared/races.js';
import {ownName,expect,lookProblems,ownCode,ownRelay,ownWristbands,press,runHeat,test,writeTeam} from './fixtures.js';
/**
 * A zone lead on a saved relay heat: it opens as its race page, relay problems name each team over its four children
 * with It's right, and the corrections keep Correct teams, Re-run and Delete.
 */
async function post(request:APIRequestContext,token:string,url:string,data:object={}) {
  const response=await request.post(url,{headers:{authorization:`Bearer ${token}`},data});
  expect(response.ok(),`${url}: ${await response.text()}`).toBe(true);
  return await response.json() as RaceFlowRead;
}
/** Heat 1 of the relay as one phone working every step: the teams added in, every child checked in, placed in order and timed. */
async function relayHeat(request:APIRequestContext,token:string,code:string,placed:number[],times:number[]) {
  let read=await post(request,token,'/api/races',{eventCode:code,kind:'heat',number:1});
  const raceId=read.race.id,url=(what:string)=>`/api/races/${raceId}/${what}`,teamId=(number:number)=>read.teams!.find(team=>team.number===number)!.id;
  for(const number of placed) read=await post(request,token,url(`teams/${teamId(number)}/tick`));
  const entry=(number:number)=>read.race.parts.runners.value!.filter(isTeamEntry).find(item=>item.team.number===number)!.id;
  read=await post(request,token,url('steps/runners/done'));
  read=await post(request,token,url('order'),{raceId,version:read.race.parts.finish.version,order:placed.map(entry),didNotFinish:[],didNotRun:[],added:[]});
  read=await post(request,token,url('steps/positions/done'));
  read=await post(request,token,url('times'),{raceId,version:read.race.parts.times.version,places:times,keptWrong:[]});
  read=await post(request,token,url('steps/times/done'));
  expect(read.race.state).toBe('saved');
  return raceId;
}

test('a lead opens a saved relay heat as its race page: a short team and a kept number name their four children and settle with It\'s right, and the corrections keep Correct teams, Re-run and Delete',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay lead');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',7),cub=await ownWristbands('Boy Cubs',1);
  const {page,token}=await openPhone(ownName('Relay lead'),{lead:true});
  // Team 1 opens with a Boy Cub (kept); Team 2 runs short, with three children.
  await writeTeam(request,token,code,[cub(1),w(12),w(13),w(14)],{keptWarnings:[cub(1)]});
  await writeTeam(request,token,code,[w(21),w(22),w(23),null]);
  const raceId=await relayHeat(request,token,code,[2,1],[1400,1500]);
  const team1=`${cub(1)} · ${w(12)} · ${w(13)} · ${w(14)}`,team2=`${w(21)} · ${w(22)} · ${w(23)} · –`;
  // The Race screen's address of a saved race is its race page.
  await page.goto(`/races/${raceId}`);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${raceId}$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Heat 1',exact:true})).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  const short=page.getByRole('alert').filter({hasText:'A team ran short'}),kept=page.getByRole('alert').filter({hasText:'A wristband number needs checking'});
  await expect(short).toContainText(`A team ran short. Team 2 ran with 3 of 4 children marked here.Team 2 · ${team2}`);
  await expect(kept).toContainText(`Team 1 · ${team1}`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-lead-page.png'),fullPage:true});
  await press(short.getByRole('button',{name:"It's right",exact:true}));
  await expect(short).toHaveCount(0);
  await press(kept.getByRole('button',{name:"It's right",exact:true}));
  await expect(kept).toHaveCount(0);

  // The corrections: Correct teams in place of Correct runner list, with Re-run and Delete.
  await press(page.getByRole('main').getByRole('button',{name:'Correct or delete Heat 1',exact:true}));
  const actions=page.getByRole('dialog',{name:'Heat 1 · actions',exact:true});
  await expect(actions.getByRole('button')).toHaveText(['','Correct times','Correct finishing order','Correct teams','Re-run race','Delete Heat 1']);
  await page.screenshot({path:info.outputPath('relay-lead-actions.png'),fullPage:true});
  await press(actions.getByRole('button',{name:'Re-run race',exact:true}));
  await expect(page.getByText('Heat 1 moves to Deleted races. A new Heat 1 opens with the same teams checked in.',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-lead-rerun.png'),fullPage:true});
});

test('a tie between two relay heats shows on both heats\' race pages with each team\'s four children, and Decide the tie opens the tie screen, with Back to the race page',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay tie');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',8);
  const {page,token}=await openPhone(ownName('Relay tie'),{lead:true});
  await writeTeam(request,token,code,[w(11),w(12),w(13),w(14)]);
  await writeTeam(request,token,code,[w(21),w(22),w(23),w(24)]);
  // One team in each heat, both timed 14.00.
  const heats=[(await runHeat(request,token,code,1)).race.id,(await runHeat(request,token,code,1)).race.id];
  const racePage=(index:number)=>expect(page.getByRole('banner').getByRole('heading',{level:1,name:`Heat ${index+1}`,exact:true})).toBeVisible();
  for(const [index,raceId] of heats.entries()) {
    await page.goto(`/races/${raceId}`);
    await racePage(index);
    const tie=page.getByRole('alert').filter({hasText:'Teams tied on time'});
    await expect(tie).toContainText('Team 1 and Team 2 both have 14.00.');
    await expect(tie.locator('.rz-callout__team')).toHaveText([`Team 1 · ${w(11)} · ${w(12)} · ${w(13)} · ${w(14)}`,`Team 2 · ${w(21)} · ${w(22)} · ${w(23)} · ${w(24)}`]);
    expect(await lookProblems(page)).toEqual([]);
    await page.screenshot({path:info.outputPath(`relay-lead-tie-heat-${index+1}.png`),fullPage:true});
  }
  await press(page.getByRole('alert').filter({hasText:'Teams tied on time'}).getByRole('button',{name:'Decide the tie',exact:true}));
  await expect(page.getByRole('heading',{level:1,name:'Tie at 14.00',exact:true})).toBeVisible();
  await expect(page.locator('.rz-prompt__help')).toHaveText('Team 1 (Heat 1) and Team 2 (Heat 2) both ran 14.00.');
  expect(await lookProblems(page)).toEqual([]);
  await page.goBack();
  await racePage(1);
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${heats[1]}$`));
});
