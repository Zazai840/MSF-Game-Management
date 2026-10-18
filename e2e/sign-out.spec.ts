import { becomeLead,createProfile,dashboardButton,expect,lookProblems,test,typePassword,type Page } from './fixtures.js';
const home=(page:Page)=>expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
/** The header's name and initials, which open your profile screen. */
const headerName=(page:Page,name:string)=>page.getByRole('banner').getByRole('button',{name,exact:true});
test('your name in the header opens your profile, and Sign out sends the phone to the password screen as a volunteer',async({page},info)=>{
  const name=`Sami Out ${info.project.name}`;
  await page.goto('/');await createProfile(page,name);await home(page);
  await becomeLead(page);await expect(dashboardButton(page)).toBeVisible();
  await headerName(page,name).click();
  await expect(page.getByRole('heading',{level:1,name:'Your profile'})).toBeVisible();
  const card=page.getByRole('region',{name:'Your profile'});
  await expect(card.getByText(name,{exact:true})).toBeVisible();await expect(card.getByText('Lead',{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('your-profile.png')});
  await page.getByRole('button',{name:'Back',exact:true}).click();await expect(dashboardButton(page)).toBeVisible();
  await headerName(page,name).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByText("Sign out? You'll need the Olympics password to get back in.",{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('sign-out-confirm.png')});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByText("Sign out? You'll need the Olympics password to get back in.",{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Yes, sign out',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible();
  // The pass, session and drafts go; the profile stays on the phone.
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
  await page.reload();await expect(page.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible();
  await typePassword(page);
  await page.getByRole('button',{name,exact:true}).click();await home(page);
  // Today's role went back to Volunteer: the lead code has to be typed again.
  await expect(page.getByRole('button',{name:"I'm a zone lead",exact:true})).toBeVisible();await expect(dashboardButton(page)).toHaveCount(0);
  await headerName(page,name).click();
  await expect(page.getByRole('region',{name:'Your profile'}).getByText('Volunteer',{exact:true})).toBeVisible();
});
test('a second tab on the same phone follows the sign out',async({page,context},info)=>{
  const name=`Tabs Out ${info.project.name}`;
  await page.goto('/');await createProfile(page,name);await home(page);
  const other=await context.newPage();await other.goto('/');await home(other);
  await headerName(page,name).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Yes, sign out',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible();
  await expect(other.getByRole('heading',{level:1,name:'Welcome to the Running Zone'})).toBeVisible();
  await other.close();
});
