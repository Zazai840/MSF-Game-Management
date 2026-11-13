import {expect,flowPost,lookProblems,openRace,ownCode,ownEvent,ownName,ownWristbands,press,recordRace,signInThroughApi,test,writeCheckIn,type Locator,type Page} from './fixtures.js';

const width=async(target:Locator)=>(await target.boundingBox())!.width;
/** The element's scale while the mouse is held down on it, once any press transition has ended. */
async function pressedScale(page:Page,target:Locator) {
  // Brought to the middle of the screen first: on a long Races list it can sit under the footer.
  await target.evaluate(element=>element.scrollIntoView({block:'center'}));
  const box=(await target.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  // Held for longer than the press transition, then read: a reduced-motion page stays at "none".
  await page.waitForTimeout(300);
  const transform=await target.evaluate(element=>getComputedStyle(element).scale);
  await page.mouse.move(0,0);await page.mouse.up();
  return transform;
}
const shrunk='0.97';

test('the Timer\'s Next takes the free width of the footer row, wider than Previous',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Feel next'),n=await ownWristbands('Girl Cubs',5);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,ownName('Feel next start')),code,[n(1),n(2),n(3),n(4),n(5)]);
  const {page}=await openPhone(ownName('Feel next timer'),{job:'timer'});
  await openRace(page,name);
  const footer=page.locator('.rz-footer'),button=(label:string)=>footer.getByRole('button',{name:label,exact:true});
  const next=await width(button('Next'));
  // "No more finishers" keeps its words, so it stays the longest label; Next takes all the width that is left.
  expect(next).toBeGreaterThan(await width(button('Previous place')));
  expect(next).toBeGreaterThanOrEqual(85);
  await expect(button('Previous place')).toHaveText('Previous');
  const tops=await Promise.all(['Previous place','No more finishers','Next'].map(async label=>(await button(label).boundingBox())!.y));
  expect(new Set(tops.map(Math.round)).size).toBe(1);
  expect(await lookProblems(page)).toEqual([]);
});

test('changing a wristband: the footer holds Cancel and a wide Save, and Remove is a small red button under the number box',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Feel change'),n=await ownWristbands('Girl Cubs',3);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {page,token}=await openPhone(ownName('Feel change start'));
  await writeCheckIn(request,token,code,[n(1),n(2),n(3)]);
  await page.reload();await openRace(page,name);
  await press(page.getByRole('button',{name:`${n(2)}, Change`}));
  const footer=page.locator('.rz-footer');
  await expect(footer.getByRole('button')).toHaveText(['Cancel','Save']);
  expect(await width(footer.getByRole('button',{name:'Save',exact:true}))).toBeGreaterThan(2*await width(footer.getByRole('button',{name:'Cancel',exact:true})));
  const remove=page.getByRole('main').getByRole('button',{name:`Remove ${n(2)}`,exact:true});
  await expect(remove).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await press(remove);
  await expect(page.getByRole('button',{name:`${n(2)}, Change`})).toHaveCount(0);
  await expect(page.getByRole('button',{name:`${n(1)}, Change`})).toBeVisible();
});

test('on a final, Here and Absent keep their look while a tap is being saved, and a second tap waits its turn',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Feel here'),n=await ownWristbands('Boy Cubs',6);
  await ownEvent(request,code,name,'Boy Cubs');
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[n(1),n(2),n(3),n(4),n(5),n(6)],[900,1000,1100,1200,1300,1400]);
  const lead=await signInThroughApi(request,ownName('Feel here lead'));
  expect((await request.post('/api/become-lead',{headers:{authorization:`Bearer ${lead}`},data:{code:process.env.E2E_LEAD_CODE}})).ok()).toBe(true);
  const finalId=(await flowPost(request,lead,'/api/races',{eventCode:code,kind:'final'})).race.id;
  const {page}=await openPhone(ownName('Feel here start'));
  await page.goto(`/races/${finalId}`);
  const mark=(wristband:number,which:'Here'|'Absent')=>page.getByRole('button',{name:`${wristband}: ${which}`,exact:true});
  await expect(mark(n(1),'Here')).toBeEnabled();
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
  let writes=0;
  await page.route('**/api/races/**',async route=>{if(route.request().method()!=='POST') return route.continue();writes++;await held;await route.continue();});
  await press(mark(n(1),'Here'));
  await expect.poll(()=>writes).toBe(1);
  // The save is in flight: no mark greys out, and a tap on another runner is not sent on top of it.
  for(const which of ['Here','Absent'] as const) await expect(mark(n(2),which)).toBeEnabled();
  await press(mark(n(2),'Absent'));
  expect(writes).toBe(1);
  // It waits its turn and is saved after the first.
  release();
  await expect(mark(n(1),'Here')).toHaveAttribute('aria-pressed','true');
  await expect(mark(n(2),'Absent')).toHaveAttribute('aria-pressed','true');
  expect(writes).toBe(2);
});

