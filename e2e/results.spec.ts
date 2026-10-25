import { enterTime,openDashboard,openRaceScreen,enterWristband,becomeLead,expect,createProfile,ownEvent,recordRace,signInThroughApi,test } from './fixtures.js';
test('a lead sees a race worked on the race screen appear within one Results poll',async({page,openPhone},info)=>{
  const project=info.project.name,code=`RP-${project.toUpperCase()}`,name=`Results phone ${project}`,headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  expect((await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'heats',type:'races'}})).ok()).toBe(true);
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await page.goto('/');await createProfile(page,`Results lead ${project}`);await becomeLead(page);await openDashboard(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  // One phone does every job: check-in with a kept warning, the order, the times, then Submit Race.
  const phone=(await openPhone(`Results phone ${project}`)).page;
  await openRaceScreen(phone,name);await phone.getByRole('button',{name:/^Check-in Wristbands/}).click();
  await enterWristband(phone,2401);await enterWristband(phone,3045);await phone.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(page.getByText('Heat 1 · in progress',{exact:true})).toBeVisible({timeout:6500});
  await phone.getByRole('button',{name:/^Order and Times/}).click();
  await phone.getByRole('button',{name:'Do the order',exact:true}).click();await phone.getByRole('button',{name:'Do the times',exact:true}).click();
  await phone.getByRole('button',{name:'2401',exact:true}).click();await phone.getByRole('button',{name:'3045',exact:true}).click();
  await enterTime(phone,1234);await enterTime(phone,1334);
  await phone.getByRole('button',{name:'Submit Race',exact:true}).click();
  await expect(phone.getByText('Heat 1 saved',{exact:true})).toBeVisible();
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
  await page.goto('/');await createProfile(page,`Medal lead ${project}`);await becomeLead(page);await openDashboard(page,'Results');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  for(const [index,mark] of ['1st','2nd','3rd'].entries()) {
    const position=page.locator('.result-position').nth(index);
    await expect(position.locator('.result-mark')).toHaveText(mark);
    const number=(await position.locator('strong').boundingBox())!,pill=(await position.locator('.result-mark').boundingBox())!;
    expect(pill.y,`${mark} is on the number's line`).toBeLessThan(number.y+number.height);
  }
  await page.screenshot({path:info.outputPath('medal-marks.png'),fullPage:true});
});
