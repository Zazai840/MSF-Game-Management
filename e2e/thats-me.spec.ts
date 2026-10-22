import type { Browser } from '@playwright/test';
import { becomeLead,createProfile,dashboardButton,expect,lookProblems,openDashboard,test,type Page } from './fixtures.js';
const home=(page:Page)=>expect(page.getByRole('heading',{name:'Which event are you at?'})).toBeVisible();
const profilesHeading=(page:Page)=>page.getByRole('heading',{level:1,name:"Who's using this phone?"});
const taken=(name:string)=>`${name} already has a profile. If that's you, tap That's me and show a lead. If not, add your middle name or initial.`;
/** Another phone of the same size, for the lead or the person's new phone. */
async function phone(browser:Browser) {
  return (await browser.newContext({...test.info().project.use})).newPage();
}
/** A signed-in lead on their own phone, with To check open. */
async function leadPhone(browser:Browser,name:string) {
  const lead=await phone(browser);
  await lead.goto('/');await createProfile(lead,name);await home(lead);
  await becomeLead(lead);await openDashboard(lead);
  return lead;
}
/** On a new phone: Create profile with a taken name, then That's me. */
async function askForProfile(page:Page,name:string) {
  await createProfile(page,name);
  await expect(page.getByRole('alert')).toContainText(taken(name));
  await expect(page.getByLabel('Full name',{exact:true})).toHaveValue(name);
  await page.getByRole('button',{name:"That's me",exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Waiting for a lead to approve'})).toBeVisible();
}
const card=(lead:Page,name:string)=>lead.getByRole('listitem').filter({hasText:`${name} wants their profile on a new phone`});

test("That's me moves a profile to a new phone once a lead approves, and the old phone forgets it",async({page,browser},info)=>{
  const name=`Sam Moved ${info.project.name}`;
  await page.goto('/');await createProfile(page,name);await home(page);
  await becomeLead(page);await expect(dashboardButton(page)).toBeVisible();
  const lead=await leadPhone(browser,`Lena Approves ${info.project.name}`);
  const newPhone=await phone(browser);
  await newPhone.goto('/');await createProfile(newPhone,name);
  await expect(newPhone.getByRole('alert')).toContainText(taken(name));
  await expect(newPhone.getByLabel('Full name',{exact:true})).toHaveValue(name);
  expect(await lookProblems(newPhone)).toEqual([]);
  await newPhone.screenshot({path:info.outputPath('taken-name.png')});
  await newPhone.getByRole('button',{name:"That's me",exact:true}).click();
  await expect(newPhone.getByRole('heading',{level:1,name:'Waiting for a lead to approve'})).toBeVisible();
  await expect(newPhone.getByTestId('waiting-name')).toHaveText(name);
  await expect(newPhone.getByText("You can't do jobs on this phone until a lead approves.",{exact:true})).toBeVisible();
  expect(await lookProblems(newPhone)).toEqual([]);
  await newPhone.screenshot({path:info.outputPath('waiting.png')});
  // Still waiting after a reload.
  await newPhone.reload();
  await expect(newPhone.getByTestId('waiting-name')).toHaveText(name);

  const request=card(lead,name);
  await expect(request).toBeVisible();
  await expect(request).toContainText("Approve only after checking it's them in person. Their old phone will be signed out.");
  await expect(lead.getByRole('heading',{level:2,name:/^\d+ things? needs? a zone lead$/})).toBeVisible();
  expect(await lookProblems(lead)).toEqual([]);
  await lead.screenshot({path:info.outputPath('to-check-thats-me.png')});
  await request.getByRole('button',{name:'Approve',exact:true}).click();
  await expect(request).toHaveCount(0);

  // The new phone notices by itself on its next check (every 5 seconds) and signs in as a volunteer.
  await expect(newPhone.getByRole('heading',{name:'Which event are you at?'})).toBeVisible({timeout:15000});
  await expect(newPhone.getByRole('banner').getByText(name,{exact:true})).toBeVisible();
  await expect(newPhone.getByRole('button',{name:"I'm a zone lead",exact:true})).toBeVisible();
  // The old phone is signed out of it and forgets it, staying past the Olympics password.
  await expect(profilesHeading(page)).toBeVisible({timeout:15000});
  await expect(page.getByText(name,{exact:true})).toHaveCount(0);
  await page.reload();
  await expect(profilesHeading(page)).toBeVisible();
  await expect(page.getByText(name,{exact:true})).toHaveCount(0);
  await newPhone.context().close();await lead.context().close();
});

test("a declined That's me goes back to Create profile with the reason, and Cancel goes back too",async({page,browser},info)=>{
  const name=`Sam Declined ${info.project.name}`;
  await page.goto('/');await createProfile(page,name);await home(page);
  const lead=await leadPhone(browser,`Lena Declines ${info.project.name}`);
  const newPhone=await phone(browser);
  await newPhone.goto('/');await askForProfile(newPhone,name);
  await card(lead,name).getByRole('button',{name:'Decline',exact:true}).click();
  await expect(newPhone.getByRole('alert')).toHaveText('A lead did not approve this - add your middle name or initial.',{timeout:15000});
  await expect(profilesHeading(newPhone)).toBeVisible();
  await expect(newPhone.getByLabel('Full name',{exact:true})).toHaveValue(name);
  // The old phone keeps its profile.
  await page.reload();await home(page);

  await askForProfile(newPhone,name);
  await expect(card(lead,name)).toBeVisible();
  await newPhone.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(profilesHeading(newPhone)).toBeVisible();
  await expect(newPhone.getByRole('button',{name:'New here? Create profile'})).toHaveAttribute('aria-expanded','true');
  await expect(card(lead,name)).toHaveCount(0,{timeout:10000});
  await newPhone.context().close();await lead.context().close();
});
