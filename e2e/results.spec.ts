import { expect,test,type Page } from '@playwright/test';
async function join(page:Page,name:string) {await page.goto('/');await page.getByLabel('Day code or owner password').fill(process.env.E2E_DAY_CODE!);await page.getByLabel('First name').fill(name);await page.getByRole('button',{name:'Join',exact:true}).click();}
async function digits(page:Page,value:number) {for(const digit of String(value)) await page.getByRole('button',{name:digit,exact:true}).click();}
test('a lead sees a phone-recorded race appear within one Results poll',async({page,browser},info)=>{
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const number=2401+offset;
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/events/R4/rename',{headers,data:{name:'60m'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await join(page,`Results lead ${info.project.name}`);await page.getByRole('button',{name:'Become lead',exact:true}).click();await page.getByLabel('Lead code or owner password').fill(process.env.E2E_LEAD_CODE!);await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();await page.getByRole('button',{name:'Lead · 0 needing you',exact:true}).click();
  await page.getByRole('button',{name:/^R4 · Girl Cubs/}).click();
  const context=await browser.newContext({...info.project.use,viewport:{width:390,height:844},isMobile:true,hasTouch:true});const phone=await context.newPage();
  await join(phone,`Results phone ${info.project.name}`);await phone.getByRole('button',{name:/^Start line ·/}).click();await phone.getByRole('button',{name:'60m',exact:true}).click();await phone.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();await digits(phone,number);await phone.getByRole('button',{name:'Next',exact:true}).click();await digits(phone,3045);await phone.getByRole('button',{name:'Next',exact:true}).click();await phone.getByRole('button',{name:'Keep',exact:true}).click();await phone.getByRole('button',{name:"That's everyone",exact:true}).click();await phone.getByRole('button',{name:'Save',exact:true}).click();
  const label=(await phone.getByRole('heading',{name:/Heat \d+ saved/}).innerText()).replace(' saved','');
  await expect(page.getByText(`${label} · checked in`,{exact:true})).toBeVisible({timeout:6500});
  await phone.getByRole('button',{name:'Home',exact:true}).click();await phone.getByRole('button',{name:/^Finish order ·/}).click();await phone.getByRole('button',{name:String(number),exact:true}).click();await phone.getByRole('button',{name:'3045',exact:true}).click();await phone.getByRole('button',{name:'Check the order',exact:true}).click();await phone.getByRole('button',{name:'Save',exact:true}).click();await expect(phone.getByText('Saved',{exact:true})).toBeVisible();
  await phone.getByRole('button',{name:'Home',exact:true}).click();await phone.getByRole('button',{name:/^Times ·/}).click();await phone.getByRole('button',{name:'Other race',exact:true}).click();await phone.getByRole('button',{name:`60m Girl Cubs (R4) · ${label}`,exact:true}).click();await digits(phone,1234);await phone.getByRole('button',{name:'Next',exact:true}).click();await digits(phone,1334);await phone.getByRole('button',{name:'Next',exact:true}).click();await phone.getByRole('button',{name:'Save',exact:true}).click();await expect(phone.getByText('Saved',{exact:true})).toBeVisible();
  const row=page.getByRole('listitem').filter({has:page.getByText(String(number),{exact:true})});
  await expect(row).toContainText('12.34',{timeout:6500});await expect(row).toContainText('Q');
  await expect(page.getByText('3045 belongs to Boy Scouts - this race is Girl Cubs',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:info.outputPath('live-leaderboard.png'),fullPage:true});
  await context.close();
});
