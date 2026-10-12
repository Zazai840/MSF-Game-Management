import { expect,test,type Page } from '@playwright/test';
async function typeNumber(page:Page,number:number) {for(const digit of String(number)) await page.getByRole('button',{name:digit,exact:true}).click();}
async function clearNumber(page:Page) {for(let index=0;index<4;index++) await page.getByRole('button',{name:'Delete last digit',exact:true}).click();}
test('a volunteer checks in a race, keeps a failed save and corrects the saved runners',async({page},info)=>{
  await page.request.post('/api/day/events/R4/rename',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{name:'60m'}});
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{}});
  await page.goto('/');
  await page.getByLabel('Day code or owner password').fill(process.env.E2E_DAY_CODE!);
  await page.getByLabel('First name').fill(`Start ${info.project.name}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.getByRole('button',{name:/^Start line ·/}).click();
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  await typeNumber(page,2001);await page.getByRole('button',{name:'Next',exact:true}).click();
  await typeNumber(page,2001);await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('2001 is already in this race');await clearNumber(page);
  for(const number of [2002,2003,2004,2005,2006]) {await typeNumber(page,number);await page.getByRole('button',{name:'Next',exact:true}).click();}
  await typeNumber(page,2007);await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Races hold up to 6 runners');await clearNumber(page);
  await page.screenshot({path:info.outputPath('start-line-keypad.png'),fullPage:true});
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(page.getByRole('heading',{name:'6 runners. Is that right?',exact:true})).toBeVisible();
  await page.route('**/api/races/check-in',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary connection problem'})}));
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Not saved - tap Save again',{exact:true})).toBeVisible();
  await expect(page.getByText('2006',{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:/^Start line ·/}).click();
  await expect(page.getByRole('heading',{name:'6 runners. Is that right?',exact:true})).toBeVisible();
  await page.unroute('**/api/races/check-in');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Heat \d+ saved/})).toBeVisible();
  await page.getByRole('button',{name:'Edit runners',exact:true}).click();
  await page.getByRole('button',{name:'Remove runner 2006',exact:true}).click();
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(page.getByRole('heading',{name:'5 runners. Is that right?',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByRole('heading',{name:/Heat \d+ saved/})).toBeVisible();
  await page.getByRole('button',{name:'Delete this race',exact:true}).click();
  await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
});
