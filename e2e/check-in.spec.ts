import { lookProblems,expect,jobButton,joinDay,savedRaceLabel,steps,test,type Page } from './fixtures.js';
const scoring={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
async function openGirlCubs(page:Page,name:string) {
  await page.request.post('/api/day/events/R4/rename',{headers:scoring,data:{name:'60m'}});
  await page.request.post('/api/day/confirm-events',{headers:scoring,data:{}});
  await page.goto('/');
  await joinDay(page,name);
  await jobButton(page,'Start line').click();
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
}
async function deleteRaces(page:Page,wristband:number) {
  const read=await (await page.request.get('/api/jobs/start-line',{headers:scoring})).json();
  for(const race of read.waiting.filter((item:any)=>item.parts.runners.value?.some((runner:any)=>runner.wristband===wristband))) await page.request.post(`/api/races/${race.id}/delete`,{headers:scoring,data:{permanent:true}});
}

test('wristband numbers go in through the phone keyboard and the input keeps focus between runners',async({page,context},info)=>{
  await openGirlCubs(page,`Keyboard ${info.project.name}`);
  const input=page.getByLabel('Wristband number',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');
  await expect(input).toHaveAttribute('pattern','[0-9]*');
  await expect(input).toHaveAttribute('enterkeyhint','next');
  await expect(input).toHaveAttribute('autocomplete','off');
  await input.click();
  // Android keyboards let through . , - and space: only the digits stay.
  await input.pressSequentially('20.0-1');
  await expect(input).toHaveValue('2001');
  await input.press('Enter');
  await expect(page.getByRole('button',{name:'Remove runner 2001',exact:true})).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await input.pressSequentially('2002');
  const next=page.getByRole('button',{name:'Next',exact:true});
  await expect(next).toBeInViewport();
  await next.click();
  await expect(page.getByRole('button',{name:'Remove runner 2002',exact:true})).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  // Pasted text keeps only its digits.
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText(' 2 0-03 x'));
  await input.press('ControlOrMeta+V');
  await expect(input).toHaveValue('2003');
  await input.press('Backspace');await input.pressSequentially('4');
  await expect(input).toHaveValue('2004');
  await input.press('Enter');
  await expect(page.getByRole('button',{name:'Remove runner 2004',exact:true})).toBeVisible();
  // A warning closes the keyboard so the choice shows; Fix reopens it, cleared.
  await input.pressSequentially('3045');await input.press('Enter');
  const warning=page.getByRole('alert');
  await expect(warning).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  await expect(input).not.toBeFocused();
  await page.screenshot({path:info.outputPath('check-in-warning.png'),fullPage:true});
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toBeFocused();await expect(input).toHaveValue('');
  // A number already in the race is refused: Fix number only.
  await input.pressSequentially('2001');await input.press('Enter');
  await expect(warning).toContainText('2001 is already in this race. Check the wristband.');
  await expect(warning.getByRole('button',{name:'Keep',exact:true})).toHaveCount(0);
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toBeFocused();
  // Keep adds the number with an amber dot and carries on.
  await input.pressSequentially('3046');await input.press('Enter');
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  const kept=page.getByRole('button',{name:'Remove runner 3046',exact:true});
  await expect(kept.locator('.kept-dot')).toBeVisible();
  await expect(input).toBeFocused();
  await page.screenshot({path:info.outputPath('check-in-entry.png'),fullPage:true});
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check the runners',exact:true})).toBeVisible();
  await expect(page.getByText('4 runners lined up',{exact:true})).toBeVisible();
  const rows=page.getByRole('list',{name:'Runners',exact:true}).getByRole('listitem');
  await expect(rows).toHaveText(['Runner 12001','Runner 22002','Runner 32004','Runner 43046Kept - lead will check']);
  await expect(page.getByRole('button',{name:'Save',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Add another runner',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('check-in-check.png'),fullPage:true});
  await page.getByRole('button',{name:'Add another runner',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Runner 5: wristband number?',exact:true})).toBeVisible();
});

test('the trail goes back to earlier steps without losing typed entries and shortens from the left',async({page},info)=>{
  await openGirlCubs(page,`Trail ${info.project.name}`);
  const input=page.getByLabel('Wristband number',{exact:true});
  for(const number of ['2011','2012']) {await input.fill(number);await input.press('Enter');}
  await input.fill('20');
  // The trail replaces the separate Home and Other race buttons.
  await page.setViewportSize({width:1280,height:800});
  await expect(page.getByRole('button',{name:'Home',exact:true})).toHaveCount(1);
  await expect(page.getByRole('button',{name:/^(Other race|Choose another race)$/})).toHaveCount(0);
  await expect(steps(page)).toHaveText('Home›Check in runners›60m›Girl Cubs›Runners (2)');
  await expect(steps(page).locator('[aria-current=step]')).toHaveText('Runners (2)');
  await steps(page).getByRole('button',{name:'Check in runners',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
  await expect(steps(page)).toHaveText('Home›Check in runners');
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await expect(steps(page)).toHaveText('Home›Check in runners›60m');
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove runner 2011',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Remove runner 2012',exact:true})).toBeVisible();
  await expect(input).toHaveValue('20');
  await input.fill('');
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(steps(page)).toHaveText('Home›Check in runners›60m›Girl Cubs›Runners (2)›Check');
  await steps(page).getByRole('button',{name:'Runners (2)',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Runner 3: wristband number?',exact:true})).toBeVisible();
  await steps(page).getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
  await steps(page).getByRole('button',{name:'Home',exact:true}).click();
  await jobButton(page,'Start line').click();
  await page.getByRole('button',{name:'Carry on with 60m Girl Cubs · 2 runners',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove runner 2012',exact:true})).toBeVisible();
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  // A narrow phone keeps one line by dropping the earliest steps.
  await page.setViewportSize({width:320,height:640});
  await expect(steps(page)).toHaveText(/^…›.*›Runners \(2\)›Check$/);
  await expect(steps(page).getByRole('button',{name:'Home',exact:true})).toHaveCount(0);
  expect((await steps(page).boundingBox())!.height).toBeLessThan(50);
  await page.screenshot({path:info.outputPath('trail-narrow.png'),fullPage:true});
});

test('a confirmed save shows the thank-you screen with the race, the next race and Home',async({page},info)=>{
  await openGirlCubs(page,`Saved ${info.project.name}`);
  const input=page.getByLabel('Wristband number',{exact:true});
  for(const number of ['2021','2022']) {await input.fill(number);await input.press('Enter');}
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  const label=await savedRaceLabel(page);
  await expect(page.getByTestId('saved-race')).toHaveText(`60m Girl Cubs · ${label} · 2 runners`);
  await expect(steps(page)).toHaveText('Home›Saved');
  await expect(page.getByRole('button',{name:'Check in the next race',exact:true})).toBeVisible();
  await expect(page.getByRole('main').getByRole('button',{name:'Home',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit runners',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Delete this race',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('check-in-saved.png'),fullPage:true});
  await page.getByRole('button',{name:'Check in the next race',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
  await page.getByRole('button',{name:`60m Girl Cubs (R4) · ${label}`,exact:true}).click();
  await expect(steps(page)).toContainText(`Girl Cubs · ${label}`);
  await expect(page.getByRole('button',{name:'Remove runner 2021',exact:true})).toBeVisible();
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Thank you. Your responses have been saved.',exact:true})).toBeVisible();
  await page.getByRole('main').getByRole('button',{name:'Home',exact:true}).click();
  await expect(jobButton(page,'Start line')).toBeVisible();
  await deleteRaces(page,2021);
});
