import {becomeLead,deleteCurrentRace,enterTime,eventTab,expect,join,lookProblems,openLeadMenu,openRace,ownCode,ownEvent,ownName,ownWristbands,press,recordRace,signInThroughApi,switchJob,test,writeCheckIn,writeOrder} from './fixtures.js';
test('a lead sees a race worked in the race flow appear within one Results poll',async({page,openPhone},info)=>{
  const code=await ownCode(),name=ownName('Results phone');
  await ownEvent(page.request,code,name,'Girl Cubs','heats');
  await page.goto('/');await join(page,ownName('Results lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  // One phone does every job in turn: the start line with a kept warning, the finish line, then the timer.
  const phone=(await openPhone(ownName('Results phone'))).page;
  await phone.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=phone.getByRole('dialog',{name:'New race'});
  await sheet.getByRole('button',{name,exact:true}).click();await sheet.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
  const input=phone.getByLabel('Wristband number',{exact:true});
  await input.fill('2401');await input.press('Enter');
  await expect(input).toBeEditable();await input.fill('3045');await input.press('Enter');await phone.getByRole('button',{name:'Keep',exact:true}).click();
  // The race shows on Heats within one poll, not in Results yet; the scoreboard waits.
  await eventTab(page,'Heats');
  await expect(page.getByRole('button',{name:'Open Heat 1',exact:true})).toHaveAccessibleDescription(/^2 runners · not in Results yet · checked in /,{timeout:6500});
  await eventTab(page,'Heats');
  await phone.getByRole('button',{name:"That's everyone",exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Finish line');
  await phone.getByRole('button',{name:'2401 came 1st',exact:true}).click();await phone.getByRole('button',{name:'3045 came 2nd',exact:true}).click();
  await phone.getByRole('button',{name:'Save the order',exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Timer');
  await enterTime(phone,1234);await enterTime(phone,1334);
  await expect(phone.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  const row=page.getByRole('listitem').filter({has:page.getByText('2401',{exact:true})});
  await expect(row).toContainText('12.34',{timeout:6500});await expect(row).toContainText('Q');
  // The kept warning shows as a Check tag on its row.
  await expect(page.getByRole('listitem').filter({has:page.getByText('3045',{exact:true})})).toContainText('Check');
  await page.screenshot({path:info.outputPath('live-leaderboard.png'),fullPage:true});
});

test('a timed event marks its medal places 1st, 2nd and 3rd beside the wristband',async({page},info)=>{
  const code=await ownCode(),name=ownName('Medal marks');
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  await recordRace(page.request,await signInThroughApi(page.request,ownName('Medal timer')),code,[2601,2602,2603,2604],[1150,1200,1260,1300]);
  await page.goto('/');await join(page,ownName('Medal lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  const rows=page.getByRole('list',{name:'Provisional leaderboard'}).locator(':scope > li');
  for(const [index,mark] of ['1st','2nd','3rd'].entries()) await expect(rows.nth(index)).toContainText(`${2601+index}${mark}Heat 1`);
  await expect(rows.nth(3)).toContainText('2604Heat 1');
  await page.screenshot({path:info.outputPath('medal-marks.png'),fullPage:true});
});

test('a heat not in Results shows three bars with counts and the Race screen band\'s sentence, and a tap opens it at the step that sentence is about; a heat in Results shows no bars',async({page},info)=>{
  const code=await ownCode(),name=ownName('Heat progress'),girls=await ownWristbands('Girl Cubs',4);
  await ownEvent(page.request,code,name);
  const phone=await signInThroughApi(page.request,ownName('Heat progress phone'));
  await recordRace(page.request,phone,code,[girls(1),girls(2)],[1200,1300]);
  // Heat 2: two runners, That's everyone not tapped, one of them placed.
  await writeCheckIn(page.request,phone,code,[girls(3),girls(4)]);
  await writeOrder(page.request,phone,code,[girls(3)]);
  await page.goto('/');await join(page,ownName('Heat progress lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await press(page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}));
  const heat1=page.getByRole('button',{name:'Open Heat 1',exact:true}),heat2=page.getByRole('button',{name:'Open Heat 2',exact:true});
  const sentence=`Not in Results yet: ${girls(4)} has no place.`;
  await expect(heat1).toHaveAccessibleDescription(/^2 runners · in Results · checked in \d\d:\d\d$/);
  await expect(heat1.locator('.rz-progress')).toHaveCount(0);
  await expect(heat2).toHaveAccessibleDescription(new RegExp(`^2 runners · not in Results yet · checked in \\d\\d:\\d\\d Runners 2 so far Finishing order 1 of 2 Times Not started ${sentence.replace(/\./g,'\\.')}$`));
  // Each bar is as full as its count: Runners waits for That's everyone, Finishing order half, Times empty.
  expect(await heat2.locator('.rz-progress__bar > span').evaluateAll(fills=>fills.map(fill=>(fill as HTMLElement).style.width))).toEqual(['0%','50%','0%']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('heat-progress-rows.png'),fullPage:true});
  // The tap opens the step the sentence is about (not Runners, though That's everyone is not tapped), and its band says the row's sentence.
  await press(heat2);
  await expect(page.getByRole('tablist',{name:'Heat 2 steps'}).getByRole('tab',{selected:true})).toContainText('Finishing order');
  await expect(page.locator('.rz-needsband')).toHaveText(sentence);
  // The race not in Results yet would sit on every phone's Races: it goes.
  await deleteCurrentRace(page.request,code);
});
