import {writeFile} from 'node:fs/promises';
import readExcelFile from 'read-excel-file/node';
import {eventTab,ownName,ownCode,deleteCurrentRace,ownEvent,writeCheckIn,recordRace,goHome,openLeadMenu,openRace,becomeLead,expect,expectToast,join,live,lookProblems,press,raceAction,test,type Page} from './fixtures.js';
/** On the race screen: the heat chip of the race open now, which must show as soon as the race does. */
const currentChip=(page:Page)=>page.getByRole('navigation',{name:'Heats',exact:true}).getByRole('button',{name:/, this race$/});
test('Re-run is a screen that lands on the new heat at its first step, with Back where the old race\'s went; the replaced heat says so, offers no Restore, and the re-run reaches Races and the day export',async({page},info)=>{
  const code=await ownCode(),name=ownName('Re-run heats'),headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  await ownEvent(page.request,code,name,'Girl Cubs','heats');
  const old=await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[2011,2012,2013],[1200,1300,1400]);
  await page.goto('/');await join(page,ownName('Re-run lead'),{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await eventTab(page,'Races');const racesTab=page.url();
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  await raceAction(page,'Re-run race');
  await expect(page).toHaveURL(new RegExp(`/results/${code}/races/${old.id}/re-run$`));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Re-run race',exact:true})).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Heat 1',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{level:2,name:'Re-run Heat 1?',exact:true})).toBeVisible();
  await expect(page.getByText('Heat 1 moves to Deleted races. A new Heat 1 opens with the same runners checked in.',{exact:true})).toBeVisible();
  await page.getByLabel('Comment (optional)',{exact:true}).fill('False start');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('rerun-screen.png'),fullPage:true});
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Re-run Heat 1',exact:true}));
  // The new Heat 1 at its first step, its chip there at once (the audit once saw it missing for a moment).
  await expectToast(page,'Re-run made · Girl Cubs Heat 1');
  await expect(page).toHaveURL(/\/races\/[^/]+$/);expect(page.url()).not.toContain(old.id);
  await expect(currentChip(page)).toHaveText('H1',live);
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'}).getByRole('tab',{name:/^Runners/})).toHaveAttribute('aria-selected','true');
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('rerun-landed.png'),fullPage:true});
  // The phone's Back skips the replaced race and the re-run screen: it goes where Back from the old race went.
  await page.goBack();await expect(page).toHaveURL(racesTab);
  await expect(page.getByRole('button',{name:/^Open deleted Heat 1 · deleted\s\d\d:\d\d$/})).toHaveAccessibleDescription(/^Replaced by a re-run · /);
  await page.screenshot({path:info.outputPath('rerun-deleted-list.png'),fullPage:true});
  await page.getByRole('button',{name:/^Open deleted Heat 1 · deleted\s\d\d:\d\d$/}).click();
  await expect(page.getByRole('status').filter({hasText:/^Replaced by a re-run/})).toHaveText(/^Replaced by a re-run at \d\d:\d\d by .+: False start\. Its results do not count\.$/);
  await press(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true}));
  await expect(page.getByRole('dialog',{name:'Heat 1 · actions',exact:true}).getByRole('button')).toHaveText(['','Delete for good']);
  await page.screenshot({path:info.outputPath('rerun-race-page.png'),fullPage:true});
  await page.keyboard.press('Escape');
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
test('Re-run from the race screen\'s "⋯" does not wait for a heat in progress, keeps the number of the heat it replaces, and Back from the new heat goes to Races',async({page,request})=>{
  const code=await ownCode(),name=ownName('Re-run wait'),token=process.env.E2E_OWNER_TOKEN!;
  await ownEvent(request,code,name);
  const old=await recordRace(request,token,code,[2021,2022],[1200,1300]);
  await writeCheckIn(request,token,code,[2023]);
  await page.goto('/');await join(page,ownName('Re-run wait lead'),{job:'Start line'});await becomeLead(page);
  await openRace(page,name,'Girl Cubs','H1');
  await raceAction(page,'Re-run race');
  await expect(page).toHaveURL(new RegExp(`/races/${old.id}/re-run$`));
  await expect(page.getByRole('banner').getByRole('button',{name:'Back to Heat 1',exact:true})).toBeVisible();
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Re-run Heat 1',exact:true}));
  await expectToast(page,'Re-run made · Girl Cubs Heat 1');
  // Heat 2 is in progress, and the re-run is Heat 1 again, beside it.
  await expect(currentChip(page)).toHaveText('H1',live);
  await expect(page.getByRole('tablist',{name:'Heat 1 steps'}).getByRole('tab',{name:/^Runners/})).toContainText('2 so far');
  await page.goBack();await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('article',{name:`${name} · Girl Cubs`}).getByRole('button',{name:/^Heat \d/})).toHaveText(['H1','H2']);
  await deleteCurrentRace(request,code);
});
