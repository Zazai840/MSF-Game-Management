import {writeFile} from 'node:fs/promises';
import readExcelFile from 'read-excel-file/node';
import {ownCode,deleteCurrentRace,ownEvent,writeCheckIn,recordRace,goHome,back,openLeadMenu,openRace,becomeLead,expect,join,test} from './fixtures.js';
test('a heat replaced by a re-run says which heat replaced it, offers no Restore, and the re-run reaches Races and the day export',async({page},info)=>{
  const code=await ownCode(),name=`Re-run heats ${info.project.name}`,headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await ownEvent(page.request,code,name,'Girl Cubs','heats');await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2011,2012,2013],[1200,1300,1400]);
  await page.goto('/');await join(page,`Re-run lead ${info.project.name}`,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();await page.getByRole('button',{name:'Re-run race',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByLabel('Comment (optional)',{exact:true}).fill('False start');await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Heat 1 · Replaced by Heat 2 (re-run)',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Restore race',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Delete permanently',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('rerun-race-page.png'),fullPage:true});
  await back(page,`${name} Girl Cubs`);
  await expect(page.getByRole('button',{name:'Open deleted Heat 1 · Replaced by Heat 2 (re-run)',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('rerun-deleted-list.png'),fullPage:true});
  // The re-run is Heat 2 on Races, its runners pre-filled with no "already ran" warnings, its positions and times empty.
  await goHome(page);await openRace(page,name,'Girl Cubs','H2');
  const steps=page.getByRole('tablist',{name:'Heat 2 steps'});
  await expect(steps.getByRole('tab',{name:/^Runners/})).toContainText('3 so far');
  await expect(page.getByRole('list',{name:'Wristbands entered'}).getByRole('button')).toHaveText(['2011','2012','2013']);
  await expect(page.getByRole('button',{name:/kept for a lead to check$/})).toHaveCount(0);
  await expect(steps.getByRole('tab',{name:/^Finishing order/})).toContainText('Not started');
  await expect(steps.getByRole('tab',{name:/^Times/})).toContainText('Not started');
  await page.screenshot({path:info.outputPath('rerun-race.png'),fullPage:true});
  const exported=await page.request.post('/api/day/export',{headers,data:{}});expect(exported.ok()).toBe(true);
  const path=info.outputPath('rerun-day-export.xlsx');await writeFile(path,await exported.body());
  const all=(await readExcelFile(path)).find(sheet=>sheet.sheet==='All results')!.data.filter(row=>row[0]===code);
  expect(all.filter(row=>row[3]==='Heat 1').map(row=>[row[4],String(row[10]).includes('Deleted race')])).toEqual([[2011,true],[2012,true],[2013,true]]);
  expect(all.filter(row=>row[3]==='Heat 2').map(row=>[row[4],String(row[10]).includes('Deleted race')])).toEqual([[2011,false],[2012,false],[2013,false]]);
  await deleteCurrentRace(page.request,code);
});
test('Re-run does not wait for a heat in progress (its races run side by side), and takes the next unused number',async({page,request},info)=>{
  const code=await ownCode(),name=`Re-run wait ${info.project.name}`,token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(request,code,name);
  await recordRace(request,token,code,[2021,2022],[1200,1300]);
  await writeCheckIn(request,token,code,[2023]);
  await page.goto('/');await join(page,`Re-run wait lead ${info.project.name}`,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();await page.getByRole('button',{name:'Re-run race',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();await expect(sheet).toHaveCount(0);
  // Heat 2 is in progress, so the re-run is Heat 3, beside it.
  await expect(page.getByText('Heat 1 · Replaced by Heat 3 (re-run)',{exact:true})).toBeVisible();
  await goHome(page);
  await expect(page.getByRole('article',{name:`${name} · Girl Cubs`}).getByRole('button',{name:/^Heat \d/})).toHaveText(['H2','H3']);
  await openRace(page,name,'Girl Cubs','H3');
  await expect(page.getByRole('tablist',{name:'Heat 3 steps'}).getByRole('tab',{name:/^Runners/})).toContainText('2 so far');
  await deleteCurrentRace(request,code);
});
