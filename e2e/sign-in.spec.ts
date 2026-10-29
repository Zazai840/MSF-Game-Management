import {expect,join,lookProblems,openLeadMenu,test,type Locator,type Page} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
/** Docked buttons sit at the bottom of the phone screen, as on the race screens. */
async function expectDocked(page:Page,button:Locator) {
  const box=(await button.boundingBox())!,height=page.viewportSize()!.height;
  expect(height-(box.y+box.height)).toBeLessThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(50);
}
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const jobChip=(page:Page,job:string)=>page.getByRole('button',{name:`Your job: ${job}. Change job`,exact:true});
test('a new phone joins with its name, the password and its job, stays signed in, and taps its name to sign in again',async({page},info)=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator.storage,'persist',{value:()=>{localStorage.setItem('e2e:persist','asked');return Promise.resolve(false);}});});
  const downloaded:string[]=[];
  page.on('request',request=>{if(request.url().endsWith('.js')) downloaded.push(request.url());});
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  // Full name first, then Password shown as typed, then the job cards and the help line.
  const boxes=page.locator('#join').getByRole('textbox');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).toHaveAccessibleName('Full name');
  await expect(boxes.nth(1)).toHaveAccessibleName('Password');
  await expect(boxes.nth(1)).toHaveAttribute('type','text');
  const cards=page.getByRole('radiogroup',{name:"What's your job today?"}),help=page.getByText('You can switch job on any race. Zone lead? Type your lead code as the password.',{exact:true});
  await expect(help).toBeVisible();
  expect((await help.boundingBox())!.y).toBeGreaterThan((await cards.boundingBox())!.y);
  await expectDocked(page,page.getByRole('button',{name:'Join',exact:true}));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('join.png')});
  // A real wrong code would count against the shared test IP's backoff, so the refusal is replayed here; the API test covers it.
  const wrong="That password isn't right. Check it with a lead and try again.";
  await page.route('**/api/join',route=>route.fulfill({status:403,json:{message:wrong}}),{times:1});
  await join(page,'Nobody',{code:'wrong-fixture'});
  await expect(page.getByRole('alert')).toHaveText(wrong);
  // The refusal is the amber callout under the Password box, above the job cards.
  const callout=(await page.locator('.rz-callout',{hasText:wrong}).boundingBox())!,password=(await page.getByLabel('Password',{exact:true}).boundingBox())!;
  expect(callout.y).toBeGreaterThanOrEqual(password.y+password.height);
  expect(callout.y+callout.height).toBeLessThanOrEqual((await cards.boundingBox())!.y);
  await page.screenshot({path:info.outputPath('join-wrong-password.png')});
  // Join with no job keeps the form, with "Choose your job" in amber under the cards.
  const name=`Ahmed Sign ${info.project.name}`;
  await join(page,`  Ahmed   Sign ${info.project.name} `);
  await expect(page.getByRole('alert')).toHaveText('Choose your job');
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  const choose=(await page.locator('.rz-callout',{hasText:'Choose your job'}).boundingBox())!,cardsBox=(await cards.boundingBox())!;
  expect(choose.y).toBeGreaterThanOrEqual(cardsBox.y+cardsBox.height);
  await page.screenshot({path:info.outputPath('join-choose-job.png')});
  // The keyboard's Go key joins.
  await page.getByRole('radio',{name:/^Start line/}).click();
  await page.getByLabel('Password',{exact:true}).press('Enter');
  await races(page);
  await expect(jobChip(page,'Start line')).toBeVisible();
  await expect(page.getByRole('button',{name:`${name}: Log out`,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('e2e:persist'))).toBe('asked');
  await page.reload();
  await races(page);await expect(jobChip(page,'Start line')).toBeVisible();
  expect(downloaded.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(false);
  // The session ends (as after a new day) but the phone keeps its pass and its name: tap it, then one tap on today's job.
  const sessionEnds=async()=>{await page.evaluate(()=>localStorage.removeItem('msf:token'));await page.reload();};
  await sessionEnds();
  await expect(page.getByRole('heading',{level:1,name:'Someone else? Join'})).toBeVisible();
  const welcome=page.getByRole('region',{name:'Joined on this phone before'});
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('welcome-back.png')});
  await welcome.getByRole('button',{name:new RegExp(`^${name}`)}).click();
  await expect(page.getByRole('heading',{level:1,name:"What's your job today?"})).toBeVisible();
  await expect(page.getByRole('button',{name:'Join',exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('job-cards.png')});
  await page.getByRole('radio',{name:/^Timer/}).click();
  await races(page);await expect(jobChip(page,'Timer')).toBeVisible();
  // Zone lead there asks for the lead code, then opens Races.
  await sessionEnds();
  await welcome.getByRole('button',{name:new RegExp(`^${name}`)}).click();
  await page.getByRole('radio',{name:/^Zone lead/}).click();
  await page.getByLabel('Lead code',{exact:true}).fill(process.env.E2E_LEAD_CODE!);
  await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
  await races(page);await expect(jobChip(page,'Zone lead')).toBeVisible();
  await openLeadMenu(page,'Results');
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  expect(downloaded.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(true);
});
test('a volunteer joining with a name taken on another phone is numbered, and the first phone keeps its own',async({page,browser},info)=>{
  const name=`Amina Taken ${info.project.name}`;
  await page.goto('/');await join(page,name,{job:'Finish line'});await races(page);
  const second=await browser.newContext({...info.project.use});
  try {
    const other=await second.newPage();await other.goto('/');await join(other,name.toLowerCase(),{job:'Finish line'});
    await races(other);
    await expect(other.getByRole('status')).toHaveText(`${name} is already taken, so you're signed in as ${name} 2`);
    await expect(other.getByRole('button',{name:`${name} 2: Log out`,exact:true})).toBeVisible();
    await expect(jobChip(other,'Finish line')).toBeVisible();
    expect(await lookProblems(other)).toEqual([]);
    await other.screenshot({path:info.outputPath('join-numbered.png')});
  } finally {await second.close();}
  await page.reload();
  await expect(page.getByRole('button',{name:`${name}: Log out`,exact:true})).toBeVisible();
});
test('the lead code joins as Zone lead on its own, and a name taken on another phone is numbered',async({page,browser},info)=>{
  const name=`Sara Taken Lead ${info.project.name}`;
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);
  const second=await browser.newContext({...info.project.use});
  try {
    const other=await second.newPage();await other.goto('/');
    await join(other,name.toLowerCase(),{code:process.env.E2E_LEAD_CODE});
    await races(other);
    await expect(jobChip(other,'Zone lead')).toBeVisible();
    await expect(other.getByRole('status')).toHaveText(`${name} is already taken, so you're signed in as ${name} 2`);
    await expect(other.getByRole('status').locator('strong')).toHaveText(`${name} 2`);
    // Initials skip the number: "Sara Taken Lead iPhone 2" is SI, not S2.
    await expect(other.getByRole('button',{name:`${name} 2: Results, Day setup and Log out`,exact:true})).toHaveText(`S${info.project.name[0].toUpperCase()}`);
    expect(await lookProblems(other)).toEqual([]);
    await other.screenshot({path:info.outputPath('lead-numbered.png')});
  } finally {await second.close();}
  // The first phone's profile is untouched.
  await page.reload();
  await expect(page.getByRole('button',{name:`${name}: Log out`,exact:true})).toBeVisible();
  await expect(jobChip(page,'Start line')).toBeVisible();
});
test('the owner password joins as the owner lead on the running day without touching it',async({page},info)=>{
  const before=await (await page.request.get('/api/day',{headers:headers()})).json();
  await page.goto('/');await join(page,`Owner Sign ${info.project.name}`,{code:'e2e-owner-fixture'});
  await races(page);await expect(jobChip(page,'Zone lead')).toBeVisible();
  await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  const after=await (await page.request.get('/api/day',{headers:headers()})).json();
  expect(after).toMatchObject({leadCode:before.leadCode,olympicsPassword:before.olympicsPassword,revision:expect.any(Number)});
});
test('an old phone explains that another phone is needed', async ({browser}) => {
  const context = await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 Version/14.1 Mobile/15E148 Safari/604.1'});
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText("This phone's browser is too old, please use another phone")).toBeVisible();
  await context.close();
});
