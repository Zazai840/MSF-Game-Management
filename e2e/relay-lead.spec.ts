import type { APIRequestContext } from '@playwright/test';
import type { RaceFlowRead } from '../src/shared/race-flow.js';
import { isTeamEntry } from '../src/shared/races.js';
import {ownName,expect,lookProblems,ownCode,ownRelay,ownWristbands,runHeat,test,writeTeam} from './fixtures.js';
/**
 * A zone lead on a relay race in the race flow: every step tab shows "Team 5" over its four children in leg order,
 * relay problems sit on the step they are about with It's right, and the race actions keep Correct teams, Re-run and Delete.
 */
async function post(request:APIRequestContext,token:string,url:string,data:object={}) {
  const response=await request.post(url,{headers:{authorization:`Bearer ${token}`},data});
  expect(response.ok(),`${url}: ${await response.text()}`).toBe(true);
  return await response.json() as RaceFlowRead;
}
/** Heat 1 of the relay as one phone working every step: the teams ticked in, the children marked here (`here[n]` of Team n's), placed in order and timed. */
async function relayHeat(request:APIRequestContext,token:string,code:string,placed:number[],times:number[],here:Record<number,number>) {
  let read=await post(request,token,'/api/races',{eventCode:code,kind:'heat',number:1});
  const raceId=read.race.id,url=(what:string)=>`/api/races/${raceId}/${what}`,teamId=(number:number)=>read.teams!.find(team=>team.number===number)!.id;
  for(const number of placed) {
    read=await post(request,token,url(`teams/${teamId(number)}/tick`));
    for(let leg=0;leg<here[number];leg++) read=await post(request,token,url(`teams/${teamId(number)}/here`),{leg,here:true});
  }
  const entry=(number:number)=>read.race.parts.runners.value!.filter(isTeamEntry).find(item=>item.team.number===number)!.id;
  read=await post(request,token,url('steps/runners/done'));
  read=await post(request,token,url('order'),{raceId,version:read.race.parts.finish.version,order:placed.map(entry),didNotFinish:[],didNotRun:[],added:[]});
  read=await post(request,token,url('steps/positions/done'));
  read=await post(request,token,url('times'),{raceId,version:read.race.parts.times.version,places:times,keptWrong:[]});
  read=await post(request,token,url('steps/times/done'));
  expect(read.race.state).toBe('saved');
  return raceId;
}

