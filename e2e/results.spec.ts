import {enterTime,openLeadMenu,openRace,switchJob,becomeLead,expect,join,ownEvent,recordRace,signInThroughApi,test} from './fixtures.js';
test('a lead sees a race worked in the race flow appear within one Results poll',async({page,openPhone},info)=>{
  const project=info.project.name,code=`RP-${project.toUpperCase()}`,name=`Results phone ${project}`,headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  expect((await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'heats',type:'races'}})).ok()).toBe(true);
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await page.goto('/');await join(page,`Results lead ${project}`,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  // One phone does every job in turn: the start line with a kept warning, the finish line, then the timer.
  const phone=(await openPhone(`Results phone ${project}`)).page;
  await phone.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=phone.getByRole('dialog',{name:'New race'});
  await sheet.getByRole('button',{name,exact:true}).click();await sheet.getByRole('button',{name:`Girl Cubs ${code}`,exact:true}).click();
  await sheet.getByRole('button',{name:'Create heat 1',exact:true}).click();
  const input=phone.getByLabel('Wristband number',{exact:true});
  await input.fill('2401');await input.press('Enter');
  await expect(input).toBeEditable();await input.fill('3045');await input.press('Enter');await phone.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(page.getByText('Heat 1 · in progress',{exact:true})).toBeVisible({timeout:6500});
  await phone.getByRole('button',{name:"That's everyone",exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Finish line');
  await phone.getByRole('button',{name:'2401 came 1st',exact:true}).click();await phone.getByRole('button',{name:'3045 came 2nd',exact:true}).click();
  await phone.getByRole('button',{name:'Save positions',exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Timer');
  await enterTime(phone,1234);await enterTime(phone,1334);
  await expect(phone.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  const row=page.getByRole('listitem').filter({has:page.getByText('2401',{exact:true})});
  await expect(row).toContainText('12.34',{timeout:6500});await expect(row).toContainText('Q');
  await expect(page.getByText('3045 belongs to Boy Scouts - this race is Girl Cubs',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:info.outputPath('live-leaderboard.png'),fullPage:true});
});

test('on a phone a medal mark sits beside its position number, not on a line of its own',async({page},info)=>{
  const project=info.project.name,code=`MM-${project.toUpperCase()}`,name=`Medal marks ${project}`;
  await ownEvent(page.request,code,name,'Girl Cubs','timed');
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{}});
  await recordRace(page.request,await signInThroughApi(page.request,`Medal timer ${project}`),code,[2601,2602,2603,2604],[1150,1200,1260,1300]);
  await page.goto('/');await join(page,`Medal lead ${project}`,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  for(const [index,mark] of ['1st','2nd','3rd'].entries()) {
    const position=page.locator('.result-position').nth(index);
    await expect(position.locator('.result-mark')).toHaveText(mark);
    const number=(await position.locator('strong').boundingBox())!,pill=(await position.locator('.result-mark').boundingBox())!;
    expect(pill.y,`${mark} is on the number's line`).toBeLessThan(number.y+number.height);
  }
  await page.screenshot({path:info.outputPath('medal-marks.png'),fullPage:true});
});
