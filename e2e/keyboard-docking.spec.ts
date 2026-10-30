import {ownName,ownCode,press,ownEvent,ownRelay,ownWristbands,expect,inViewAboveFooter,openRace,openRelays,signInThroughApi,test,writeCheckIn,writeTeam,type Locator,type Page,type PhoneSession} from './fixtures.js';
/**
 * Playwright cannot raise a phone keyboard, so each page gets a fake visualViewport: keyboard(height) shrinks it to
 * what shows above the keyboard and fires resize, as iPhone Safari does; keyboard(null) closes it.
 */
function fakeViewport() {
  let shown:number|null=null;
  const viewport=Object.assign(new EventTarget(),{offsetTop:0,offsetLeft:0,pageTop:0,pageLeft:0,scale:1,onresize:null,onscroll:null,onscrollend:null});
  Object.defineProperties(viewport,{width:{get:()=>innerWidth},height:{get:()=>shown??innerHeight}});
  Object.defineProperty(window,'visualViewport',{configurable:true,get:()=>viewport});
  Object.assign(window,{keyboard:(height:number|null)=>{shown=height;viewport.dispatchEvent(new Event('resize'));}});
}
test.beforeEach(({context})=>context.addInitScript(fakeViewport));
/** A phone from openPhone, with the fake viewport too. */
async function withKeyboard(session:PhoneSession) {
  await session.context.addInitScript(fakeViewport);await session.page.reload();
  await expect(session.page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  return session;
}
const keyboard=(page:Page,height:number|null)=>page.evaluate(height=>(window as unknown as {keyboard:(height:number|null)=>void}).keyboard(height),height);
const footerBottom=async(footer:Locator)=>{const box=(await footer.boundingBox())!;return box.y+box.height;};
/** With the box focused, the footer's bottom edge sits on the keyboard, the footer no taller; blurred, it goes back to the foot of the screen. */
async function docksAboveKeyboard(page:Page,box:Locator,footer=page.locator('footer.rz-footer')) {
  const foot=page.viewportSize()!.height,open=Math.round(foot*0.55);
  await expect(box).toBeFocused();
  await keyboard(page,open);
  await expect.poll(async()=>Math.abs(await footerBottom(footer)-open)).toBeLessThanOrEqual(1);
  const docked=(await footer.boundingBox())!.height;
  await page.screenshot({path:test.info().outputPath('docked.png')});
  await box.blur();
  await expect.poll(async()=>Math.abs(await footerBottom(footer)-foot)).toBeLessThanOrEqual(1);
  expect(docked).toBeCloseTo((await footer.boundingBox())!.height,0);
  await keyboard(page,null);await box.focus();
}

test('the viewport lets Android shrink the page for the keyboard',async({page})=>{
  await page.goto('/');
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content',/(^|[ ,])interactive-widget=resizes-content($|,)/);
});
test('the start line\'s That\'s everyone and Next ride on the keyboard, and a tap on a greyed-out Next keeps the keyboard up',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Docked start');
  await ownEvent(request,code,name);
  const {page,token}=await withKeyboard(await openPhone(ownName('Docked start')));
  await request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}});
  await openRace(page,name);
  const box=page.getByLabel('Wristband number',{exact:true});
  await docksAboveKeyboard(page,box);
  const next=page.locator('footer.rz-footer').getByRole('button',{name:'Next',exact:true});
  await expect(next).toHaveAttribute('aria-disabled','true');
  await press(next,true);
  await expect(box).toBeFocused();
  await expect(page.getByRole('list',{name:'Wristbands entered'})).toHaveCount(0);
});
test('changing a typed wristband, Cancel, Remove and Save ride on the keyboard, and Cancel or Remove lets it close',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Docked change');
  await ownEvent(request,code,name);
  const {page,token}=await withKeyboard(await openPhone(ownName('Docked change')));
  await writeCheckIn(request,token,code,[2015]);
  await openRace(page,name);
  await page.getByRole('button',{name:'2015, Change',exact:true}).click();
  await expect(page.locator('footer.rz-footer').getByRole('button')).toHaveText(['Cancel','Remove','Save']);
  await docksAboveKeyboard(page,page.getByLabel('New number for 2015',{exact:true}));
  // Cancel and Remove end the typing, so a press on either takes focus from the box and the keyboard can close.
  const typing=()=>page.evaluate(()=>document.activeElement?.tagName==='INPUT');
  const footer=page.locator('footer.rz-footer');
  await press(footer.getByRole('button',{name:'Cancel',exact:true}));
  expect(await typing()).toBe(false);
  await page.getByRole('button',{name:'2015, Change',exact:true}).click();
  await page.getByLabel('New number for 2015',{exact:true}).focus();
  await press(footer.getByRole('button',{name:'Remove',exact:true}));
  await expect(page.getByRole('button',{name:'2015, Change',exact:true})).toHaveCount(0);
  expect(await typing()).toBe(false);
});
test('the finish line\'s Back and Add runner ride on the keyboard',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Docked finish');
  await ownEvent(request,code,name);
  await writeCheckIn(request,await signInThroughApi(request,ownName('Docked start line')),code,[2011]);
  const {page}=await withKeyboard(await openPhone(ownName('Docked finish'),{job:'finish'}));
  await openRace(page,name);
  await page.getByRole('button',{name:'+ Runner not on the list',exact:true}).click();
  await docksAboveKeyboard(page,page.getByLabel('Wristband number',{exact:true}));
});
test('the Timer\'s Back, No more finishers and Next ride on the keyboard',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Docked times');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,ownName('Docked timer start')),code,[2601,2602]);
  const {page}=await withKeyboard(await openPhone(ownName('Docked timer'),{job:'timer'}));
  await openRace(page,name);
  const box=page.getByLabel('Place time',{exact:true});
  await box.focus();
  await docksAboveKeyboard(page,box);
});
test('on a 12-runner heat, a wrong time typed with the keyboard up shows its warning, Fix time and Keep in view as the keyboard goes',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Docked big timer'),n=await ownWristbands('Girl Cubs',12);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,ownName('Docked big start')),code,Array.from({length:12},(_,index)=>n(index)));
  const {page}=await withKeyboard(await openPhone(ownName('Docked big timer'),{job:'timer'}));
  await openRace(page,name);
  const box=page.getByLabel('Place time',{exact:true}),footer=page.locator('footer.rz-footer');
  await box.focus();await keyboard(page,Math.round(page.viewportSize()!.height*0.55));
  for(const time of ['1100','1200','1150']) {await box.fill(time);await box.press('Enter');}
  const warning=page.getByRole('alert').filter({hasText:'The 3rd place time is faster than 2nd.'});
  await expect(warning).toBeVisible();
  // The box lets go while the warning waits, so the phone puts its keyboard away and the footer goes back to the foot.
  await expect(box).not.toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-keyboard','open');
  await keyboard(page,null);
  await expect(footer).toContainText('Fix or keep the 3rd place time first');
  await inViewAboveFooter(page,[warning,warning.getByRole('button',{name:'Fix time',exact:true}),warning.getByRole('button',{name:'Keep',exact:true})]);
  await page.screenshot({path:info.outputPath('docked-big-timer-warning.png')});
  // Fix time brings the keyboard back up with the footer on it.
  await warning.getByRole('button',{name:'Fix time',exact:true}).click();
  await docksAboveKeyboard(page,box);
});
test('Join\'s button stays at the foot of the screen while typing',async({page})=>{
  await page.goto('/');
  const footer=page.locator('footer.rz-footer'),foot=page.viewportSize()!.height;
  await page.getByLabel('Full name',{exact:true}).focus();
  await keyboard(page,Math.round(foot*0.55));
  // Two frames: the docking reads the viewport a frame after it changes.
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  expect(Math.abs(await footerBottom(footer)-foot)).toBeLessThanOrEqual(1);
});
test('a relay\'s teams sheet keeps Cancel and Save on the keyboard while the leg boxes are typed',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Docked relay');
  await ownRelay(code,name,'Boy Cubs');
  const {page,token}=await withKeyboard(await openPhone(ownName('Docked relay')));
  await writeTeam(request,token,code,[(await ownWristbands('Boy Cubs',1))(1),null,null,null]);
  await openRelays(page);
  await page.getByRole('article',{name:`${name} · Boy Cubs`,exact:true}).getByRole('button',{name:/^Teams 1/}).click();
  await page.getByRole('dialog').getByRole('button',{name:'New team',exact:true}).click();
  const box=page.getByLabel('1st leg',{exact:true}),foot=page.locator('.rz-sheet__foot');
  if(page.viewportSize()!.width<700) return docksAboveKeyboard(page,box,foot);
  // Over a phone's width the sheet is a centred dialog (race-flow.css), not a sheet at the foot: it shrinks to what
  // shows above the keyboard, Cancel and Save wholly in view there.
  const open=Math.round(page.viewportSize()!.height*0.55);
  await expect(box).toBeFocused();
  expect(await footerBottom(foot)).toBeGreaterThan(open);
  await keyboard(page,open);
  await expect.poll(()=>footerBottom(foot)).toBeLessThanOrEqual(open);
  await inViewAboveFooter(page,[foot.getByRole('button',{name:'Cancel',exact:true}),foot.getByRole('button',{name:'Save team 2',exact:true})]);
  await page.screenshot({path:info.outputPath('docked.png')});
});
