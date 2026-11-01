import {eventTab,ownName,ownCode,enterTime,openLeadMenu,openRace,switchJob,becomeLead,expect,join,ownEvent,recordRace,signInThroughApi,test} from './fixtures.js';
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
  // The race shows on the Races tab within one poll, not saved yet; the leaderboard waits on Heats.
  await eventTab(page,'Races');
  await expect(page.getByRole('button',{name:'Open Heat 1',exact:true})).toHaveAccessibleDescription(/^2 runners · not saved yet · checked in /,{timeout:6500});
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
