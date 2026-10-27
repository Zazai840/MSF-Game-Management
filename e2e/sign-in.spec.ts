import { becomeLead,expect,join,lookProblems,openLeadMenu,test,type Locator,type Page } from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
/** Docked buttons sit at the bottom of the phone screen, as on the race screens. */
async function expectDocked(page:Page,button:Locator) {
  const box=(await button.boundingBox())!,height=page.viewportSize()!.height;
  expect(height-(box.y+box.height)).toBeLessThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(50);
}
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const jobChip=(page:Page,job:string)=>page.getByRole('button',{name:`Your job: ${job}. Change job`,exact:true});
test('a new phone joins with the day code, its name and its job, stays signed in, and taps its name to sign in again',async({page},info)=>{
  await page.addInitScript(()=>{Object.defineProperty(navigator.storage,'persist',{value:()=>{localStorage.setItem('e2e:persist','asked');return Promise.resolve(false);}});});
  const downloaded:string[]=[];
  page.on('request',request=>{if(request.url().endsWith('.js')) downloaded.push(request.url());});
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  await expect(page.getByText('You can switch job on any race. Zone lead? Type the lead code instead of the day code.',{exact:true})).toBeVisible();
  await expectDocked(page,page.getByRole('button',{name:'Join',exact:true}));
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('join.png')});
  // A real wrong code would count against the shared test IP's backoff, so the refusal is replayed here; the API test covers it.
  await page.route('**/api/join',route=>route.fulfill({status:403,json:{message:"That is not the Olympics password or today's lead code. Check with a lead and try again."}}),{times:1});
  await join(page,'Nobody',{code:'wrong-fixture'});
  await expect(page.getByRole('alert')).toHaveText("That is not the Olympics password or today's lead code. Check with a lead and try again.");
  const name=`Ahmed Sign ${info.project.name}`;
  await join(page,`  Ahmed   Sign ${info.project.name} `,{job:'Start line'});
  await races(page);
  await expect(jobChip(page,'Start line')).toBeVisible();
  await expect(page.getByRole('button',{name:`${name}, your details`,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('e2e:persist'))).toBe('asked');
  await page.reload();
  await races(page);await expect(jobChip(page,'Start line')).toBeVisible();
  expect(downloaded.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(false);
  // The session ends (as after a new day) but the phone keeps its pass and its name: tap it, then choose today's job.
  await page.evaluate(()=>localStorage.removeItem('msf:token'));await page.reload();
  await expect(page.getByRole('heading',{level:1,name:'Someone else? Join'})).toBeVisible();
  const welcome=page.getByRole('region',{name:'Joined on this phone before'});
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('welcome-back.png')});
  await welcome.getByRole('button',{name:new RegExp(`^${name}`)}).click();
  await expect(page.getByRole('heading',{level:1,name:"What's your job today?"})).toBeVisible();
  await expect(page.getByRole('button',{name:'Join',exact:true})).toBeDisabled();
  await page.getByRole('radio',{name:/^Timer/}).click();
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await races(page);await expect(jobChip(page,'Timer')).toBeVisible();
  await becomeLead(page);
  await openLeadMenu(page,'Results');
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  expect(downloaded.some(url=>/\/Lead-[^/]+\.js/.test(url))).toBe(true);
});
test('Join refuses a name already taken on another phone, keeping what was typed, with That\'s me',async({page,browser},info)=>{
  const name=`Amina Taken ${info.project.name}`;
  await page.goto('/');await join(page,name,{job:'Finish line'});await races(page);
  const second=await browser.newContext({...info.project.use});
  try {
    const other=await second.newPage();await other.goto('/');await join(other,name.toLowerCase(),{job:'Finish line'});
    await expect(other.getByRole('alert')).toContainText(`${name} already has a profile. If that's you, tap That's me and show a lead. If not, add your middle name or initial.`);
    // The refusal comes out from under the docked Join, so That's me can be tapped.
    const thatsMe=(await other.getByRole('alert').getByRole('button',{name:"That's me",exact:true}).boundingBox())!;
    expect(thatsMe.y+thatsMe.height).toBeLessThanOrEqual((await other.getByRole('button',{name:'Join',exact:true}).boundingBox())!.y);
    await expect(other.getByLabel('Full name')).toHaveValue(name.toLowerCase());
    expect(await lookProblems(other)).toEqual([]);
    await other.screenshot({path:info.outputPath('join-taken.png')});
    await other.getByRole('button',{name:'Change name',exact:true}).click();
    await expect(other.getByRole('alert')).toHaveCount(0);
    await expect(other.getByLabel('Full name')).toBeFocused();
  } finally {await second.close();}
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
    await expect(other.getByRole('button',{name:`${name} 2: Results, Day setup and your details`,exact:true})).toHaveText(`S${info.project.name[0].toUpperCase()}`);
    expect(await lookProblems(other)).toEqual([]);
    await other.screenshot({path:info.outputPath('lead-numbered.png')});
  } finally {await second.close();}
  // The first phone's profile is untouched.
  await page.reload();
  await expect(page.getByRole('button',{name:`${name}, your details`,exact:true})).toBeVisible();
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
