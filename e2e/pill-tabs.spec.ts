import {cellAt,cellOn,cellSlid,cellThen,cellTrace,expect,lookProblems,ownCode,ownEvent,ownName,ownWristbands,press,recordRace,test,watchCell,type Locator,type Page} from './fixtures.js';
// The pill tabs: the event type tabs on Races and the event tabs on an event in Results. One navy cell behind the
// buttons marks the current tab and slides to it; the page watches it on every frame (fixtures, watchCell).
const owner={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
const types=(page:Page)=>page.getByRole('navigation',{name:'Event type',exact:true});
const eventTabs=(page:Page)=>page.getByRole('navigation',{name:'Event',exact:true});
const tab=(tabs:Locator,name:string)=>tabs.getByRole('button',{name,exact:true});
const colour=(of:Locator)=>of.evaluate(el=>getComputedStyle(el).color);
/** A press on a tab of these tabs: it is the current tab at once. */
async function open(tabs:Locator,name:string) {await press(tab(tabs,name));await expect(tab(tabs,name)).toHaveAttribute('aria-current','page');}
/** The cell is decoration behind the buttons, and it moves by a transition on its transform: 200ms, fast start, soft stop. The words change colour with it, and a tab still shrinks while pressed. */
async function cellMoves(tabs:Locator,other:string) {
  const cell=tabs.locator('.rz-tab-cell');
  await expect(cell).toHaveCount(1);
  await expect(cell).toHaveAttribute('aria-hidden','true');
  await expect(cell).toHaveCSS('transition-property','transform');
  await expect(cell).toHaveCSS('transition-duration','0.2s');
  await expect(cell).toHaveCSS('transition-timing-function','cubic-bezier(0.23, 1, 0.32, 1)');
  expect(await tab(tabs,other).evaluate(el=>{const style=getComputedStyle(el);return Object.fromEntries(style.transitionProperty.split(', ').map((property,index)=>[property,style.transitionDuration.split(', ')[index]]));})).toEqual({scale:'0.14s',color:'0.2s'});
}
/** A lead on an event in Results, the page watching the event tabs' cell from its first frame. */
async function onEvent(openPhone:(name:string,options?:{lead?:boolean})=>Promise<{page:Page}>,lead:string,code:string) {
  const {page}=await openPhone(ownName(lead),{lead:true});
  await page.addInitScript(watchCell,'Event');await page.goto(`/results/${code}`);
  await cellOn(eventTabs(page),'Heats');
  return page;
}

test('the event type tabs: the navy cell slides between Races and Relays while the list changes at once; with reduced motion it is there at once',async({openPhone})=>{
  const {page}=await openPhone(ownName('Type cell volunteer'));
  await page.addInitScript(watchCell,'Event type');await page.reload();
  const tabs=types(page);
  await expect(page.getByRole('button',{name:'New race',exact:true})).toBeVisible();
  await cellOn(tabs,'Races');
  // The first screen after the app opens: the cell is on the current tab and never moved.
  expect(await cellTrace(page)).toEqual([{tab:'Races',at:0}]);
  await cellMoves(tabs,'Relays');
  // The cell is the navy of the other tab's words; the words on it are the light of the tabs' card.
  const navy=await colour(tab(tabs,'Relays')),light=await colour(tab(tabs,'Races'));
  expect(light).not.toBe(navy);
  await expect(tabs.locator('.rz-tab-cell')).toHaveCSS('background-color',navy);
  expect(await lookProblems(page)).toEqual([]);
  // Relays: its list shows at once, and the cell slides there from Races.
  await open(tabs,'Relays');
  await expect(page.getByRole('button',{name:'New relay',exact:true})).toBeVisible();
  await cellOn(tabs,'Relays');
  cellSlid(await cellTrace(page),0,1,'Relays');
  await expect(tab(tabs,'Relays')).toHaveCSS('color',light);await expect(tab(tabs,'Races')).toHaveCSS('color',navy);
  expect(await lookProblems(page)).toEqual([]);
  // And back.
  await open(tabs,'Races');
  await expect(page.getByRole('button',{name:'New race',exact:true})).toBeVisible();
  await cellOn(tabs,'Races');
  cellSlid(await cellTrace(page),1,0,'Races');
  // Reduced motion: the cell is on the new tab in the first frame of the new list.
  await page.emulateMedia({reducedMotion:'reduce'});
  await open(tabs,'Relays');
  await cellOn(tabs,'Relays');
  expect(await cellTrace(page)).toEqual([{tab:'Races',at:0},{tab:'Relays',at:1}]);
  await expect(tab(tabs,'Relays')).toHaveCSS('color',light);
  expect(await lookProblems(page)).toEqual([]);
});

test('the event tabs, three: the cell slides between Heats, Final and Notes with its tab\'s size and place, and a second tap while it moves sends it straight on from where it is',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Three tabs');
  await ownEvent(request,code,name);
  const page=await onEvent(openPhone,'Three tabs lead',code),tabs=eventTabs(page);
  await expect(tabs.getByRole('button')).toHaveText(['Heats','Final','Notes']);
  // The event's first screen: the cell is on the current tab and never moved.
  expect(await cellTrace(page)).toEqual([{tab:'Heats',at:0}]);
  await cellMoves(tabs,'Final');
  expect(await lookProblems(page)).toEqual([]);
  await open(tabs,'Final');
  await expect(page.getByText("The final's order appears here once its finishing order is saved.",{exact:true})).toBeVisible();
  await cellOn(tabs,'Final');
  cellSlid(await cellTrace(page),0,1,'Final');
  expect(await lookProblems(page)).toEqual([]);
  await open(tabs,'Notes');
  await expect(page.getByText("Notes appear here when a lead changes this event's results.",{exact:true})).toBeVisible();
  await cellOn(tabs,'Notes');
  cellSlid(await cellTrace(page),1,2,'Notes');
  expect(await lookProblems(page)).toEqual([]);
  // A screen of another width (a turned phone): the cell keeps its tab's size and place.
  const size=page.viewportSize()!;
  await page.setViewportSize({width:size.width+200,height:size.height});await cellOn(tabs,'Notes');
  await page.setViewportSize(size);await cellOn(tabs,'Notes');
  // Two tabs away.
  await open(tabs,'Heats');
  await cellOn(tabs,'Heats');
  cellSlid(await cellTrace(page),2,0,'Heats');
  // A slow cell from here on, so each frame is a small step and a jump shows. The page presses Notes when the cell is a fifth of its way to Final.
  await page.addStyleTag({content:'.rz-tab-cell { transition-duration: 3s !important; }'});
  await cellThen(page,'Notes');
  await press(tab(tabs,'Final'));await expect(tab(tabs,'Notes')).toHaveAttribute('aria-current','page');
  await expect.poll(()=>cellAt(page),{timeout:10000}).toBe(2);
  await cellOn(tabs,'Notes');
  const samples=await cellTrace(page),places=samples.map(sample=>sample.at),second=samples.findIndex(sample=>sample.tab==='Notes'),seen=JSON.stringify(samples);
  // At the second tap the cell was between Heats and Final; it goes on from that place, never back and never by a jump to Final.
  expect(places[second-1],seen).toBeGreaterThan(0.2);expect(places[second-1],seen).toBeLessThan(0.6);
  expect(Math.abs(places[second]-places[second-1]),seen).toBeLessThanOrEqual(0.15);
  expect(places,seen).toEqual([...places].sort((a,b)=>a-b));
  expect(places.at(-1),seen).toBe(2);
  expect(await lookProblems(page)).toEqual([]);
});