test('a lead\'s step tabs on a relay name each team with its four children, settle a short team and a kept number with It\'s right, and keep Correct teams, Re-run and Delete',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay lead');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',7),cub=await ownWristbands('Boy Cubs',1);
  const {page,token}=await openPhone(ownName('Relay lead'),{lead:true});
  // Team 1 opens with a Boy Cub (kept); Team 2 runs with only three children marked here.
  await writeTeam(request,token,code,[cub(1),w(12),w(13),w(14)],{keptWarnings:[cub(1)]});
  await writeTeam(request,token,code,[w(21),w(22),w(23),w(24)]);
  const raceId=await relayHeat(request,token,code,[2,1],[1400,1500],{1:4,2:3});
  const team1=`${cub(1)} · ${w(12)} · ${w(13)} · ${w(14)}`,team2=`${w(21)} · ${w(22)} · ${w(23)} · ${w(24)}`;
  await page.goto(`/races/${raceId}`);
  const tabs=page.getByRole('tablist',{name:'Heat 1 steps'});
  await expect(tabs.getByRole('tab',{name:/^Runners/})).toContainText('2 to check');

  // Runners: the teams in, each over its four children, and the two problems with It's right.
  await expect(page.locator('.rz-prompt__meta')).toHaveText('Heat 1 · 2 teams checked in');
  await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText([`Team 2${team2}`,`Team 1${team1}`]);
  const short=page.getByRole('alert').filter({hasText:'A team ran short'}),kept=page.getByRole('alert').filter({hasText:'A wristband number needs checking'});
  await expect(short).toContainText(`A team ran short. Team 2 ran with 3 of 4 children marked here.Team 2 · ${team2}`);
  await expect(kept).toContainText(`Team 1 · ${team1}`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-lead-runners.png'),fullPage:true});
  await short.getByRole('button',{name:"It's right",exact:true}).click();
  await expect(short).toHaveCount(0);
  await kept.getByRole('button',{name:"It's right",exact:true}).click();
  await expect(kept).toHaveCount(0);
  await expect(tabs.getByRole('tab',{name:/^Runners/})).toHaveText(/^Runners.*2 teams$/);

  // Finishing order and Times: each row's team over its four children.
  await tabs.getByRole('tab',{name:/^Finishing order/}).click();
  await expect(page.getByRole('list',{name:'Finishing order'}).getByRole('listitem')).toHaveText([`1stTeam 2${team2}`,`2ndTeam 1${team1}`]);
  await page.screenshot({path:info.outputPath('relay-lead-order.png'),fullPage:true});
  await tabs.getByRole('tab',{name:/^Times/}).click();
  await expect(page.getByRole('list',{name:'Times'}).getByRole('listitem')).toHaveText([`1stTeam 214.00 ${team2}`,`2ndTeam 115.00 ${team1}`]);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-lead-times.png'),fullPage:true});

  // The race actions: Correct teams in place of Correct runner list, with Re-run and Delete.
  await page.getByRole('button',{name:'Race actions: re-run, delete, correct, disqualify',exact:true}).click();
  const actions=page.getByRole('dialog',{name:'Race actions'});
  for(const action of ['Correct teams','Re-run race','Delete race']) await expect(actions.getByRole('button',{name:action,exact:true})).toBeVisible();
  await expect(actions.getByRole('button',{name:'Correct runner list',exact:true})).toHaveCount(0);
  // Its current record names each team over its four children.
  await expect(actions.getByRole('list',{name:'Current record',exact:true}).getByRole('button')).toHaveText([`Team 2${team2}`,`Team 1${team1}`]);
  await page.screenshot({path:info.outputPath('relay-lead-actions.png'),fullPage:true});
  await actions.getByRole('button',{name:'Re-run race',exact:true}).click();
  await expect(page.getByText(/current race/)).toHaveCount(0);
  await page.screenshot({path:info.outputPath('relay-lead-rerun.png'),fullPage:true});
});

test('a tie between two relay heats shows on both heats\' Times tab with each team\'s four children, and Open in Results opens the tie',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay tie');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',8);
  const {page,token}=await openPhone(ownName('Relay tie'),{lead:true});
  await writeTeam(request,token,code,[w(11),w(12),w(13),w(14)]);
  await writeTeam(request,token,code,[w(21),w(22),w(23),w(24)]);
  // One team in each heat, both timed 14.00.
  const heats=[(await runHeat(request,token,code,1)).race.id,(await runHeat(request,token,code,1)).race.id];
  for(const [index,raceId] of heats.entries()) {
    await page.goto(`/races/${raceId}`);
    const tabs=page.getByRole('tablist',{name:`Heat ${index+1} steps`});
    await expect(tabs.getByRole('tab',{name:/^Times/})).toContainText('1 to check');
    await tabs.getByRole('tab',{name:/^Times/}).click();
    const tie=page.getByRole('alert').filter({hasText:'Teams tied on time'});
    await expect(tie).toContainText('Team 1 and Team 2 both have 14.00.');
    await expect(tie.locator('.rz-callout__team')).toHaveText([`Team 1 · ${w(11)} · ${w(12)} · ${w(13)} · ${w(14)}`,`Team 2 · ${w(21)} · ${w(22)} · ${w(23)} · ${w(24)}`]);
    expect(await lookProblems(page)).toEqual([]);
    await page.screenshot({path:info.outputPath(`relay-lead-tie-heat-${index+1}.png`),fullPage:true});
  }
  await page.getByRole('alert').filter({hasText:'Teams tied on time'}).getByRole('button',{name:'Open in Results',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} Girl Cubs`,exact:true})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Tie at 14.00',exact:true})).toBeVisible();
});
