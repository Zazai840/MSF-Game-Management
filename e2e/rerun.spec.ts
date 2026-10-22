import { writeFile } from 'node:fs/promises';
import readExcelFile from 'read-excel-file/node';
import { deleteCurrentRace,ownEvent,writeCheckIn,recordRace,goHome,back,openDashboard,openRaceScreen,becomeLead,expect,createProfile,test } from './fixtures.js';
test('a heat replaced by a re-run says which heat replaced it, offers no Restore, and the re-run reaches the race screen and the day export',async({page},info)=>{
  const code=`RR-${info.project.name.toUpperCase()}`,name=`Re-run heats ${info.project.name}`,headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  expect((await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'heats'}})).ok()).toBe(true);await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,[2011,2012,2013],[1200,1300,1400]);
  await page.goto('/');await createProfile(page,`Re-run lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();await page.getByRole('button',{name:'Re-run race',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByLabel('Comment (optional)',{exact:true}).fill('False start');await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Heat 1 · Replaced by Heat 2 (re-run)',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Restore race',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Delete permanently',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('rerun-race-page.png'),fullPage:true});
  await back(page,`${name} Girl Cubs`);
  await expect(page.getByRole('button',{name:'Open deleted Heat 1 · Replaced by Heat 2 (re-run)',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('rerun-deleted-list.png'),fullPage:true});
  // The re-run is the event's current race, its check-in pre-filled with no "already ran" warnings.
  await goHome(page);await openRaceScreen(page,name);
  await expect(page.getByText('Heat 2 · 3 runners',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Check-in Wristbands/}).click();
  await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText(['2011','2012','2013']);
  await expect(page.locator('.kept-dot')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('rerun-check-in.png'),fullPage:true});
  // Order and Times starts empty.
  await page.getByRole('button',{name:/^Order and Times/}).click();
  await expect(page.getByRole('table',{name:'Order and times'}).getByRole('row')).toHaveText([/^Place/,/^1st\s*$/,/^2nd\s*$/,/^3rd\s*$/]);
  await page.screenshot({path:info.outputPath('rerun-order-and-times.png'),fullPage:true,animations:'disabled'});
  const exported=await page.request.post('/api/day/export',{headers,data:{}});expect(exported.ok()).toBe(true);
  const path=info.outputPath('rerun-day-export.xlsx');await writeFile(path,await exported.body());
  const all=(await readExcelFile(path)).find(sheet=>sheet.sheet==='All results')!.data.filter(row=>row[0]===code);
  expect(all.filter(row=>row[3]==='Heat 1').map(row=>[row[4],String(row[8]).includes('Deleted race')])).toEqual([[2011,true],[2012,true],[2013,true]]);
  expect(all.filter(row=>row[3]==='Heat 2').map(row=>[row[4],String(row[8]).includes('Deleted race')])).toEqual([[2011,false],[2012,false],[2013,false]]);
  await deleteCurrentRace(page.request,code);
});
test('Re-run waits while the current heat has check-ins, and the re-run takes the next unused number',async({page,request},info)=>{
  const code=`RW-${info.project.name.toUpperCase()}`,name=`Re-run wait ${info.project.name}`,token=process.env.E2E_SCORING_TOKEN!;
  await ownEvent(request,code,name);
  await recordRace(request,token,code,[2021,2022],[1200,1300]);
  await writeCheckIn(request,token,code,[2023]);
  await page.goto('/');await createProfile(page,`Re-run wait lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();await page.getByRole('button',{name:'Re-run race',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();
  await expect(sheet.getByRole('alert')).toHaveText("Heat 2 is in progress - re-run after it's saved");
  await page.screenshot({path:info.outputPath('rerun-refused.png'),fullPage:true});
  // Heat 2 deleted for good, its number is not used again: the re-run is Heat 3.
  await deleteCurrentRace(request,code);
  await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Heat 1 · Replaced by Heat 3 (re-run)',{exact:true})).toBeVisible();
  await goHome(page);await openRaceScreen(page,name);
  await expect(page.getByText('Heat 3 · 2 runners',{exact:true})).toBeVisible();
  await deleteCurrentRace(request,code);
});
