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
