import {ownCode,ownWristbands,writeOrder,deleteCurrentRace,enterTime,expect,flowRace,inViewAboveFooter,live,lookProblems,openRace,ownEvent,selected,signInThroughApi,test,writeCheckIn,type APIRequestContext,type Locator,type Page} from './fixtures.js';
// The design system's warn-soft.
const amber='rgb(255, 241, 199)',gold='rgb(255, 184, 0)',navy='rgb(30, 43, 81)';
const slot=(page:Page,label:string)=>page.getByRole('button',{name:label,exact:true});
/** A timed race of five Girl Cubs, checked in by another phone, waiting for times. */
async function raceWaitingForTimes(request:APIRequestContext,code:string,name:string) {
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,`Start ${name}`),code,[2601,2602,2603,2604,2605]);
}
const savedTimes=async(request:APIRequestContext,code:string)=>(await flowRace(request,process.env.E2E_OWNER_TOKEN!,code)).race.parts.times.value;

test('a wrong time shows in amber with a reason, Fix time or Keep; a kept one stays marked, and a retyped place clears it',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Times wrong ${project}`;
  await raceWaitingForTimes(request,code,name);
  const {page}=await openPhone(`Wrong times ${project}`,{job:'timer'});
  await openRace(page,name);
  // Times never wait for the finish line: one slot per runner checked in.
  await expect(page.locator('.rz-prompt__meta')).toHaveText('Heat 1 · 5 runners');
  await expect(page.getByRole('heading',{level:2,name:'1st place time?'})).toBeVisible();
  await expect(page.getByRole('list',{name:'Place times'}).getByRole('listitem')).toHaveCount(5);
  const input=page.getByLabel('Place time',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).toHaveAttribute('enterkeyhint','next');
  await expect(page.getByText('Type digits only: 1234 shows as 12.34.',{exact:true})).toBeVisible();
  await input.click();await input.pressSequentially('12.44');await expect(input).toHaveValue('1244');
  await expect(page.locator('.rz-field__hint')).toHaveText('Shows as 12.44. Type digits only.');
  await input.press('Enter');await expect(input).toBeFocused();await expect(input).toHaveValue('');
  await expect(page.getByRole('heading',{level:2,name:'2nd place time?'})).toBeVisible();
  await enterTime(page,'1281');await enterTime(page,'1305');
  await expect(page.getByRole('heading',{level:2,name:'4th place time?'})).toBeVisible();
  await input.fill('13240');await expect(page.locator('.rz-field__hint')).toHaveText('Shows as 1:32.40. Type digits only.');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('timer.png'),fullPage:true});
  // The 4th place time is faster than 3rd: Fix time or Keep, with the keyboard closed.
  await input.fill('1290');await input.press('Enter');
  const warning=page.getByRole('alert').filter({hasText:'The 4th place time is faster than 3rd.'});
  await expect(warning).toBeVisible();await expect(input).not.toBeFocused();
  const fourth=slot(page,'4th place: 12.90, Faster than 3rd place');
  await expect(fourth).toBeVisible();
  await page.screenshot({path:info.outputPath('timer-wrong.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  // Tapping the time box opens the typed time to edit, selected; Enter checks it again.
  await input.click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole('heading',{level:2,name:'4th place time?'})).toBeVisible();
  await expect(input).toBeFocused();await expect(input).toHaveValue('1290');
  await expect.poll(()=>selected(page,'Place time')).toBe('1290');
  await input.press('Enter');
  await expect(warning).toBeVisible();
  // Fix time does the same: the time stays, selected, so typing replaces it.
  await warning.getByRole('button',{name:'Fix time',exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:'4th place time?'})).toBeVisible();
  await expect(input).toBeFocused();await expect(input).toHaveValue('1290');
  await expect.poll(()=>selected(page,'Place time')).toBe('1290');
  await input.pressSequentially('1290');await input.press('Enter');
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  // Kept: it stays marked, its note says Kept, and the next place is up.
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole('heading',{level:2,name:'5th place time?'})).toBeVisible();
  await expect(fourth).toContainText('Kept');
  expect(await fourth.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(amber);
  await expect.poll(()=>savedTimes(request,code)).toEqual({places:[1244,1281,1305,1290],outOfOrder:true,keptWrong:[3]});
  // Retype 3rd so it is faster than 2nd: the warning asks again about that place.
  await slot(page,'3rd place: 13.05').click();
  await expect(page.getByRole('heading',{level:2,name:'3rd place time?'})).toBeVisible();
  await expect(input).toHaveValue('1305');await input.fill('1250');
  await input.press('Enter');
  const third=page.getByRole('alert').filter({hasText:'The 3rd place time is faster than 2nd.'});
  await expect(third).toBeVisible();
  await expect(slot(page,'3rd place: 12.50, Faster than 2nd place')).toBeVisible();
  await expect(slot(page,'4th place: 12.90')).toBeVisible();
  await third.getByRole('button',{name:'Keep',exact:true}).click();
  await expect.poll(()=>savedTimes(request,code)).toEqual({places:[1244,1281,1250,1290],outOfOrder:true,keptWrong:[2]});
  // Retyping the place clears it.
  await slot(page,'3rd place: 12.50, Faster than 2nd place').click();
  await input.fill('1285');await input.press('Enter');
  await expect(slot(page,'3rd place: 12.85')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading',{level:2,name:'5th place time?'})).toBeVisible();
  await expect.poll(()=>savedTimes(request,code)).toEqual({places:[1244,1281,1285,1290],outOfOrder:false,keptWrong:[]});
  // The last place's time marks Times done: back on Races with the toast.
  await enterTime(page,'1400');
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await expect(page.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  await deleteCurrentRace(request,code);
});

test('on a 12-runner heat the slots are 4 across, and a wrong time\'s warning, Fix time and Keep sit just above the number box, in view, with the footer saying why it waits',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Times big ${project}`,n=await ownWristbands('Girl Cubs',12);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,`Start ${name}`),code,Array.from({length:12},(_,index)=>n(index)));
  const {page}=await openPhone(`Big heat ${project}`,{job:'timer'});
  await openRace(page,name);
  const slots=page.getByRole('list',{name:'Place times'}).getByRole('listitem');
  await expect(slots).toHaveCount(12);
  const rows=await slots.evaluateAll(items=>items.map(item=>Math.round(item.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(3);
  await enterTime(page,'1100');await enterTime(page,'1200');
  // The current slot: gold with the navy ring, as on the finish line's board.
  const style=(target:Locator)=>target.evaluate(element=>{const style=getComputedStyle(element);return {background:style.backgroundColor,ring:style.boxShadow,color:style.color,opacity:style.opacity};});
  expect(await style(slot(page,'3rd place: no time yet'))).toEqual({background:gold,ring:`${navy} 0px 0px 0px 2px inset`,color:navy,opacity:'1'});
  const input=page.getByLabel('Place time',{exact:true});
  await input.fill('1150');await input.press('Enter');
  const warning=page.getByRole('alert').filter({hasText:'The 3rd place time is faster than 2nd.'});
  await expect(warning).toBeVisible();
  const reason=page.locator('footer.rz-footer').getByText('Fix or keep the 3rd place time first',{exact:true});
  // Navy on the paper footer, an approved colour pair (accessibility.md).
  expect(await style(reason)).toMatchObject({color:navy});
  await inViewAboveFooter(page,[warning,warning.getByRole('button',{name:'Fix time',exact:true}),warning.getByRole('button',{name:'Keep',exact:true}),page.locator('.rz-main > :last-child')]);
  // Directly above the number box.
  const [callout,box]=[(await warning.boundingBox())!,(await input.boundingBox())!];
  expect(box.y-(callout.y+callout.height)).toBeGreaterThanOrEqual(0);expect(box.y-(callout.y+callout.height)).toBeLessThan(48);
  // The wrong time in the amber warning look; the other slots not faded while it waits.
  expect((await style(slot(page,'3rd place: 11.50, Faster than 2nd place'))).background).toBe(amber);
  // Its note does not fit 4 across, so the warning icon says it is wrong without colour; a right time has none.
  await expect(slot(page,'3rd place: 11.50, Faster than 2nd place').locator('.rz-icon')).toBeVisible();
  await expect(slot(page,'1st place: 11.00').locator('.rz-icon')).toHaveCount(0);
  expect(await style(slot(page,'1st place: 11.00'))).toMatchObject({color:navy,opacity:'1'});
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('timer-big-wrong.png')});
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(page.locator('footer.rz-footer')).not.toContainText('Fix or keep');
  await expect(page.getByRole('heading',{level:2,name:'4th place time?'})).toBeVisible();
  await deleteCurrentRace(request,code);
});

