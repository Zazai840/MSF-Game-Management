import { timesOpened,goHome,jobButton,dashboardButton,expect,joinDay,test,type Page } from './fixtures.js';

const navy='rgb(27, 42, 81)',red='rgb(172, 48, 54)',ground='rgb(243, 245, 249)';

/** Every rule of the v2 look that can be measured on the screen currently shown. */
async function lookProblems(page:Page) {
  await page.evaluate(()=>document.fonts.ready);
  return page.evaluate(()=>{
    const problems:string[]=[];
    const visible=(element:Element)=>{const box=element.getBoundingClientRect();const style=getComputedStyle(element);return box.width>0&&box.height>0&&style.visibility!=='hidden'&&style.display!=='none';};
    const describe=(element:Element)=>`${element.tagName.toLowerCase()} "${(element.textContent||element.getAttribute('aria-label')||'').trim().slice(0,40)}"`;
    const rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number);
    const luminance=(value:string)=>{const [r,g,b]=rgb(value).slice(0,3).map(channel=>{const c=channel/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
    const background=(element:Element|null):string=>{
      for(let current=element;current;current=current.parentElement) {const value=getComputedStyle(current).backgroundColor;if(rgb(value)[3]!==0) return value;}
      return 'rgb(255, 255, 255)';
    };
    for(const target of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary')) {
      if(!visible(target)) continue;
      const box=(target.matches('input[type=radio],input[type=checkbox]')&&target.closest('label')?target.closest('label')!:target).getBoundingClientRect();
      if(box.height<43.5||box.width<43.5) problems.push(`tap target ${describe(target)} is ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    for(const heading of document.querySelectorAll('h1,h2')) {
      const size=parseFloat(getComputedStyle(heading).fontSize);
      if(visible(heading)&&(size<22||size>26)) problems.push(`heading ${describe(heading)} is ${size}px`);
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      const element=node.parentElement!;
      if(!node.textContent!.trim()||!visible(element)||element.closest('[aria-hidden=true],button:disabled,script,style')) continue;
      const style=getComputedStyle(element);
      if(element.closest('p,li,label,dd,dt,td,th,button,output,a')&&!element.closest('small,.badge,h1,h2,h3')&&parseFloat(style.fontSize)<15) problems.push(`text ${describe(element)} is ${style.fontSize}`);
      const [a,b]=[luminance(style.color),luminance(background(element))].sort((x,y)=>y-x);
      const ratio=(a+0.05)/(b+0.05);
      if(ratio<4.5) problems.push(`text ${describe(element)} contrast ${ratio.toFixed(2)}`);
    }
    return problems;
  });
}

async function joinAs(page:Page,name:string) {await page.goto('/');await joinDay(page,name);}

test('the Join screen asks for a full name and refuses a full name already in use',async({page,browser},info)=>{
  await page.goto('/');
  await expect(page.getByLabel('Full name')).toHaveAttribute('autocomplete','name');
  await expect(page.getByLabel('First name')).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  const join=page.getByRole('button',{name:'Join',exact:true});
  const box=(await join.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(50);expect(box.height).toBeLessThanOrEqual(56);
  expect(await join.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe(ground);
  await page.screenshot({path:info.outputPath('join.png'),fullPage:true});
  const name=`Amina Look ${info.project.name}`;
  await joinDay(page,name);
  await expect(page.getByRole('banner')).toBeVisible();
  const second=await browser.newContext({...info.project.use});
  try {
    const other=await second.newPage();await other.goto('/');await joinDay(other,name.toLowerCase());
    await expect(other.getByRole('alert')).toHaveText(`Someone has joined as ${name} - use your full name so the zone lead can tell you apart`);
    await other.screenshot({path:info.outputPath('join-taken.png'),fullPage:true});
  } finally {await second.close();}
});

test('a navy header shows Running Zone and the joined person, in self-hosted Nunito',async({page},info)=>{
  const outside:string[]=[];
  page.on('request',request=>{if(!request.url().startsWith(info.project.use.baseURL||'http://127.0.0.1')) outside.push(request.url());});
  const fonts:string[]=[];
  page.on('response',response=>{if(response.url().endsWith('.woff2')) fonts.push(response.url());});
  await joinAs(page,`Abdulaziz ${info.project.name} Zazai`);
  const header=page.getByRole('banner');
  await expect(header.getByText('Running Zone',{exact:true})).toBeVisible();
  await expect(header.getByText(`Abdulaziz ${info.project.name} Zazai`,{exact:true})).toBeVisible();
  expect(await header.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(navy);
  const avatar=header.locator('[aria-hidden=true]',{hasText:/^AZ$/});
  await expect(avatar).toBeVisible();
  expect(await avatar.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(red);
  expect(await page.evaluate(()=>getComputedStyle(document.body).fontFamily)).toMatch(/^Nunito, system-ui/);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>[500,600,700,800].every(weight=>document.fonts.check(`${weight} 16px Nunito`,'Running Zone')))).toBe(true);
  expect(await page.evaluate(()=>[...document.fonts].filter(font=>font.family.replace(/"/g,'')==='Nunito'&&font.status==='loaded').length)).toBeGreaterThan(0);
  expect(fonts.length).toBeGreaterThan(0);
  expect(outside).toEqual([]);
  // The font arrives with the app shell, so a reopened phone needs no outside request.
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cached=await page.evaluate(async()=>{const keys=await caches.keys();const cache=await caches.open(keys.find(key=>key.startsWith('msf-shell-'))!);return (await cache.keys()).map(request=>new URL(request.url).pathname);});
  expect(cached.filter(path=>path.endsWith('.woff2')).length).toBeGreaterThan(0);
  expect(cached.filter(path=>path.endsWith('.css')).length).toBeGreaterThan(0);
  await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
});

test('volunteer and lead screens meet the touch, text size and contrast rules',async({page},info)=>{
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await joinAs(page,`Look lead ${info.project.name}`);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
  expect(await lookProblems(page)).toEqual([]);
  // A faked refusal shows the error style without adding to the server's wrong-code backoff.
  await page.route('**/api/become-lead',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Wrong lead code - ask a zone lead'})}),{times:1});
  await page.getByLabel('Lead code or owner password').fill('wrong-fixture');
  await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong lead code - ask a zone lead');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('become-lead-error.png'),fullPage:true});
  await page.getByLabel('Lead code or owner password').fill(process.env.E2E_LEAD_CODE!);
  await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
  await expect(dashboardButton(page)).toBeVisible();
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await jobButton(page,'Start line').click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  const wristband=page.getByLabel('Wristband number',{exact:true});
  await wristband.fill('2091');
  await expect(wristband).toHaveValue('2091');
  expect(await wristband.evaluate(element=>getComputedStyle(element).fontVariantNumeric)).toBe('tabular-nums');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('start-line-entry.png'),fullPage:true});
  await goHome(page);
  await jobButton(page,'Times').click();
  await timesOpened(page);
  expect(await lookProblems(page)).toEqual([]);
  await goHome(page);
  await dashboardButton(page).click();
  await page.getByRole('button',{name:'Results',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-results.png'),fullPage:true});
  await page.getByRole('button',{name:'Needs you',exact:true}).click();
  expect(await lookProblems(page)).toEqual([]);
});
