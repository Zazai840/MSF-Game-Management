import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,ownCode,ownEvent,ownRelay,ownWristbands,deleteCurrentRace,enterTime,expect,flowPost,lookProblems,recordRace,press,test,tickTeam,writeCheckIn,writeOrder,writeTeam,writeTimes,type APIRequestContext,type Page} from './fixtures.js';
/**
 * A Zone lead marking a step done goes back to Races, as a volunteer does, with the same one-line toast and Undo, on
 * the tab that holds the race's event whatever tab the phone remembered. A lead changing a step already done stays.
 */
const owner=()=>process.env.E2E_OWNER_TOKEN!;
const read=async(request:APIRequestContext,raceId:string)=>(await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${owner()}`}})).json()) as RaceFlowRead;
const toast=(page:Page)=>page.locator('.rz-toast');
const onTab=(page:Page,tab:'Races'|'Relays')=>expect(page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:tab,exact:true})).toHaveAttribute('aria-current','page');
/** Opens a race at its address on a phone whose Races home last showed `tab`. */
async function openAt(page:Page,raceId:string,tab:'races'|'relays') {
  await page.evaluate(tab=>localStorage.setItem('msf:home-tab',tab),tab);
  await page.goto(`/races/${raceId}`);
}
/** The toast is one line, the save's words with Undo and nothing more (no next step). */
async function savedToast(page:Page,words:string) {
  await expect(toast(page).locator('.rz-toast__msg')).toHaveText(words);
  await expect(toast(page)).toHaveText(`${words}Undo`);
  // The toast sits just above Races' New race button, which a lead's bar lifts; it may cover the "Updated at" line.
  await expect(async()=>{
    const box=(await toast(page).boundingBox())!,button=(await page.locator('footer.rz-footer').getByRole('button',{name:/New (race|relay)/}).boundingBox())!;
    expect(box.y+box.height).toBeLessThanOrEqual(button.y+0.5);expect(box.y+box.height).toBeGreaterThan(button.y-16);
  }).toPass({timeout:3000});
}

test('a lead marking That\'s everyone and the last place\'s time on a heat lands on Races with the toast, and Undo reopens the race at that step',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Lead toast heat');
  await ownEvent(request,code,name,'Girl Cubs','heats');
  await recordRace(request,owner(),code,[2001],[1300]);
  const {race}=await writeCheckIn(request,owner(),code,[2002,2003]);
  const {page}=await openPhone(ownName('Lead toast heat'),{lead:true});
  // The phone remembered Relays; a heat's event is on Races.
  await openAt(page,race.id,'relays');
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  await onTab(page,'Races');
  await savedToast(page,'Runners saved · Girl Cubs Heat 2');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-toast-runners.png')});
  // The last place's time marks Times done: back on Races with the toast.
  await writeTimes(request,owner(),code,[1250]);
  await openAt(page,race.id,'relays');
  const tabs=page.getByRole('tablist',{name:'Heat 2 steps'});
  await press(tabs.getByRole('tab',{name:/^Times/}));
  await enterTime(page,'1400');
  await onTab(page,'Races');
  await savedToast(page,'Times saved · Girl Cubs Heat 2');
  // Undo reverses only this save and reopens the race at Times.
  await press(toast(page).getByRole('button',{name:'Undo',exact:true}));
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(tabs.getByRole('tab',{name:/^Times/})).toHaveAttribute('aria-selected','true');
  // The times stay; only the done mark went.
  await expect(page.getByRole('heading',{level:2,name:'Every place has a time'})).toBeVisible();
  await expect.poll(async()=>(await read(request,race.id)).steps.times!.state).toBe('in progress');
  await deleteCurrentRace(request,code);
});

test('a lead saving a final\'s finishing order lands on Races with "Finishing order saved · Girl Cubs Final"',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Lead toast final');
  await ownEvent(request,code,name,'Girl Cubs','heats');
  await recordRace(request,owner(),code,[2011,2012],[1200,1300]);
  const final=await flowPost(request,owner(),'/api/races',{eventCode:code,kind:'final',number:0,direct:true});
  const {page}=await openPhone(ownName('Lead toast final'),{lead:true});
  await openAt(page,final.race.id,'relays');
  for(const number of [2011,2012]) await press(page.getByRole('button',{name:`${number}: Here`,exact:true}));
  await expect(page.getByRole('button',{name:'2012: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  await onTab(page,'Races');
  await savedToast(page,'Runners saved · Girl Cubs Final');
  await openAt(page,final.race.id,'relays');
  await press(page.getByRole('tablist',{name:'Final steps'}).getByRole('tab',{name:/^Finishing order/}));
  await press(page.getByRole('button',{name:'2012 came 1st',exact:true}));
  await press(page.getByRole('button',{name:'2011 came 2nd',exact:true}));
  await press(page.getByRole('button',{name:'Save the order',exact:true}));
  await onTab(page,'Races');
  await savedToast(page,'Finishing order saved · Girl Cubs Final');
});

test('a lead marking That\'s everyone on a relay heat lands on Relays with the toast, though the phone remembered Races',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Lead toast relay'),w=await ownWristbands('Girl Cubs',4);
  await ownRelay(code,name,'Girl Cubs');
  await writeTeam(request,owner(),code,[w(1),w(2),w(3),w(4)]);
  const made=await flowPost(request,owner(),'/api/races',{eventCode:code,kind:'heat',number:1});
  await tickTeam(request,owner(),code,1);
  const {page}=await openPhone(ownName('Lead toast relay'),{lead:true});
  await openAt(page,made.race.id,'races');
  await press(page.locator('footer.rz-footer').getByRole('button',{name:"That's everyone",exact:true}));
  await onTab(page,'Relays');
  await savedToast(page,'Runners saved · Girl Cubs Heat 1');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-toast-relay.png')});
  await deleteCurrentRace(request,code);
});

test('a lead correcting Times after the Timer marked it done stays on the race with no toast',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Lead toast correct');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {race}=await writeCheckIn(request,owner(),code,[2021,2022]);
  // The Timer typed one time and tapped No more finishers.
  await writeTimes(request,owner(),code,[1300]);
  await flowPost(request,owner(),`/api/races/${race.id}/steps/times/done`,{});
  const {page}=await openPhone(ownName('Lead toast correct'),{lead:true});
  await openAt(page,race.id,'races');
  const tabs=page.getByRole('tablist',{name:'Heat 1 steps'});
  await press(tabs.getByRole('tab',{name:/^Times/}));
  // The 2nd place's time is the last place's: it marks Times done again, which changes nothing.
  await enterTime(page,'1400');
  await expect.poll(async()=>(await read(request,race.id)).race.parts.times.value?.places).toEqual([1300,1400]);
  await expect(page.getByRole('button',{name:'2nd place: 14.00',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(tabs.getByRole('tab',{name:/^Times/})).toHaveAttribute('aria-selected','true');
  await expect(toast(page)).toHaveCount(0);
  await deleteCurrentRace(request,code);
});

test('a lead tapping each done button on an unsaved heat whose steps are already done is told so, with why the heat is not in Results, and sees the same done marks as a volunteer',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Lead done answer'),bands=[2031,2032,2033,2034,2035,2036,2037,2038];
  await ownEvent(request,code,name,'Girl Cubs','heats');
  // The demonstration run: more runners than usual, all placed, the last two with no time, every volunteer's step marked done.
  const timer=await openPhone(ownName('Done answer timer'),{job:'timer'});
  const {race}=await writeCheckIn(request,timer.token,code,bands);
  await writeOrder(request,timer.token,code,bands);
  await writeTimes(request,timer.token,code,[1100,1200,1300,1400,1500,1600]);
  for(const step of ['runners','positions','times']) await flowPost(request,timer.token,`/api/races/${race.id}/steps/${step}/done`,{});
  const lead=await openPhone(ownName('Done answer lead'),{lead:true}),{page}=lead;
  // The lead disqualifies one of the two: the heat still has a place with no time.
  const entry=race.parts.runners.value!.find(runner=>'wristband' in runner && runner.wristband===2038)!;
  expect((await request.post(`/api/lead/races/${race.id}/runners/${entry.id}/disqualify`,{headers:{authorization:`Bearer ${lead.token}`},data:{reason:'Out of lane',comment:''}})).ok()).toBe(true);
  await openAt(page,race.id,'races');
  const tabs=page.getByRole('tablist',{name:'Heat 1 steps'}),answer=(step:string)=>page.getByText(`${step} already done. Not in Results yet: 7th place has no time.`,{exact:true});
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  await expect(answer('Runners are')).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-done-answer.png')});
  await press(tabs.getByRole('tab',{name:/^Finishing order/}));
  await expect(answer('Runners are')).toHaveCount(0);
  await press(page.getByRole('button',{name:'Save the order',exact:true}));
  await expect(answer('Finishing order is')).toBeVisible();
  await press(tabs.getByRole('tab',{name:/^Times/}));
  await press(page.getByRole('button',{name:'No more finishers',exact:true}));
  await expect(answer('Times are')).toBeVisible();
  // Still on the race: nothing was saved, so no toast and no trip to Races.
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
  // Both phones mark every step done.
  await timer.page.goto(`/races/${race.id}`);
  await expect(timer.page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  for(const phone of [page,timer.page]) await expect(phone.locator('.rz-step__label:has(.rz-icon)')).toHaveText(['Runners','Finishing order','Times']);
  await deleteCurrentRace(request,code);
});