test('tapping a time while typing retypes that place, then the next place is up again; Back steps to the last time; No more finishers marks Times done',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Times chip ${project}`;
  await raceWaitingForTimes(request,code,name);
  const {page}=await openPhone(`Chip retype ${project}`,{job:'timer'});
  await openRace(page,name);
  await enterTime(page,'1100');await enterTime(page,'1200');
  const input=page.getByLabel('Place time',{exact:true});
  await input.fill('13');
  await slot(page,'1st place: 11.00').click();
  await expect(page.getByRole('heading',{level:2,name:'1st place time?'})).toBeVisible();
  await expect(input).toHaveValue('1100');
  await input.fill('1050');await input.press('Enter');
  await expect(page.getByRole('heading',{level:2,name:'3rd place time?'})).toBeVisible();
  await expect(slot(page,'1st place: 10.50')).toBeVisible();
  // Back steps to the last time typed, to retype it.
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:'2nd place time?'})).toBeVisible();
  await expect(input).toHaveValue('1200');
  await input.fill('1210');await input.press('Enter');
  await expect.poll(async()=>(await savedTimes(request,code))!.places).toEqual([1050,1210]);
  // Two of five finished: No more finishers marks Times done.
  await page.getByRole('button',{name:'No more finishers',exact:true}).click();
  await expect(page.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  await deleteCurrentRace(request,code);
});

test('once the finishing order is saved, the Timer has one slot per finisher and the last finisher\'s time marks Times done',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Times finishers ${project}`,n=await ownWristbands('Girl Cubs',11);
  const runners=Array.from({length:11},(_,index)=>n(index));
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,`Start ${name}`),code,runners);
  const {page}=await openPhone(`Finishers ${project}`,{job:'timer'});
  await openRace(page,name);
  const slots=page.getByRole('list',{name:'Place times'}).getByRole('listitem');
  // Before the order is saved: one slot per runner.
  await expect(slots).toHaveCount(11);
  await expect(page.locator('.rz-prompt__meta')).toHaveText('Heat 1 · 11 runners');
  await enterTime(page,'1100');
  const finish=await signInThroughApi(request,`Finish ${name}`);
  const ordered=await writeOrder(request,finish,code,runners.slice(0,10),{didNotFinish:[runners[10]]});
  expect((await request.post(`/api/races/${ordered.race.id}/steps/positions/done`,{headers:{authorization:`Bearer ${finish}`},data:{}})).ok()).toBe(true);
  // Saved with one Did not finish: one slot per finisher, live.
  await expect(slots).toHaveCount(10,live);
  await expect(page.locator('.rz-prompt__meta')).toHaveText('Heat 1 · 10 finished · 1 did not finish');
  await expect(page.getByRole('tab',{name:'Finishing order, 10 finished. View read-only',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:/^Times/})).toContainText('You · 1 of 10');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('timer-finishers.png'),fullPage:true});
  for(let place=2;place<=9;place++) await enterTime(page,String(1100+place*10));
  await expect(page.getByRole('heading',{level:2,name:'10th place time?'})).toBeVisible();
  // The 10th and last finisher's time marks Times done.
  await enterTime(page,'1300');
  await expect(page.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  await expect.poll(async()=>(await savedTimes(request,code))?.places.length).toBe(10);
  await deleteCurrentRace(request,code);
});

