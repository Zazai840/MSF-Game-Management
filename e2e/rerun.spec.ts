import {writeFile} from 'node:fs/promises';
import readExcelFile from 'read-excel-file/node';
import {ownName,ownCode,deleteCurrentRace,ownEvent,writeCheckIn,recordRace,goHome,back,openLeadMenu,openRace,becomeLead,expect,join,test} from './fixtures.js';
test('a heat replaced by a re-run says which heat replaced it, offers no Restore, and the re-run reaches Races and the day export',async({page},info)=>{
  const code=await ownCode(),name=ownName('Re-run heats'),headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await ownEvent(page.request,code,name,'Girl Cubs','heats');await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2011,2012,2013],[1200,1300,1400]);
  await page.goto('/');await join(page,ownName('Re-run lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();await page.getByRole('button',{name:'Re-run race',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByLabel('Comment (optional)',{exact:true}).fill('False start');await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();await expect(sheet).toHaveCount(0);
  await expect(page.getByText('Heat 1 · Replaced by a re-run',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Restore race',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Delete permanently',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('rerun-race-page.png'),fullPage:true});
  await back(page,`${name} Girl Cubs`);
  await expect(page.getByRole('button',{name:'Open deleted Heat 1 · Replaced by a re-run',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('rerun-deleted-list.png'),fullPage:true});
  // The re-run keeps the number: Heat 1 on Races, its runners pre-filled with no "already ran" warnings, its positions and times empty.
  await goHome(page);await openRace(page,name,'Girl Cubs','H1');
  const steps=page.getByRole('tablist',{name:'Heat 1 steps'});
  await expect(steps.getByRole('tab',{name:/^Runners/})).toContainText('3 so far');
  await expect(page.getByRole('list',{name:'Wristbands entered'}).getByRole('button')).toHaveText(['2011','2012','2013']);
  await expect(page.getByRole('button',{name:/kept for a lead to check/})).toHaveCount(0);
  await expect(steps.getByRole('tab',{name:/^Finishing order/})).toContainText('Not started');
  await expect(steps.getByRole('tab',{name:/^Times/})).toContainText('Not started');
  await page.screenshot({path:info.outputPath('rerun-race.png'),fullPage:true});
  const exported=await page.request.post('/api/day/export',{headers,data:{}});expect(exported.ok()).toBe(true);
  const path=info.outputPath('rerun-day-export.xlsx');await writeFile(path,await exported.body());
  const all=(await readExcelFile(path)).find(sheet=>sheet.sheet==='All results')!.data.filter(row=>row[0]===code);
  // Both are Heat 1: the replaced heat's rows say Deleted race.
  const heat1=(deleted:boolean)=>all.filter(row=>row[3]==='Heat 1' && String(row[10]).includes('Deleted race')===deleted).map(row=>row[4]);
  expect(heat1(true)).toEqual([2011,2012,2013]);expect(heat1(false)).toEqual([2011,2012,2013]);
  expect(all.filter(row=>row[3]!=='Heat 1')).toEqual([]);
  await deleteCurrentRace(page.request,code);
});
test('Re-run does not wait for a heat in progress (its races run side by side), and keeps the number of the heat it replaces',async({page,request})=>{
  const code=await ownCode(),name=ownName('Re-run wait'),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(request,code,name);
  await recordRace(request,token,code,[2021,2022],[1200,1300]);
  await writeCheckIn(request,token,code,[2023]);
  await page.goto('/');await join(page,ownName('Re-run wait lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();await page.getByRole('button',{name:'Re-run race',exact:true}).click();
  const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:'Confirm re-run',exact:true}).click();await expect(sheet).toHaveCount(0);
  // Heat 2 is in progress, and the re-run is Heat 1 again, beside it.
  await expect(page.getByText('Heat 1 · Replaced by a re-run',{exact:true})).toBeVisible();
  await goHome(page);
  await expect(page.getByRole('article',{name:`${name} · Girl Cubs`}).getByRole('button',{name:/^Heat \d/})).toHaveText(['H1','H2']);
  await openRace(page,name,'Girl Cubs','H1');
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'}).getByRole('tab',{name:/^Runners/})).toContainText('2 so far');
  await deleteCurrentRace(request,code);
});
