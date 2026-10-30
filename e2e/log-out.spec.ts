import {ownName,becomeLead,expect,join,leadMenuButton,lookProblems,openRelays,test,type Page} from './fixtures.js';
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const joinScreen=(page:Page)=>expect(page.getByRole('heading',{level:1,name:/Join( the Running Zone)?$/})).toBeVisible();
const menuItems=(page:Page)=>page.getByRole('menu').getByRole('menuitem');
const pick=(page:Page,item:string)=>menuItems(page).getByText(item,{exact:true}).click();
// The pass, session, job and drafts go; only the names listed on the phone stay.
const onlyNamesKept=async(page:Page)=>expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
test('a volunteer\'s avatar menu has only Log out, which goes straight to Join keeping the listed names',async({page},info)=>{
  const name=ownName('Vol Out');
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);
  await page.getByRole('button',{name:`${name}: Log out`,exact:true}).click();
  await expect(menuItems(page)).toHaveText(['Log out']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('volunteer-menu.png')});
  await pick(page,'Log out');
  await joinScreen(page);await onlyNamesKept(page);
  await expect(page.getByRole('heading',{name:'Your profile'})).toHaveCount(0);
});
test('a lead\'s avatar menu reads Results, Day setup, Log out, and the older-look header name opens it',async({page},info)=>{
  const name=ownName('Sami Out');
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);await becomeLead(page);
  await leadMenuButton(page).click();
  await expect(menuItems(page)).toHaveText(['Results','Day setup','Log out']);
  await pick(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup'})).toBeVisible();
  const header=page.getByRole('button',{name:`${name}: Results, Day setup and Log out`,exact:true});
  await header.click();
  await expect(menuItems(page)).toHaveText(['Results','Day setup','Log out']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('older-look-menu.png')});
  await pick(page,'Results');
  await expect(page.getByRole('heading',{level:1,name:'Results'})).toBeVisible();
  await header.click();await pick(page,'Log out');
  await joinScreen(page);await onlyNamesKept(page);
});
test('a second tab on the same phone follows a log out from the Relays tab',async({page,context})=>{
  const name=ownName('Tabs Out');
  await page.goto('/');await join(page,name,{job:'Finish line'});await races(page);
  const other=await context.newPage();await other.goto('/');await races(other);
  await openRelays(page);
  await page.getByRole('button',{name:`${name}: Log out`,exact:true}).click();
  await pick(page,'Log out');
  await joinScreen(page);await joinScreen(other);
  await other.close();
});
