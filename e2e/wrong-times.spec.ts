import { enterTime,expect,jobButton,createProfile,pickRace,steps,test,type Page } from './fixtures.js';
const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
const amber='rgb(255, 244, 220)';
/** A race of 4 Girl Cubs with its finishing order saved, waiting for times. */
async function raceWaitingForTimes(page:Page,code:string) {
  expect((await page.request.post('/api/day/events',{headers,data:{code,name:'Times wrong',section:'Girl Cubs',format:'timed'}})).ok()).toBe(true);
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const runners=[2601,2602,2603,2604];
  const race=(await (await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners}})).json()).race;
  expect((await page.request.post(`/api/races/${race.id}/finish`,{headers,data:{baseVersion:0,runnersVersion:1,order:runners,didNotFinish:[],didNotRun:[],added:[]}})).ok()).toBe(true);
  created.push(race.id);
  return race as {id:string;number:number};
}
const created:string[]=[];
// Remove the races even when a test fails, so no other Times test opens them as waiting.
test.afterEach(async({request})=>{for(const id of created.splice(0)) await request.post(`/api/lead/races/${id}/delete`,{headers,data:{permanent:true}});});
const savedTimes=async(page:Page,id:string)=>(await (await page.request.get(`/api/races/${id}`,{headers})).json()).parts.times.value;

test('wrong times show in amber with a reason, Keep as it is keeps them for a lead, and a retyped place clears them',async({page},info)=>{
  const code=`TW-${info.project.name.slice(0,3).toUpperCase()}`,race=await raceWaitingForTimes(page,code);
  await page.goto('/');await createProfile(page,`Wrong times ${info.project.name}`);
  await jobButton(page,'Times').click();await pickRace(page,'Times',`Times wrong Girl Cubs (${code}) · Race ${race.number}`);
  // The trail names the job, the race and the place being typed.
  await expect(steps(page).locator('[aria-current=step]')).toHaveText('1st place');
  await expect(steps(page)).toContainText(`Times wrong Girl Cubs Race ${race.number}`);
  const input=page.getByLabel('Place time',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).toHaveAttribute('enterkeyhint','next');
  await input.click();await input.pressSequentially('12.44');await expect(input).toHaveValue('1244');
  await expect(page.getByText('Shows as 12.44',{exact:true})).toBeVisible();
  // Back and No more finishers ride above the keyboard beside Next.
  const bar=page.getByRole('button',{name:'Next',exact:true}).locator('xpath=..');
  await expect(bar.getByRole('button',{name:'Back',exact:true})).toBeVisible();await expect(bar.getByRole('button',{name:'No more finishers',exact:true})).toBeVisible();
  await input.press('Enter');await expect(input).toBeFocused();await expect(input).toHaveValue('');
  await expect(page.getByRole('heading',{name:'2nd place time?',exact:true})).toBeVisible();
  await enterTime(page,'1281');await enterTime(page,'1305');
  await input.fill('13240');await expect(page.getByText('Shows as 1:32.40',{exact:true})).toBeVisible();
  // The 4th place time is faster than 3rd: Fix time or Keep, with the keyboard closed.
  await enterTime(page,'1290');
  const warning=page.getByRole('alert').filter({hasText:'The 4th place time is faster than 3rd.'});
  await expect(warning).toBeVisible();await expect(input).not.toBeFocused();
  const chip=page.getByRole('button',{name:'4th place · 12.90 · Faster than 3rd place',exact:true});
  await expect(chip).toBeVisible();expect(await chip.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(amber);
  await page.screenshot({path:info.outputPath('times-entry-wrong.png'),fullPage:true});
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  // Check screen: the kept time stays amber, with a calm note instead of the banner.
  await expect(page.getByRole('heading',{name:'Check the times',exact:true})).toBeVisible();
  await expect(steps(page).locator('[aria-current=step]')).toHaveText('Check');
  await expect(page.getByText('4 times · 4 finishers',{exact:true})).toBeVisible();
  const fourth=page.getByRole('button',{name:'4th place · 12.90 · Faster than 3rd place',exact:true});
  expect(await fourth.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(amber);
  await expect(page.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toBeVisible();
  await expect(page.locator('[draggable=true]')).toHaveCount(0);
  // Retype 3rd so it is faster than 2nd: the banner asks, and Save waits for the choice.
  await page.getByRole('button',{name:'3rd place · 13.05',exact:true}).click();
  await expect(steps(page).locator('[aria-current=step]')).toHaveText('3rd place');
  await expect(input).toHaveValue('1305');await input.fill('1250');await expect(page.getByText('Shows as 12.50',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check the times',exact:true})).toBeVisible();
  const banner=page.getByRole('alert').filter({hasText:'The 3rd place time is faster than 2nd. Tap it to retype, or keep it if the timer really shows that.'});
  await expect(banner).toBeVisible();
  await expect(page.getByRole('button',{name:'3rd place · 12.50 · Faster than 2nd place',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'4th place · 12.90',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath('times-check-banner.png'),fullPage:true});
  await banner.getByRole('button',{name:'Keep as it is',exact:true}).click();
  await expect(banner).toHaveCount(0);await expect(page.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('times-check-kept.png'),fullPage:true});
  // Saving kept times is v1's Keep: they reach a lead as out of order.
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you. Your responses have been saved.',exact:true})).toBeVisible();
  await expect(page.getByTestId('saved-race')).toHaveText(`Times wrong Girl Cubs · Race ${race.number} · 4 times`);
  await page.screenshot({path:info.outputPath('times-saved.png'),fullPage:true});
  expect(await savedTimes(page,race.id)).toMatchObject({places:[1244,1281,1250,1290],outOfOrder:true});
  // Retyping the place clears the highlighting.
  await page.getByRole('button',{name:'Change times',exact:true}).click();
  await page.getByRole('button',{name:'3rd place · 12.50 · Faster than 2nd place',exact:true}).click();
  await input.fill('1285');await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check the times',exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'3rd place · 12.85',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you. Your responses have been saved.',exact:true})).toBeVisible();
  expect(await savedTimes(page,race.id)).toMatchObject({places:[1244,1281,1285,1290],outOfOrder:false});
});

test('tapping a place chip while typing retypes it, and Next race follows the saved confirmation',async({page},info)=>{
  const code=`TC-${info.project.name.slice(0,3).toUpperCase()}`,race=await raceWaitingForTimes(page,code);
  await page.goto('/');await createProfile(page,`Chip retype ${info.project.name}`);
  await jobButton(page,'Times').click();await pickRace(page,'Times',`Times wrong Girl Cubs (${code}) · Race ${race.number}`);
  await enterTime(page,'1100');await enterTime(page,'1200');
  await page.getByRole('button',{name:'1st place · 11.00',exact:true}).click();
  await expect(page.getByRole('heading',{name:'1st place time?',exact:true})).toBeVisible();
  const input=page.getByLabel('Place time',{exact:true});await expect(input).toHaveValue('1100');
  await input.fill('1050');await expect(page.getByText('Shows as 10.50',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('heading',{name:'2nd place time?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'1st place · 10.50',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(page.getByRole('heading',{name:'1st place time?',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'No more finishers',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check the times',exact:true})).toBeVisible();
  // Two times for four finishers: the count disagreement shows plainly, with no tick.
  await expect(page.getByText('2 times · 4 finishers',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you. Your responses have been saved.',exact:true})).toBeVisible();
  await expect(page.getByText('Finish order has 4 finishers, times have 2 - check the recording',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Next race',exact:true}).click();
  await expect(page.getByRole('heading',{name:/place time\?$|^Check the times$|^Which race is it\?$/})).toBeVisible();
});