test('rows, heat chips, tabs and the job band shrink a little while pressed; not with reduced motion',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Feel press');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {page,token}=await openPhone(ownName('Feel press lead'),{lead:true});
  await writeCheckIn(request,token,code,[(await ownWristbands('Girl Cubs',1))(1)]);
  await page.reload();
  const chip=page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true}).getByRole('button',{name:/^Heat 1,/});
  await expect(chip).toBeVisible();
  const targets=[chip,page.getByRole('button',{name:/Change job$/}),page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:/^Relays/}),
    page.getByRole('navigation',{name:'Lead screens'}).getByRole('button',{name:'Results',exact:true})];
  for(const target of targets) expect(await pressedScale(page,target),await target.textContent()||'').toBe(shrunk);
  await page.getByRole('navigation',{name:'Lead screens'}).getByRole('button',{name:'Day setup',exact:true}).click();
  const row=page.getByRole('button',{name:/^Events/});
  await expect(row).toBeVisible();
  expect(await pressedScale(page,row)).toBe(shrunk);
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await pressedScale(page,row)).toBe('none');
});

test('the phone-feel fixes: no double-tap zoom or text selection on buttons, sheets keep their scroll, links have no tap flash, and the bottom edges leave room for the home bar',async({openPhone})=>{
  const {page}=await openPhone(ownName('Feel native'));
  const newRace=page.getByRole('button',{name:/New race/});
  expect(await newRace.evaluate(element=>{const style=getComputedStyle(element);return [style.touchAction,style.userSelect];})).toEqual(['manipulation','none']);
  await newRace.click();
  const sheet=page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(element=>getComputedStyle(element).overscrollBehaviorY)).toBe('contain');
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('-webkit-tap-highlight-color'))).toBe('rgba(0, 0, 0, 0)');
  // The inset is 0 in a test browser, so the rules themselves are read.
  const rules=await page.evaluate(()=>[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).map(rule=>rule.cssText).filter(text=>text.includes('safe-area-inset-bottom')).join('\n'));
  expect(rules).toMatch(/\.rz-footer\b[^{]*\{[^}]*safe-area-inset-bottom/);
  expect(rules).toMatch(/\.rz-sheet\b[^{]*\{[^}]*safe-area-inset-bottom/);
});

test('a sheet slides up and leaves faster than it came; with reduced motion it opens and closes at once',async({openPhone})=>{
  const {page}=await openPhone(ownName('Feel sheet'));
  const sheet=page.getByRole('dialog',{name:'New race'}),open=()=>page.getByRole('button',{name:/New race/}).click();
  await open();
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(element=>getComputedStyle(element).transitionProperty)).toContain('translate');
  // Closing: the sheet stays for its short way out, marked as closing, then is gone.
  await sheet.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.locator('.rz-scrim[data-closing]')).toHaveCount(1);
  await expect(sheet).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await open();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button',{name:'Close',exact:true}).click();
  expect(await sheet.count()).toBe(0);
});

