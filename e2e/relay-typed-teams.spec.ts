import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,enterTime,expect,flowPost,live,lookProblems,ownCode,ownRelay,ownWristbands,press,test,type Page} from './fixtures.js';
const meta=(page:Page)=>page.locator('.rz-prompt__meta');
const prompt=(page:Page)=>page.getByRole('heading',{level:2});
const box=(page:Page)=>page.locator('main .rz-field__input');
const footer=(page:Page)=>page.locator('footer.rz-footer');
/** A team under "In this heat", by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const typing=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}, being typed`,exact:true});
/** A saved team's leg chips as they read: "1st2041". */
const chips=(page:Page,team:number)=>card(page,team).locator('.rz-legchip');
const chip=(page:Page,team:number,leg:string)=>card(page,team).getByRole('button',{name:new RegExp(`^Team ${team} ${leg} leg: .*\\. Change$`)});
const stillToRun=(page:Page)=>page.getByRole('list',{name:'Still to run'});
/** Types one leg into the start line's box and taps the footer's button (Next, or Save Team N on the 4th leg). */
async function leg(page:Page,wristband:number,button='Next') {
  await box(page).fill(String(wristband));
  await press(footer(page).getByRole('button',{name:button,exact:true}));
}

test('four phones run a relay heat whose teams are typed in leg by leg: two start lines typing at once, a leg chip change, Take off and Add back, the finish line and the timer',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay typed');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',34);
  const sam=await openPhone(ownName('Sam Patel typed')),priyaName=ownName('Priya Shah typed'),priya=await openPhone(priyaName);
  const finish=await openPhone(ownName('Finish typed'),{job:'finish'}),timer=await openPhone(ownName('Timer typed'),{job:'timer'});
  const made:RaceFlowRead=await flowPost(request,sam.token,'/api/races',{eventCode:code,kind:'heat',number:1}),raceId=made.race.id;
  for(const phone of [sam,priya,finish,timer]) await phone.page.goto(`/races/${raceId}`);
  const [one,two,line,clock]=[sam.page,priya.page,finish.page,timer.page];

  // One box, leg by leg, the team being typed as four leg chips; That's everyone greyed while a team is part-typed.
  await expect(prompt(one)).toHaveText('Team 1 · 1st leg: wristband number?');
  await expect(box(one)).toBeFocused();
  await leg(one,w(11));
  await leg(one,w(12));
  await expect(prompt(one)).toHaveText('Team 1 · 3rd leg: wristband number?');
  await expect(typing(one,1).locator('.rz-legchip')).toHaveText([`1st${w(11)}`,`2nd${w(12)}`,'3rd?','4th–']);
  await expect(typing(one,1)).toContainText('2 of 4');
  await expect(footer(one).getByRole('button',{name:"That's everyone",exact:true})).toBeDisabled();
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('typing.png'),fullPage:true});
  // A part-typed team lives only on its phone: Priya doesn't see it, and types her own as Team 1 too.
  await expect(prompt(two)).toHaveText('Team 1 · 1st leg: wristband number?');
  await expect(typing(two,1)).toContainText('0 of 4');
  await expect(card(two,1)).toHaveCount(0);
  for(const number of [21,22,23]) await leg(two,w(number));
  await expect(footer(two).getByRole('button',{name:'Save Team 1',exact:true})).toBeVisible();
  await leg(two,w(24),'Save Team 1');
  await expect(two.locator('p.rz-note[role=status]')).toHaveText(`Team 1 checked in: ${w(21)}, ${w(22)}, ${w(23)}, ${w(24)}`);
  await expect(prompt(two)).toHaveText('Team 2 · 1st leg: wristband number?');
  // Sam sees Priya's team at once, his own part-typed team kept, now numbered Team 2.
  await expect(chips(one,1)).toHaveText([`1st${w(21)}`,`2nd${w(22)}`,`3rd${w(23)}`,`4th${w(24)}`],live);
  await expect(prompt(one)).toHaveText('Team 2 · 3rd leg: wristband number?');
  await leg(one,w(13));
  await leg(one,w(14),'Save Team 2');
  await expect(one.locator('p.rz-note[role=status]')).toHaveText(`Team 2 checked in: ${w(11)}, ${w(12)}, ${w(13)}, ${w(14)}`);
  await expect(card(two,2)).toBeVisible(live);
  // A short team: "Save Team 3 with 2".
  await leg(two,w(31));
  await leg(two,w(32));
  await press(two.getByRole('button',{name:'Save Team 3 with 2',exact:true}));
  await expect(chips(one,3)).toHaveText([`1st${w(31)}`,`2nd${w(32)}`,'3rd–','4th–'],live);
  await expect(card(one,3)).toContainText('Runs short · 2 of 4');
  for(const page of [one,two]) await expect(meta(page)).toHaveText('Heat 1 · 3 teams · 10 children here',live);
  // A part-typed team is lost on reload.
  await leg(one,w(33));
  await one.reload();
  await expect(prompt(one)).toHaveText('Team 4 · 1st leg: wristband number?');
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('in-this-heat.png'),fullPage:true});

  // A leg chip opens the box on that leg; Save changes it on both phones.
  await press(chip(one,2,'2nd'));
  await expect(prompt(one)).toHaveText("Change Team 2's 2nd leg");
  await expect(box(one)).toHaveValue(String(w(12)));
  await box(one).fill(String(w(15)));
  await press(footer(one).getByRole('button',{name:'Save',exact:true}));
  await expect(one.locator('p.rz-note[role=status]')).toHaveText(`Team 2: 2nd leg changed to ${w(15)}`);
  await expect(chips(two,2)).toHaveText([`1st${w(11)}`,`2nd${w(15)}`,`3rd${w(13)}`,`4th${w(14)}`],live);
  // A change on an old version is refused as changed, with Show latest.
  await press(chip(one,2,'4th'));
  const read:RaceFlowRead=await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${priya.token}`}})).json();
  const team2=read.teams!.find(team=>team.number===2)!;
  await flowPost(request,priya.token,`/api/relays/${read.group.event.id}/teams/${team2.id}`,{version:team2.version,legs:[w(11),w(15),w(13),w(16)],keptWarnings:[],raceId});
  await box(one).fill(String(w(17)));
  await press(footer(one).getByRole('button',{name:'Save',exact:true}));
  await expect(one.getByText(`${priyaName} changed this a moment ago.`)).toBeVisible();
  await press(one.getByRole('button',{name:'Show latest',exact:true}));
  await expect(box(one)).toHaveValue(String(w(16)));
  await press(footer(one).getByRole('button',{name:'Cancel',exact:true}));
  await expect(prompt(one)).toHaveText('Team 4 · 1st leg: wristband number?');

  // Take off returns a team to Still to run under the box; Add puts it back with every child checked in.
  await press(card(two,3).getByRole('button',{name:'Take off',exact:true}));
  await expect(card(one,3)).toHaveCount(0,live);
  await expect(stillToRun(one).getByRole('listitem')).toHaveCount(1,live);
  await press(stillToRun(one).getByRole('button',{name:'Add Team 3',exact:true}));
  await expect(card(two,3)).toBeVisible(live);
  await expect(stillToRun(two)).toHaveCount(0,live);
  await press(footer(one).getByRole('button',{name:"That's everyone",exact:true}));
  await expect(one.locator('.rz-toast')).toContainText('Runners saved · Girl Cubs Heat 1');

  // The finish line places team tiles, each its 4th leg's wristband; the timer times each team; the race saves itself.
  await expect(line.getByRole('list',{name:'Teams not yet placed'}).getByRole('button')).toHaveText([String(w(24)),String(w(16)),String(w(32))],live);
  for(const name of [w(16),w(24),w(32)])
    await press(line.getByRole('button',{name:new RegExp(`^${name} came `)}));
  await press(footer(line).getByRole('button',{name:'Save the order',exact:true}));
  await expect(line.locator('.rz-toast')).toContainText('Finishing order saved');
  for(const digits of ['1412','1530','1611']) await enterTime(clock,digits);
  await expect(clock.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  const saved:RaceFlowRead=await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${sam.token}`}})).json();
  expect(saved.race.state).toBe('saved');
});

