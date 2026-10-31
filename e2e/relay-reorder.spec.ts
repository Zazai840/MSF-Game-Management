import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,expect,flowPost,live,lookProblems,ownCode,ownRelay,ownWristbands,runHeat,startDrag,test,writeTeam,type APIRequestContext,type Page} from './fixtures.js';
/** A team's card at check-in, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const sheet=(page:Page,title:string)=>page.getByRole('dialog',{name:title,exact:true});
const grip=(scope:Page|ReturnType<Page['getByRole']>,name:string|number)=>scope.getByRole('button',{name:`Move ${name}`,exact:true});
const grips=(scope:ReturnType<Page['getByRole']>)=>scope.getByRole('button',{name:/^Move /});
/** A heat card's leg rows as they read: "1st leg2071". */
const heatLegs=(page:Page,team:number)=>card(page,team).locator('.rz-attendance__who');
const finalLegs=(page:Page,team:number)=>card(page,team).locator('.rz-teamlegs li');
const boxes=(page:Page,title:string)=>Promise.all(['1st leg','2nd leg','3rd leg','4th leg'].map(leg=>sheet(page,title).getByLabel(leg,{exact:true}).inputValue()));
const read=async(request:APIRequestContext,token:string,raceId:string)=>await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${token}`}})).json() as RaceFlowRead;
/** Every grip on the page is a 44px target. */
async function gripsAreTargets(page:Page) {
  for(const box of await page.getByRole('button',{name:/^Move /}).evaluateAll(items=>items.map(item=>item.getBoundingClientRect()).map(({width,height})=>({width,height})))) {
    expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

test('two start-line phones: a grip drag on a heat team card reorders its legs on both, Here following the child, and the leg boxes reorder only the draft',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay reorder');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',34);
  const samName=ownName('Sam Patel reorder'),sam=await openPhone(samName),priya=await openPhone(ownName('Priya Shah reorder'));
  await writeTeam(request,sam.token,code,[w(11),w(12),w(13),null]);
  await writeTeam(request,sam.token,code,[w(21),w(22),w(23),w(24)]);
  let made=await flowPost(request,sam.token,'/api/races',{eventCode:code,kind:'heat',number:1});
  const raceId=made.race.id;
  for(const team of made.teams!) made=await flowPost(request,sam.token,`/api/races/${raceId}/teams/${team.id}/tick`,{});
  for(const phone of [sam,priya]) await phone.page.goto(`/races/${raceId}`);
  const [one,two]=[sam.page,priya.page];
  await expect(heatLegs(one,1)).toHaveText(['1st leg'+w(11),'2nd leg'+w(12),'3rd leg'+w(13),'4th leg–']);
  await expect(grip(card(one,1),'empty 4th leg')).toBeVisible();
  await gripsAreTargets(one);
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('heat-grips.png'),fullPage:true});
  await one.locator('footer.rz-footer').getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(one.locator('.rz-toast')).toContainText('Runners saved');
  // Done, the phone goes back to the races; Sam opens the heat again, its grips still there until it is saved.
  await one.goto(`/races/${raceId}`);

  // A drag from the grip: the labels follow live, and the drop lands on both phones.
  const drag=await startDrag(one,grip(one,w(11)));
  await drag.over(heatLegs(one,1).nth(2));
  await expect(card(one,1).locator('li[data-dragging="true"] .rz-attendance__seed')).toHaveText('3rd leg');
  await one.screenshot({path:info.outputPath('heat-dragging.png')});
  await drag.drop();
  for(const page of [one,two]) await expect(heatLegs(page,1)).toHaveText(['1st leg'+w(12),'2nd leg'+w(13),'3rd leg'+w(11),'4th leg–'],live);
  // A drop after That's everyone keeps the step done.
  expect((await read(request,priya.token,raceId)).steps.runners!.state).toBe('done');
  // Arrow keys on a grip move its leg at once: the empty 4th leg moves up to 3rd.
  await grip(card(two,1),'empty 4th leg').press('ArrowUp');
  for(const page of [one,two]) await expect(heatLegs(page,1)).toHaveText(['1st leg'+w(12),'2nd leg'+w(13),'3rd leg–','4th leg'+w(11)],live);

  // Priya opens Team 2's Edit: her own grips hide, and Sam sees who is changing it, with no grips on it.
  await card(two,2).getByRole('button',{name:'Edit Team 2',exact:true}).click();
  const edit=sheet(two,'Edit team 2');
  await expect(edit).toBeVisible();
  await expect(grips(card(two,1))).toHaveCount(0);
  await expect(card(one,2)).toContainText('is changing this team',live);
  await expect(grips(card(one,2))).toHaveCount(0);
  await expect(grips(card(one,1))).toHaveCount(4);
  // In the leg boxes a drag reorders the draft only, and does not close the sheet; Cancel puts it back.
  await gripsAreTargets(two);
  expect(await lookProblems(two)).toEqual([]);
  await two.screenshot({path:info.outputPath('edit-grips.png')});
  const boxDrag=await startDrag(two,grip(edit,w(21)));
  await boxDrag.over(edit.getByLabel('4th leg',{exact:true}));
  await boxDrag.drop();
  await expect(edit).toBeVisible();
  expect(await boxes(two,'Edit team 2')).toEqual([w(22),w(23),w(24),w(21)].map(String));
  await expect(heatLegs(one,2)).toHaveText(['1st leg'+w(21),'2nd leg'+w(22),'3rd leg'+w(23),'4th leg'+w(24)]);
  await edit.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(edit).toHaveCount(0);
  await expect(heatLegs(two,2)).toHaveText(['1st leg'+w(21),'2nd leg'+w(22),'3rd leg'+w(23),'4th leg'+w(24)]);
  // Again, by the keyboard this time, and saved.
  await card(two,2).getByRole('button',{name:'Edit Team 2',exact:true}).click();
  await grip(edit,w(21)).press('ArrowDown');
  expect(await boxes(two,'Edit team 2')).toEqual([w(22),w(21),w(23),w(24)].map(String));
  await edit.getByRole('button',{name:'Save team 2',exact:true}).click();
  for(const page of [one,two]) await expect(heatLegs(page,2)).toHaveText(['1st leg'+w(22),'2nd leg'+w(21),'3rd leg'+w(23),'4th leg'+w(24)],live);
  await expect(grips(card(one,2))).toHaveCount(4,live);

  // New team: a drag moves a typed number to another leg and an empty box up, and Cancel discards the draft.
  await one.getByRole('button',{name:'New team',exact:true}).click();
  const added=sheet(one,'New team · joins this heat');
  await added.getByLabel('1st leg',{exact:true}).fill(String(w(31)));
  await added.getByLabel('2nd leg',{exact:true}).fill(String(w(32)));
  await expect(grip(added,'empty 3rd leg')).toBeVisible();
  await gripsAreTargets(one);
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('new-team-grips.png')});
  await grip(added,w(31)).press('ArrowDown');
  expect(await boxes(one,'New team · joins this heat')).toEqual([String(w(32)),String(w(31)),'','']);
  await added.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(card(one,3)).toHaveCount(0);
  expect((await read(request,sam.token,raceId)).teams!.map(team=>team.number)).toEqual([1,2]);
});

test('a relay final: a grip drag on a finalist team reorders its legs on both phones, and the grips go once the final is saved',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay final reorder');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',24);
  const lead=await openPhone(ownName('Jo Evans final reorder'),{lead:true}),sam=await openPhone(ownName('Sam Patel final reorder'));
  for(const team of [1,2]) await writeTeam(request,sam.token,code,[w(team*10+1),w(team*10+2),w(team*10+3),w(team*10+4)]);
  await runHeat(request,sam.token,code,2);
  const final:RaceFlowRead=await flowPost(request,lead.token,'/api/races',{eventCode:code,kind:'final'});
  for(const phone of [lead,sam]) await phone.page.goto(`/races/${final.race.id}`);
  const page=sam.page;
  await card(page,2).getByRole('button',{name:'Team 2: Here',exact:true}).click();
  await gripsAreTargets(page);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-grips.png'),fullPage:true});
  const drag=await startDrag(page,grip(page,w(24)));
  await drag.over(finalLegs(page,2).first());
  await expect(card(page,2).locator('li[data-dragging="true"] .rz-teamlegs__leg')).toHaveText('1st leg');
  await drag.drop();
  for(const phone of [page,lead.page]) await expect(finalLegs(phone,2)).toHaveText(['1st leg'+w(24),'2nd leg'+w(21),'3rd leg'+w(22),'4th leg'+w(23)],live);
  await expect(card(page,2).getByRole('button',{name:'Team 2: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  // Saved, the final keeps its order and its grips go.
  await card(page,1).getByRole('button',{name:'Team 1: Here',exact:true}).click();
  await expect(card(page,1).getByRole('button',{name:'Team 1: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  const id=(read:RaceFlowRead,number:number)=>read.race.parts.runners.value!.find(entry=>'team' in entry && entry.team.number===number)!.id;
  const seen=await flowPost(request,sam.token,`/api/races/${final.race.id}/steps/runners/done`,{});
  const placed=await flowPost(request,sam.token,`/api/races/${final.race.id}/order`,{raceId:final.race.id,version:seen.race.parts.finish.version,order:[id(seen,2),id(seen,1)],didNotFinish:[],didNotRun:[],added:[]});
  expect(placed.race.parts.finish.value!.order).toHaveLength(2);
  expect((await flowPost(request,sam.token,`/api/races/${final.race.id}/steps/positions/done`,{})).race.state).toBe('saved');
  await page.goto(`/races/${final.race.id}`);
  await expect(finalLegs(page,2)).toHaveText(['1st leg'+w(24),'2nd leg'+w(21),'3rd leg'+w(22),'4th leg'+w(23)]);
  await expect(grips(card(page,2))).toHaveCount(0);
});