test('the toast sits just above an open sheet, and on Events and on Day setup just above the lead\'s bar, clear of the rows',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Feel toast');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {page}=await openPhone(ownName('Feel toast lead'),{lead:true});
  const bar=page.getByRole('navigation',{name:'Lead screens'}),toast=page.locator('.rz-toast');
  await bar.getByRole('button',{name:'Day setup',exact:true}).click();
  await page.getByRole('button',{name:/^Events/}).click();
  const row=page.getByRole('button',{name:new RegExp(`^${name}`)}),sheet=page.getByRole('dialog');
  const box=async(target:Locator)=>(await target.boundingBox())!;
  await row.click();await sheet.getByRole('button',{name:'Switch off',exact:true}).click();
  await expect(toast).toContainText(`${code} switched off`);
  await row.click();
  await expect(sheet.getByRole('button',{name:'Switch on',exact:true})).toBeVisible();
  // Once the sheet has slid up, the toast is above it, not on its title.
  await expect(async()=>{const top=(await box(sheet)).y,foot=await box(toast);expect(foot.y+foot.height).toBeLessThanOrEqual(top);expect(foot.y+foot.height).toBeGreaterThan(top-16);}).toPass({timeout:3000});
  await sheet.getByRole('button',{name:'Switch on',exact:true}).click();
  await expect(toast).toContainText(`${code} switched on`);
  // On Events, a deeper screen, with the sheet closed: just above the lead's bar.
  await expect(async()=>{const foot=await box(toast),above=await box(bar);expect(foot.y+foot.height).toBeLessThanOrEqual(above.y);expect(foot.y+foot.height).toBeGreaterThan(above.y-16);}).toPass({timeout:3000});
  await page.getByRole('banner').getByRole('button',{name:'Back to Day setup'}).click();
  const last=page.getByRole('button',{name:/^Start a new day/});
  await expect(last).toBeVisible();
  await expect(async()=>{
    const foot=await box(toast),above=await box(bar),rowBox=await box(last);
    expect(foot.y+foot.height).toBeLessThanOrEqual(above.y);expect(foot.y+foot.height).toBeGreaterThan(above.y-16);
    expect(foot.y).toBeGreaterThanOrEqual(rowBox.y+rowBox.height);
  }).toPass({timeout:3000});
});

test('on every screen, Join also, a pull down never reloads the app and two fast taps never zoom; a pinch still zooms',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  // A test browser has no pull-to-reload and no double-tap zoom, so the page's settings are read.
  expect(await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);return [style.overscrollBehaviorY,style.touchAction];})).toEqual(['contain','manipulation']);
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toMatch(/user-scalable|maximum-scale/);
});

test('a long press on a label or a link selects no words; a heading and typed words can still be selected',async({page})=>{
  await page.goto('/');
  const selects=(target:Locator)=>target.evaluate(element=>getComputedStyle(element).userSelect);
  const name=page.getByRole('textbox',{name:'Full name'});
  await expect(name).toBeVisible();
  expect(await selects(page.locator('label[for="join-name"]'))).toBe('none');
  // The only link is on the test build, so one is put on the screen to read the rule for links.
  expect(await page.locator('.rz-screen').first().evaluate(screen=>{const link=screen.appendChild(document.createElement('a'));link.href='#';const select=getComputedStyle(link).userSelect;link.remove();return select;})).toBe('none');
  for(const content of [page.locator('body'),page.getByRole('heading',{level:1}),name]) expect(await selects(content)).not.toBe('none');
});

test('Join has no scroll room when it fits; on a short screen it still scrolls',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  const room=()=>page.evaluate(()=>document.documentElement.scrollHeight-window.innerHeight);
  expect(await room()).toBe(0);
  // The phone's address bar cannot be shown in a test browser, so the page's own height rule is read: it follows the visible screen.
  expect(await page.evaluate(()=>[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).filter((rule):rule is CSSStyleRule=>rule instanceof CSSStyleRule && rule.selectorText==='body').map(rule=>rule.style.minHeight).filter(Boolean))).toEqual(['100dvh']);
  expect(await lookProblems(page)).toEqual([]);
  await page.setViewportSize({width:page.viewportSize()!.width,height:300});
  expect(await room()).toBeGreaterThan(0);
});