test('the event tabs, two: the cell slides between Heats and Notes with its tab\'s size and place; with reduced motion it is there at once',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Two tabs');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const page=await onEvent(openPhone,'Two tabs lead',code),tabs=eventTabs(page);
  await expect(tabs.getByRole('button')).toHaveText(['Heats','Notes']);
  expect(await cellTrace(page)).toEqual([{tab:'Heats',at:0}]);
  expect(await lookProblems(page)).toEqual([]);
  const navy=await colour(tab(tabs,'Notes')),light=await colour(tab(tabs,'Heats'));
  await open(tabs,'Notes');
  await expect(page.getByText("Notes appear here when a lead changes this event's results.",{exact:true})).toBeVisible();
  await cellOn(tabs,'Notes');
  cellSlid(await cellTrace(page),0,1,'Notes');
  await expect(tab(tabs,'Notes')).toHaveCSS('color',light);await expect(tab(tabs,'Heats')).toHaveCSS('color',navy);
  expect(await lookProblems(page)).toEqual([]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await open(tabs,'Heats');
  await cellOn(tabs,'Heats');
  expect(await cellTrace(page)).toEqual([{tab:'Notes',at:1},{tab:'Heats',at:0}]);
  await expect(tab(tabs,'Heats')).toHaveCSS('color',light);
  expect(await lookProblems(page)).toEqual([]);
});

test('the event tabs lose and get back the Final tab while the lead is on Notes: the cell stays on Notes and never leaves the tabs',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Tabs change'),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name);
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2)],[1100,1200]);
  const page=await onEvent(openPhone,'Tabs change lead',code),tabs=eventTabs(page);
  await open(tabs,'Notes');await cellOn(tabs,'Notes');
  expect((await cellTrace(page)).at(-1)).toEqual({tab:'Notes',at:2});
  // Another lead decides the results without a final: three tabs become two.
  expect((await request.post(`/api/lead/events/${code}/complete-stage`,{headers:owner,data:{stage:'no-final',comment:'Out of time'}})).ok()).toBe(true);
  await expect(tabs.getByRole('button')).toHaveText(['Heats','Notes'],{timeout:10000});
  await cellOn(tabs,'Notes');
  // Notes is now the second tab, and the cell went there with it in one frame: it was never past the last tab.
  expect(await cellTrace(page)).toEqual([{tab:'Notes',at:2},{tab:'Notes',at:1}]);
  expect(await lookProblems(page)).toEqual([]);
  // The final is wanted again: three tabs, and the cell ends on Notes, the third.
  expect((await request.post(`/api/lead/events/${code}/reopen-stage`,{headers:owner,data:{stage:'no-final',comment:'Time for a final'}})).ok()).toBe(true);
  await expect(tabs.getByRole('button')).toHaveText(['Heats','Final','Notes'],{timeout:10000});
  await cellOn(tabs,'Notes');
  expect(await cellTrace(page)).toEqual([{tab:'Notes',at:1},{tab:'Notes',at:2}]);
  expect(await lookProblems(page)).toEqual([]);
});
