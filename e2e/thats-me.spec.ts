import type { Browser } from '@playwright/test';
import { expect,join,lookProblems,test,type APIRequestContext,type Page } from './fixtures.js';
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const taken=(name:string)=>`${name} already has a profile. If that's you, tap That's me and show a lead. If not, add your middle name or initial.`;
/** Another phone of the same size, for the person's new phone. */
async function phone(browser:Browser) {
  return (await browser.newContext({...test.info().project.use})).newPage();
}
/** On a new phone: Join with a taken name, then That's me. */
async function askForProfile(page:Page,name:string) {
  await join(page,name,{job:'Start line'});
  await expect(page.getByRole('alert')).toContainText(taken(name));
  await expect(page.getByLabel('Full name',{exact:true})).toHaveValue(name);
  await page.getByRole('button',{name:"That's me",exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Waiting for a lead to approve'})).toBeVisible();
}
/**
 * A lead's decision on the person's That's me request.
 * shortcut: decided through the API, as the race flow has no screen for it yet (To check is gone); drive the lead's screen once it has one.
 */
async function decide(request:APIRequestContext,name:string,decision:'approve'|'decline') {
  const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
  const waiting=(await (await request.get('/api/lead',{headers})).json()).profileRequests.find((item:{name:string})=>item.name===name);
  expect(waiting,`${name} is waiting for a lead`).toBeTruthy();
  expect((await request.post(`/api/lead/thats-me/${waiting.id}/${decision}`,{headers,data:{}})).ok()).toBe(true);
}

test("That's me moves a profile to a new phone once a lead approves, and the old phone forgets it",async({page,browser,request},info)=>{
  const name=`Sam Moved ${info.project.name}`;
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);
  const newPhone=await phone(browser);
  await newPhone.goto('/');await join(newPhone,name,{job:'Timer'});
  await expect(newPhone.getByRole('alert')).toContainText(taken(name));
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
  await decide(request,name,'approve');
  // The new phone notices by itself on its next check (every 5 seconds), signs in as a volunteer and chooses today's job.
  await expect(newPhone.getByRole('heading',{level:1,name:"What's your job today?"})).toBeVisible({timeout:15000});
  await newPhone.getByRole('radio',{name:/^Timer/}).click();await newPhone.getByRole('button',{name:'Join',exact:true}).click();
  await races(newPhone);
  await expect(newPhone.getByRole('button',{name:`${name}, your details`,exact:true})).toBeVisible();
  // The old phone is signed out of it and forgets it.
  await expect(page.getByRole('heading',{level:1,name:/Join/})).toBeVisible({timeout:15000});
  await expect(page.getByText(name,{exact:true})).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(name,{exact:true})).toHaveCount(0);
  await newPhone.context().close();
});

test("a declined That's me goes back to Join with the reason, and Cancel goes back too",async({page,browser,request},info)=>{
  const name=`Sam Declined ${info.project.name}`;
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);
  const newPhone=await phone(browser);
  await newPhone.goto('/');await askForProfile(newPhone,name);
  await decide(request,name,'decline');
  await expect(newPhone.getByRole('alert')).toHaveText('A lead did not approve this - add your middle name or initial.',{timeout:15000});
  await expect(newPhone.getByLabel('Full name',{exact:true})).toHaveValue(name);
  // The old phone keeps its profile.
  await page.reload();await races(page);
  await askForProfile(newPhone,name);
  await newPhone.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(newPhone.getByRole('heading',{level:1,name:/Join/})).toBeVisible();
  await expect.poll(async()=>(await (await request.get('/api/lead',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`}})).json()).profileRequests.some((item:{name:string})=>item.name===name),{timeout:10000}).toBe(false);
  await newPhone.context().close();
});
