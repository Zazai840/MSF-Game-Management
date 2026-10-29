import {ownCode,ownEvent,ownRelay,ownWristbands,expect,inViewAboveFooter,openRace,openRaceScreen,openRelays,signInThroughApi,takeJob,test,tickTeam,writeCheckIn,writeTeam,writeTeamOrder,type Locator,type Page,type PhoneSession} from './fixtures.js';
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
test('the start line\'s That\'s everyone and Next ride on the keyboard, and a tap on a greyed-out Next keeps the keyboard up',async({openPhone,request},info)=>{
  const code=await ownCode(),name=`Docked start ${info.project.name}`;
  await ownEvent(request,code,name);
  const {page,token}=await withKeyboard(await openPhone(`Docked start ${info.project.name}`));
  await request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}});
  await openRace(page,name);
  const box=page.getByLabel('Wristband number',{exact:true});
  await docksAboveKeyboard(page,box);
  const next=page.locator('footer.rz-footer').getByRole('button',{name:'Next',exact:true});
  await expect(next).toHaveAttribute('aria-disabled','true');
  await next.tap({force:true});
  await expect(box).toBeFocused();
  await expect(page.getByRole('list',{name:'Wristbands entered'})).toHaveCount(0);
});
test('the finish line\'s Back and Add runner ride on the keyboard',async({openPhone,request},info)=>{
  const code=await ownCode(),name=`Docked finish ${info.project.name}`;
  await ownEvent(request,code,name);
  await writeCheckIn(request,await signInThroughApi(request,`Docked start line ${info.project.name}`),code,[2011]);
  const {page}=await withKeyboard(await openPhone(`Docked finish ${info.project.name}`,{job:'finish'}));
  await openRace(page,name);
  await page.getByRole('button',{name:'+ Runner not on the list',exact:true}).click();
  await docksAboveKeyboard(page,page.getByLabel('Wristband number',{exact:true}));
});
test('the Timer\'s Back, No more finishers and Next ride on the keyboard',async({openPhone,request},info)=>{
  const code=await ownCode(),name=`Docked times ${info.project.name}`;
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,`Docked timer start ${info.project.name}`),code,[2601,2602]);
  const {page}=await withKeyboard(await openPhone(`Docked timer ${info.project.name}`,{job:'timer'}));
  await openRace(page,name);
  const box=page.getByLabel('Place time',{exact:true});
  await box.focus();
  await docksAboveKeyboard(page,box);
});
test('on a 12-runner heat, a wrong time typed with the keyboard up shows its warning, Fix time and Keep in view as the keyboard goes',async({openPhone,request},info)=>{
  const code=await ownCode(),name=`Docked big timer ${info.project.name}`,n=await ownWristbands('Girl Cubs',12);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await writeCheckIn(request,await signInThroughApi(request,`Docked big start ${info.project.name}`),code,Array.from({length:12},(_,index)=>n(index)));
  const {page}=await withKeyboard(await openPhone(`Docked big timer ${info.project.name}`,{job:'timer'}));
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
test('the older screens\' button bar rides on the keyboard too',async({openPhone,request},info)=>{
  const code=await ownCode(),name=`Docked relay ${info.project.name}`;
  await ownRelay(code,name,'Boy Cubs');
  const {page,token}=await withKeyboard(await openPhone(`Docked relay ${info.project.name}`));
  const n=await ownWristbands('Boy Cubs',8);
  for(const legs of [[0,1,2,3],[4,5,6,7]].map(team=>team.map(n))) await writeTeam(request,token,code,legs,{keptWarnings:legs});
  await tickTeam(request,token,code,1);await tickTeam(request,token,code,2);
  await writeTeamOrder(request,token,code,[1,2]);await takeJob(request,token,code,'times');
  await openRelays(page);await openRaceScreen(page,name,'Boy Cubs');
  await page.getByRole('button',{name:/^Order and Times/}).click();
  const box=page.getByLabel('Place time',{exact:true});
  await box.focus();
  await docksAboveKeyboard(page,box,page.locator('.action-bar'));
});
