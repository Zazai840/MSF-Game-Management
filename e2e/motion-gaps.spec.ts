import {expect,lookProblems,openRace,ownCode,ownEvent,ownName,ownWristbands,press,recordRace,test,writeCheckIn,type Locator} from './fixtures.js';

/** The name of the animation an element (or its pseudo-element) arrives with; "none" when it has none. */
const arrives=(target:Locator,pseudo?:string)=>target.evaluate((element,pseudo)=>getComputedStyle(element,pseudo).animationName,pseudo);

test('"Your turn" arrives with its gold dot growing in; not with reduced motion',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Motion turn'),n=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {page}=await openPhone(ownName('Motion turn finish'),{job:'finish'});
  await writeCheckIn(request,process.env.E2E_OWNER_TOKEN!,code,[n(1),n(2)]);
  await page.reload();await openRace(page,name);
  const band=page.locator('.rz-needsband--mine');
  await expect(band).toHaveText(/^Your turn/);
  expect(await arrives(band,'::before')).toBe('rz-dot-in');
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await arrives(band,'::before')).toBe('none');
});

test('a warning fades in and a calm note does not; a closed list\'s content fades in as it opens; not with reduced motion',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Motion list'),n=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[n(1),n(2)],[1100,1200]);
  // A lead's race page: the closed Saved versions list.
  const lead=await openPhone(ownName('Motion list lead'),{lead:true});
  await openRace(lead.page,name);
  const versions=lead.page.locator('details.rz-disclosure',{has:lead.page.locator('summary',{hasText:/^Saved versions \(/})}),cards=versions.locator(':scope > :not(summary)');
  await press(versions.locator('summary'));
  await expect(cards).toBeVisible();
  expect(await arrives(cards)).toBe('rz-arrive');
  await lead.page.emulateMedia({reducedMotion:'reduce'});
  expect(await arrives(cards)).toBe('none');
  const {page}=await openPhone(ownName('Motion list timer'),{job:'timer'});
  // A refused lead code in the job sheet: a warning.
  await press(page.getByRole('button',{name:/^Your role is .*\. Change job$/}));
  await page.getByRole('radio',{name:/^Zone lead/}).click();
  await page.route('**/api/become-lead',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Wrong lead code - ask a zone lead'})}),{times:1});
  await page.getByLabel('Lead code',{exact:true}).fill('wrong-fixture');
  await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
  const warning=page.getByRole('dialog').locator('.rz-callout[role="alert"]');
  await expect(warning).toHaveText('Wrong lead code - ask a zone lead');
  expect(await arrives(warning)).toBe('rz-arrive');
  expect(await lookProblems(page)).toEqual([]);
  // The rule is for warnings only: a calm note (role status) has no animation.
  const rules=await page.evaluate(()=>[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).map(rule=>rule.cssText).join('\n'));
  expect(rules).not.toMatch(/\.rz-callout--status[^{]*\{[^}]*animation/);
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await arrives(warning)).toBe('none');
});

test('the toast goes back down as it fades out, and the avatar menu grows from the avatar; not with reduced motion',async({openPhone})=>{
  const {page}=await openPhone(ownName('Motion menu'));
  const rule=(selector:string)=>page.evaluate(selector=>{
    const all=(rules:CSSRuleList):CSSRule[]=>[...rules].flatMap(rule=>'cssRules' in rule?[rule,...all((rule as CSSGroupingRule).cssRules)]:[rule]);
    return [...document.styleSheets].flatMap(sheet=>all(sheet.cssRules)).filter(rule=>(rule as CSSStyleRule).selectorText===selector).map(rule=>rule.cssText).join('\n');
  },selector);
  // The toast's way out lasts 150ms, so its rule is read: it sinks by the distance it rose.
  expect(await rule('.rz-toast--out')).toMatch(/translate:\s*0(px)? var\(--space-8\)/);
  await press(page.getByRole('banner').getByRole('button',{name:/: Log out$/}));
  const menu=page.getByRole('menu');
  await expect(menu).toBeVisible();
  expect(await arrives(menu)).toBe('rz-menu-in');
  expect(await menu.evaluate(element=>getComputedStyle(element).transformOrigin)).toMatch(/^(\d+(\.\d+)?)px 0px$/);
  expect(await menu.evaluate(element=>{const [x]=getComputedStyle(element).transformOrigin.split(' ');return parseFloat(x)===(element as HTMLElement).offsetWidth;})).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await arrives(menu)).toBe('none');
});

test('a bottom sheet follows a finger that pulls its grip down: a short pull goes back, a long pull or a flick closes it',async({openPhone},info)=>{
  test.skip(!info.project.use.hasTouch,'a pull is a touch gesture');
  const {page}=await openPhone(ownName('Motion sheet'));
  const sheet=page.getByRole('dialog',{name:'New race'}),open=async()=>{await page.getByRole('button',{name:/New race/}).click();await expect(sheet).toBeVisible();};
  const touch=await page.context().newCDPSession(page);
  const send=(type:'touchStart'|'touchMove'|'touchEnd',at?:{x:number;y:number})=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:at?[at]:[]});
  /** The finger goes down on the sheet's title and moves down by `by`, in steps `pause` ms apart; it stays down. */
  const pull=async(by:number,pause=30)=>{
    const box=(await sheet.locator('.rz-sheet__title').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
    await send('touchStart',{x,y});
    for(let moved=10;moved<=by;moved+=10) {await send('touchMove',{x,y:y+moved});if(pause) await page.waitForTimeout(pause);}
  };
  const top=async()=>(await sheet.boundingBox())!.y;
  await open();
  // Once it has slid up.
  await expect.poll(async()=>(await sheet.evaluate(element=>element.getAnimations().length))).toBe(0);
  const rest=await top();
  // A short slow pull: the sheet comes down with the finger, and goes back when it lets go.
  await pull(40,150);
  expect(Math.round(await top()-rest)).toBe(40);
  await send('touchEnd');
  await expect.poll(top).toBe(rest);
  await expect(sheet).toBeVisible();
  // A long pull closes it.
  await pull(Math.ceil((await sheet.boundingBox())!.height*.4/10)*10,60);
  await send('touchEnd');
  await expect(sheet).toHaveCount(0);
  // A quick flick closes it too, though it is short.
  await open();
  await expect.poll(async()=>(await sheet.evaluate(element=>element.getAnimations().length))).toBe(0);
  await pull(40,0);
  await send('touchEnd');
  await expect(sheet).toHaveCount(0);
  // The Close button in the title row still closes it with a tap.
  await open();
  await sheet.getByRole('button',{name:'Close',exact:true}).click();
  await expect(sheet).toHaveCount(0);
});
