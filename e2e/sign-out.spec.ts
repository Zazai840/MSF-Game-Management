import { becomeLead,expect,join,leadMenuButton,lookProblems,test,type Page } from './fixtures.js';
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const joinScreen=(page:Page)=>expect(page.getByRole('heading',{level:1,name:/Join( the Running Zone)?$/})).toBeVisible();
test('a lead\'s avatar menu opens your details, and Sign out sends the phone back to Join as a volunteer',async({page},info)=>{
  const name=`Sami Out ${info.project.name}`;
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);
  await becomeLead(page);
  await leadMenuButton(page).click();
  await page.getByRole('menuitem',{name:'Your details',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Your profile'})).toBeVisible();
  const card=page.getByRole('region',{name:'Your profile'});
  await expect(card.getByText(name,{exact:true})).toBeVisible();await expect(card.getByText('Lead',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('your-profile.png')});
  await page.getByRole('button',{name:'Back',exact:true}).click();await races(page);
  await leadMenuButton(page).click();await page.getByRole('menuitem',{name:'Your details',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByText("Sign out? You'll need the Olympics password to get back in.",{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('sign-out-confirm.png')});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByText("Sign out? You'll need the Olympics password to get back in.",{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Yes, sign out',exact:true}).click();
  await joinScreen(page);
  // The pass, session, job and drafts go; the profile stays on the phone.
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
  await page.reload();await joinScreen(page);
  await join(page,name,{job:'Timer'});await races(page);
  // Today's role went back to Volunteer: the avatar opens your details, with no lead menu.
  await expect(leadMenuButton(page)).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Your job: Timer. Change job',exact:true})).toBeVisible();
  await page.getByRole('button',{name:`${name}, your details`,exact:true}).click();
  await expect(page.getByRole('region',{name:'Your profile'}).getByText('Volunteer',{exact:true})).toBeVisible();
});
test('a second tab on the same phone follows the sign out',async({page,context},info)=>{
  const name=`Tabs Out ${info.project.name}`;
  await page.goto('/');await join(page,name,{job:'Finish line'});await races(page);
  const other=await context.newPage();await other.goto('/');await races(other);
  await page.getByRole('button',{name:`${name}, your details`,exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Yes, sign out',exact:true}).click();
  await joinScreen(page);
  await joinScreen(other);
  await other.close();
});
