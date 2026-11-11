import {ownName,expect,lookProblems,press,test,type Page} from './fixtures.js';

// The design system's navy, the app bar's colour from the first frame.
const navy='rgb(30, 43, 81)';
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();

test('while the app opens, everyone sees the new-look bar with a spinner and Opening the Running Zone…',async({openPhone},info)=>{
  const {page}=await openPhone(ownName('Opening volunteer'));
  // The home read is held, as on a slow phone, until the test lets it through.
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/home',async route=>{await held;await route.continue();});
  await page.reload();
  const header=page.getByRole('banner');
  await expect(header).toContainText('MSF Olympics');await expect(header).toContainText('Running Zone');
  expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  await expect(page.getByRole('status')).toHaveText('Opening the Running Zone…');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('opening.png'),fullPage:true});
  release();
  await races(page);
  expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
});

test('a phone that cannot reach the app while opening sees Could not connect - try again, and Refresh tries again',async({openPhone},info)=>{
  const {page}=await openPhone(ownName('Opening offline'));
  await page.route('**/api/home',route=>route.abort('internetdisconnected'));
  await page.reload();
  const callout=page.getByRole('alert');
  await expect(callout).toContainText('Could not connect - try again');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('could-not-connect.png'),fullPage:true});
  await page.unroute('**/api/home');
  await press(callout.getByRole('button',{name:'Refresh',exact:true}));
  await races(page);
});

test('a volunteer at a lead address sees Lead access needed; Back goes to Races, and today\'s lead code opens the screen',async({openPhone},info)=>{
  const {page}=await openPhone(ownName('Access volunteer'));
  await page.goto('/day');
  const header=page.getByRole('banner');
  await expect(header.getByRole('heading',{level:1,name:'Lead access needed',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Type the lead code',exact:true})).toBeVisible();
  await expect(page.getByText('Results and Day setup are for zone leads',{exact:true})).toBeVisible();
  await expect(page.getByText('Ask the zone lead who set up today.',{exact:true})).toBeVisible();
  const footer=page.getByRole('contentinfo');
  await expect(footer).toContainText('Type the code first.');
  await expect(footer.getByRole('button',{name:'Become lead',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-access-needed.png'),fullPage:true});
  await press(header.getByRole('button',{name:'Back to Races',exact:true}));
  await races(page);await expect(page).toHaveURL(/\/$/);
  await page.goto('/results');
  await expect(header.getByRole('heading',{level:1,name:'Lead access needed',exact:true})).toBeVisible();
  // A faked refusal shows the error style without adding to the server's wrong-code backoff.
  await page.route('**/api/become-lead',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Wrong lead code - ask a zone lead'})}),{times:1});
  await page.getByLabel('Lead code',{exact:true}).fill('wrong-fixture');
  await expect(footer).not.toContainText('Type the code first.');
  await press(footer.getByRole('button',{name:'Become lead',exact:true}));
  await expect(page.getByRole('alert')).toHaveText('Wrong lead code - ask a zone lead');
  expect(await lookProblems(page)).toEqual([]);
  await page.getByLabel('Lead code',{exact:true}).fill(process.env.E2E_LEAD_CODE!);
  await press(footer.getByRole('button',{name:'Become lead',exact:true}));
  await expect(header.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/\/results$/);
});

test('the app installs to the home screen: a web app manifest with its name, standalone display, the navy theme colour and icons the server serves',async({openPhone,request})=>{
  const {page}=await openPhone(ownName('Installing volunteer'));
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href','/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#1e2b51');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','/icons/apple-touch-icon.png');
  const response=await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest=await response.json();
  expect(manifest).toMatchObject({name:'MSF Running Zone',short_name:'Running Zone',start_url:'/',display:'standalone',theme_color:'#1e2b51',background_color:'#f0e7d3'});
  expect(manifest.icons.map((icon:{sizes:string})=>icon.sizes)).toEqual(expect.arrayContaining(['192x192','512x512']));
  for(const icon of manifest.icons as Array<{src:string;type:string}>) {
    const file=await request.get(icon.src);
    expect(file.ok(),icon.src).toBe(true);expect(file.headers()['content-type']).toContain(icon.type);
  }
  expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBe(true);
});
