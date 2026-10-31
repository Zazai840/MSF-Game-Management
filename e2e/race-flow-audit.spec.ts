import {ownName,ownCode,ownWristbands,expect,flowRace,lookProblems,openRace,ownEvent,press,signInThroughApi,test,writeCheckIn,type Page} from './fixtures.js';
/**
 * The race-flow fixes from the consistency audit: "+" on a race asks first, "Cancel" leaves Runner not on the list,
 * the lead's app bar title wraps, the job sheet and chip name the job one way, callouts put the main button on the
 * right, and a failed request reads one of two lines in the amber callout.
 */
const owner=()=>process.env.E2E_OWNER_TOKEN!;
const heading=(page:Page,name:string)=>page.getByRole('heading',{level:2,name,exact:true});

test('"+" on a race screen opens the same Create heat sheet as the Races card, and makes nothing until Create heat',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Plus asks');
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(ownName('Plus asks start'));
  await flowRace(request,token,code);
  await openRace(page,name);
  await page.getByRole('navigation',{name:'Heats'}).getByRole('button',{name:'Add heat 2',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'New race'});
  await expect(sheet.getByRole('button',{name:'Heat 2',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(sheet.getByRole('button',{name:'Create heat 2',exact:true})).toBeVisible();
  // Closing the sheet makes no heat: the race stays Heat 1, with no H2 chip.
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Heats'}).getByRole('button',{name:/^Heat 2,/})).toHaveCount(0);
  await page.getByRole('navigation',{name:'Heats'}).getByRole('button',{name:'Add heat 2',exact:true}).click();
  await sheet.getByRole('button',{name:'Create heat 2',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Heats'}).getByRole('button',{name:/^Heat 2,/})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Heats'}).getByRole('button',{name:/^Heat 2,/})).toHaveAttribute('aria-current','page');
});

test('Runner not on the list leaves with Cancel; Check the order keeps Back',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Cancel added'),n=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name);
  const {page}=await openPhone(ownName('Cancel finish'),{job:'finish'});
  await writeCheckIn(request,await signInThroughApi(request,ownName('Cancel start')),code,[n(1),n(2)]);
  await openRace(page,name);
  await page.getByRole('button',{name:'+ Runner not on the list',exact:true}).click();
  const footer=page.locator('.rz-footer');
  await expect(footer.getByRole('button')).toHaveText(['Cancel','Add runner']);
  await footer.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(heading(page,'Who came 1st?')).toBeVisible();
  await page.getByRole('button',{name:`${n(1)} came 1st`,exact:true}).click();
  await page.getByRole('button',{name:`${n(2)} came 2nd`,exact:true}).click();
  await expect(heading(page,'Check the order')).toBeVisible();
  await expect(page.getByRole('button',{name:'Back',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Cancel',exact:true})).toHaveCount(0);
});

test('the lead\'s race app bar title wraps to two lines, so a long event name shows its section',async({openPhone,request},info)=>{
  const code=await ownCode();
  // The audit's own example; the event is found by its code, so the shared name clashes with nothing.
  await ownEvent(request,code,'4x100m Relay','Girl Scouts');
  const {page,token}=await openPhone(ownName('Wrap lead'),{lead:true});
  const {race}=await flowRace(request,token,code);
  await page.goto(`/races/${race.id}`);
  const title=page.getByRole('heading',{level:1,name:'4x100m Relay · Girl Scouts',exact:true});
  await expect(title).toBeVisible();
  await page.locator('.rz-appbar').screenshot({path:info.outputPath('lead-race-app-bar.png')});
  // Every line of the title shows: none sits below the two lines' box or runs past its side.
  const fit=await title.evaluate(element=>{
    const range=document.createRange();range.selectNodeContents(element);
    const box=element.parentElement!.getBoundingClientRect(),tops=[...new Set([...range.getClientRects()].map(rect=>Math.round(rect.top)))];
    return {lines:tops.length,hidden:tops.filter(top=>top>=box.bottom).length,wide:element.parentElement!.scrollWidth>element.parentElement!.clientWidth};
  });
  expect(fit).toEqual({lines:page.viewportSize()!.width<=360?2:fit.lines,hidden:0,wide:false});
  expect(fit.lines).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button',{name:'Your job: Zone lead. Change job',exact:true})).toHaveText('Zone lead');
  expect(await lookProblems(page)).toEqual([]);
  expect((await request.post(`/api/lead/races/${race.id}/delete`,{headers:{authorization:`Bearer ${owner()}`},data:{permanent:true}})).ok()).toBe(true);
});

test('the job sheet asks "What\'s your job today?", and a lead\'s chip says Zone lead',async({openPhone})=>{
  const {page}=await openPhone(ownName('Job sheet lead'),{lead:true});
  const chip=page.getByRole('button',{name:'Your job: Zone lead. Change job',exact:true});
  await expect(chip).toHaveText('Zone lead');
  await chip.click();
  const sheet=page.getByRole('dialog',{name:'What\'s your job today?',exact:true});
  await expect(sheet.getByRole('radiogroup',{name:'What\'s your job today?',exact:true})).toBeVisible();
});

test('a callout puts its main button on the right, and a failed request reads "Could not connect - try again" or "Not saved - try again" in the amber callout',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Callout errors'),n=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(ownName('Callout start'));
  await flowRace(request,token,code);
  await openRace(page,name);
  const input=page.getByLabel('Wristband number',{exact:true});
  // A Boy Scouts number on a Girl Cubs race: Fix number is the main button, so it sits on the right of Keep.
  await input.fill('3999');await input.press('Enter');
  const warning=page.getByRole('alert');
  await expect(warning.getByRole('button')).toHaveText(['Keep','Fix number']);
  const keep=(await warning.getByRole('button',{name:'Keep',exact:true}).boundingBox())!,fix=(await warning.getByRole('button',{name:'Fix number',exact:true}).boundingBox())!;
  expect(fix.x).toBeGreaterThan(keep.x);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('callout-main-button-right.png'),fullPage:true});
  await press(warning.getByRole('button',{name:'Fix number',exact:true}));
  // The phone cannot reach the app: the number check never arrives.
  await page.route('**/api/wristband-check',route=>route.abort('internetdisconnected'));
  await input.fill(String(n(1)));await input.press('Enter');
  const failed=page.locator('.rz-callout[role="alert"]');
  await expect(failed).toHaveText('Could not connect - try again');
  await expect(failed.locator('.rz-callout__msg .rz-icon')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('callout-could-not-connect.png'),fullPage:true});
  await page.unroute('**/api/wristband-check');
  // The app is reached but refuses the save with no reason of its own.
  await page.route('**/api/races/*/check-in',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Something went wrong - please try again'})}));
  await input.fill(String(n(2)));await input.press('Enter');
  await expect(failed).toHaveText('Not saved - try again');
  await expect(failed.locator('.rz-callout__msg .rz-icon')).toHaveCount(1);
});