test('a typed leg is checked as at individual check-in: a child in another team of this heat refused with Fix number only, a child who ran in another heat warned with Fix number / Keep, kept with the leg',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay leg checks');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',8),sam=await openPhone(ownName('Sam Patel leg checks'));
  const post=(url:string,data:object)=>flowPost(request,sam.token,url,data);
  // Heat 1 runs with Team 1.
  let read=await post('/api/races',{eventCode:code,kind:'heat',number:1});
  const one=read.race.id,url=(what:string)=>`/api/races/${one}/${what}`;
  read=await post(`/api/relays/${read.group.event.id}/teams`,{legs:[w(1),w(2),w(3),w(4)],keptWarnings:[],joinRaceId:one});
  read=await post(url('steps/runners/done'),{});
  read=await post(url('order'),{raceId:one,version:read.race.parts.finish.version,order:read.race.parts.runners.value!.map(entry=>entry.id),didNotFinish:[],didNotRun:[],added:[]});
  read=await post(url('steps/positions/done'),{});
  read=await post(url('times'),{raceId:one,version:read.race.parts.times.version,places:[3400],keptWrong:[]});
  expect((await post(url('steps/times/done'),{})).race.state).toBe('saved');
  const two=await post('/api/races',{eventCode:code,kind:'heat',number:2}),page=sam.page;
  await page.goto(`/races/${two.race.id}`);
  for(const number of [5,6,7]) await leg(page,w(number));
  await leg(page,w(8),'Save Team 2');
  await expect(card(page,2)).toBeVisible();

  // A child already in Team 2 of this heat is refused: Fix number only.
  await leg(page,w(6));
  const callout=page.locator('main .rz-callout');
  await expect(callout).toContainText(`${w(6)} is already in Team 2 in this heat. Each child runs for one team.`);
  await expect(callout.getByRole('button',{name:'Keep'})).toHaveCount(0);
  await press(callout.getByRole('button',{name:'Fix number',exact:true}));
  await expect(callout).toHaveCount(0);
  await expect(prompt(page)).toHaveText('Team 3 · 1st leg: wristband number?');

  // A child who ran in Heat 1 is warned: Fix number or Keep. Keep takes the leg.
  await leg(page,w(1));
  await expect(callout).toContainText(`${w(1)} already ran in Heat 1, in Team 1.`);
  await expect(callout.getByRole('button',{name:'Fix number',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('leg-warning.png'),fullPage:true});
  await press(callout.getByRole('button',{name:'Keep',exact:true}));
  await expect(prompt(page)).toHaveText('Team 3 · 2nd leg: wristband number?');
  await expect(typing(page,3).locator('.rz-legchip')).toHaveText([`1st${w(1)}`,'2nd?','3rd–','4th–']);
  await press(page.getByRole('button',{name:'Save Team 3 with 1',exact:true}));
  await expect(chips(page,3)).toHaveText([`1st${w(1)}`,'2nd–','3rd–','4th–']);
  const saved:RaceFlowRead=await (await request.get(`/api/races/${two.race.id}`,{headers:{authorization:`Bearer ${sam.token}`}})).json();
  expect(saved.teams!.find(team=>team.number===3)!.legs[0].warnings).toEqual([{kind:'other-heat',message:`${w(1)} already ran in Heat 1, in Team 1.`,kept:true}]);
});