test('three phones work one heat at once: each sees the others\' steps live, the race saves itself once every step is done and they agree, and a lead sees times joined to wristbands',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Times sprint ${project}`;
  await ownEvent(request,code,name);
  const start=await openPhone(`Sam times ${project}`),finish=await openPhone(`Priya times ${project}`,{job:'finish'}),timer=await openPhone(`Jo times ${project}`,{job:'timer'});
  await request.post('/api/races',{headers:{authorization:`Bearer ${start.token}`},data:{eventCode:code,kind:'heat',number:1}});
  for(const phone of [start,finish,timer]) await openRace(phone.page,name);
  await expect(timer.page.getByText('Places appear here once runners are checked in.',{exact:true})).toBeVisible();
  const input=start.page.getByLabel('Wristband number',{exact:true});
  for(const number of [2201,2202,2203]) {await expect(input).toBeEditable();await input.fill(String(number));await input.press('Enter');}
  // The timer's places come from the start line, live.
  await expect(timer.page.getByRole('list',{name:'Place times'}).getByRole('listitem')).toHaveCount(3,live);
  await expect(timer.page.getByRole('tab',{name:/^Runners/})).toContainText('3 so far',live);
  await start.page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(timer.page.getByRole('tab',{name:/^Runners/})).toContainText('3 checked in',live);
  // The finishing order and times go in at the same time; neither waits for the other.
  await finish.page.getByRole('button',{name:'2202 came 1st',exact:true}).click();
  await enterTime(timer.page,'1234');
  await finish.page.getByRole('button',{name:'2201 came 2nd',exact:true}).click();
  await enterTime(timer.page,'1301');
  await expect(finish.page.getByRole('tab',{name:/^Times/})).toContainText('2 of 3',live);
  await expect(timer.page.getByRole('tab',{name:/^Finishing order/})).toContainText('2 of 3',live);
  await finish.page.getByRole('button',{name:'2203 came 3rd',exact:true}).click();
  await finish.page.getByRole('button',{name:'Save the order',exact:true}).click();
  await expect(finish.page.locator('.rz-toast')).toContainText('Finishing order saved · Girl Cubs Heat 1');
  // Every step done and agreeing: the last one saves the race.
  await enterTime(timer.page,'1350');
  await expect(timer.page.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  const heat1=async()=>(await (await request.get('/api/races',{headers:{authorization:`Bearer ${start.token}`}})).json()).groups.find((group:{event:{code:string}})=>group.event.code===code).races[0].state;
  await expect.poll(heat1).toBe('saved');
  await expect(timer.page.getByRole('article',{name:`${name} · Girl Cubs`})).toBeVisible();
  // A lead's Times tab joins place, wristband and time.
  const lead=await openPhone(`Lead times ${project}`,{lead:true});
  await openRace(lead.page,name);
  await lead.page.getByRole('tab',{name:/^Times/}).click();
  await expect(lead.page.getByRole('list',{name:'Times'}).getByRole('listitem')).toHaveText([/^1st\s*2202\s*12\.34/,/^2nd\s*2201\s*13\.01/,/^3rd\s*2203\s*13\.50/]);
  await expect(lead.page.locator('.rz-refresh')).toHaveText(/^Updated at \d\d:\d\d:\d\d$/);
  expect(await lookProblems(lead.page)).toEqual([]);await lead.page.screenshot({path:info.outputPath('lead-times.png'),fullPage:true});
});
