import { deleteCurrentRace,enterTime,expect,openRaceScreen,ownEvent,signInThroughApi,test,writeCheckIn,writeOrder,type APIRequestContext,type Page } from './fixtures.js';
const amber='rgb(255, 244, 220)';
const orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
/** A timed race of five Girl Cubs, checked in and placed in wristband order by another phone, waiting for times. */
async function raceWaitingForTimes(request:APIRequestContext,code:string,name:string) {
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const other=await signInThroughApi(request,`Order ${name}`);
  await writeCheckIn(request,other,code,[2601,2602,2603,2604,2605]);
  await writeOrder(request,other,code,[2601,2602,2603,2604,2605]);
}
/** On the race screen with the times the one free column: opening Order and Times takes them. */
async function doTheTimes(page:Page,name:string) {
  await openRaceScreen(page,name);await orderCard(page).click();
  await expect(orderCard(page)).toHaveAccessibleName(/· Times: You$/);
}
const savedTimes=async(request:APIRequestContext,code:string)=>(await (await request.get(`/api/race-screen/${code}`,{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`}})).json()).race.parts.times.value;

test('a wrong time shows in amber with a reason, Fix time or Keep; a kept one stays amber for a lead, and a retyped place clears it',async({openPhone,request},info)=>{
  const project=info.project.name,code=`WA-${project.toUpperCase()}`,name=`Times wrong ${project}`;
  await raceWaitingForTimes(request,code,name);
  const {page}=await openPhone(`Wrong times ${project}`);
  await doTheTimes(page,name);
  await expect(page.getByText('Race 1 · 5 runners',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'1st place time?',exact:true})).toBeVisible();
  const input=page.getByLabel('Place time',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).toHaveAttribute('enterkeyhint','next');
  await input.click();await input.pressSequentially('12.44');await expect(input).toHaveValue('1244');
  await expect(page.getByText('Shows as 12.44',{exact:true})).toBeVisible();
  await input.press('Enter');await expect(input).toBeFocused();await expect(input).toHaveValue('');
  await expect(page.getByRole('heading',{name:'2nd place time?',exact:true})).toBeVisible();
  await enterTime(page,'1281');await enterTime(page,'1305');
  await input.fill('13240');await expect(page.getByText('Shows as 1:32.40',{exact:true})).toBeVisible();
  // The 4th place time is faster than 3rd: Fix time or Keep, with the keyboard closed.
  await enterTime(page,'1290');
  const warning=page.getByRole('alert').filter({hasText:'The 4th place time is faster than 3rd.'});
  await expect(warning).toBeVisible();await expect(input).not.toBeFocused();
  const fourth=page.getByRole('button',{name:'4th place · 12.90 · Faster than 3rd place',exact:true});
  await expect(fourth).toBeVisible();expect(await fourth.evaluate(element=>getComputedStyle(element.closest('td')!).backgroundColor)).toBe(amber);
  // The reason fits on one line in the Time cell, even at phone width.
  const reason=fourth.locator('.wrong-time-reason');
  expect(await reason.evaluate(element=>Math.round(element.getBoundingClientRect().height/parseFloat(getComputedStyle(element).lineHeight)))).toBe(1);
  expect(await reason.evaluate(element=>element.getBoundingClientRect().right<=element.closest('td')!.getBoundingClientRect().right)).toBe(true);
  await page.screenshot({path:info.outputPath('times-entry-wrong.png'),fullPage:true});
  // Fix time retypes it.
  await warning.getByRole('button',{name:'Fix time',exact:true}).click();
  await expect(page.getByRole('heading',{name:'4th place time?',exact:true})).toBeVisible();
  await expect(input).toBeFocused();await expect(input).toHaveValue('');
  await enterTime(page,'1290');
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  // Kept: it stays amber, with a calm note instead of the warning, and the next place is up.
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'5th place time?',exact:true})).toBeVisible();
  await expect(page.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toBeVisible();
  expect(await fourth.evaluate(element=>getComputedStyle(element.closest('td')!).backgroundColor)).toBe(amber);
  await expect.poll(()=>savedTimes(request,code)).toEqual({places:[1244,1281,1305,1290],outOfOrder:true,keptWrong:[3]});
  // Retype 3rd so it is faster than 2nd: the warning asks again about that place.
  await page.getByRole('button',{name:'3rd place · 13.05',exact:true}).click();
  await expect(page.getByRole('heading',{name:'3rd place time?',exact:true})).toBeVisible();
  await expect(input).toHaveValue('1305');await input.fill('1250');await expect(page.getByText('Shows as 12.50',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  const third=page.getByRole('alert').filter({hasText:'The 3rd place time is faster than 2nd.'});
  await expect(third).toBeVisible();
  await expect(page.getByRole('button',{name:'3rd place · 12.50 · Faster than 2nd place',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'4th place · 12.90',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('times-wrong-retyped.png'),fullPage:true});
  await third.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(page.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('times-kept.png'),fullPage:true});
  await expect.poll(()=>savedTimes(request,code)).toEqual({places:[1244,1281,1250,1290],outOfOrder:true,keptWrong:[2]});
  // Retyping the place clears the amber.
  await page.getByRole('button',{name:'3rd place · 12.50 · Faster than 2nd place',exact:true}).click();
  await input.fill('1285');await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('button',{name:'3rd place · 12.85',exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'5th place time?',exact:true})).toBeVisible();
  await expect.poll(()=>savedTimes(request,code)).toEqual({places:[1244,1281,1285,1290],outOfOrder:false,keptWrong:[]});
  await deleteCurrentRace(request,code);
});

test('tapping a time while typing retypes that place, then the next place is up again',async({openPhone,request},info)=>{
  const project=info.project.name,code=`WC-${project.toUpperCase()}`,name=`Times chip ${project}`;
  await raceWaitingForTimes(request,code,name);
  const {page}=await openPhone(`Chip retype ${project}`);
  await doTheTimes(page,name);
  await enterTime(page,'1100');await enterTime(page,'1200');
  const input=page.getByLabel('Place time',{exact:true});
  await input.fill('13');
  await page.getByRole('button',{name:'1st place · 11.00',exact:true}).click();
  await expect(page.getByRole('heading',{name:'1st place time?',exact:true})).toBeVisible();
  await expect(input).toHaveValue('1100');
  await input.fill('1050');await expect(page.getByText('Shows as 10.50',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'3rd place time?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'1st place · 10.50',exact:true})).toBeVisible();
  // Cancel leaves a place as it was.
  await page.getByRole('button',{name:'2nd place · 12.00',exact:true}).click();
  await input.fill('900');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('heading',{name:'3rd place time?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'2nd place · 12.00',exact:true})).toBeVisible();
  await expect.poll(async()=>(await savedTimes(request,code)).places).toEqual([1050,1200]);
  await deleteCurrentRace(request,code);
});
