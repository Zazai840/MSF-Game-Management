import {ownCode,deleteCurrentRace,dragTo,expect,flowRace,live,lookProblems,openRace,ownEvent,selected,signInThroughApi,startDrag,test,writeCheckIn,type Page} from './fixtures.js';
import { isRunner } from '../src/shared/races.js';
const places=(page:Page)=>page.getByRole('list',{name:/^Places: /});
const runnerButtons=(page:Page)=>page.getByRole('list',{name:'Runners not yet placed'}).getByRole('button');
const orderRows=(page:Page)=>page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
const handle=(page:Page,number:number)=>page.getByRole('button',{name:`Move ${number}`,exact:true});
/** A new Heat 1 of the event, made through the API as that phone. */
const newHeat=(page:Page,token:string,code:string)=>page.request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}});

test('two phones: the start line checks in, the finish line places them live, with a runner not on the list, nonfinishers and a drag',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Finish sprint ${project}`;
  await ownEvent(request,code,name);
  const start=await openPhone(`Start finish ${project}`),finish=await openPhone(`Finish ${project}`,{job:'finish'});
  await newHeat(start.page,start.token,code);
  await openRace(start.page,name);await openRace(finish.page,name);
  await expect(finish.page.getByRole('heading',{level:2,name:'Nobody is checked in yet'})).toBeVisible();
  const input=start.page.getByLabel('Wristband number',{exact:true});
  for(const number of [2011,2012,2013,2014]) {await expect(input).toBeEditable();await input.fill(String(number));await input.press('Enter');}
  // The finish line's runner buttons fill in live, in check-in order, one slot per runner.
  await expect(runnerButtons(finish.page)).toHaveText(['2011','2012','2013','2014'],live);
  await expect(places(finish.page)).toHaveAccessibleName('Places: 0 of 4 recorded');
  await expect(finish.page.getByRole('heading',{level:2,name:'Who came 1st?'})).toBeVisible();
  expect(await lookProblems(finish.page)).toEqual([]);await finish.page.screenshot({path:info.outputPath('finish-line.png'),fullPage:true});
  await finish.page.getByRole('button',{name:'2011 came 1st',exact:true}).click();
  await expect(finish.page.getByRole('heading',{level:2,name:'Who came 2nd?'})).toBeVisible();
  // A runner not on the list goes in through the phone's own number pad, with check-in's warnings.
  await finish.page.getByRole('button',{name:'+ Runner not on the list',exact:true}).click();
  await expect(finish.page.getByRole('heading',{level:2,name:'Runner not on the list: wristband number?'})).toBeVisible();
  const added=finish.page.getByLabel('Wristband number',{exact:true});
  await expect(added).toHaveAttribute('inputmode','numeric');await expect(added).toBeFocused();
  await added.fill('2011');await finish.page.getByRole('button',{name:'Add runner',exact:true}).click();
  const warning=finish.page.getByRole('alert');
  await expect(warning).toContainText('2011 is already in this race. Check the wristband.');
  await expect(warning.getByRole('button',{name:'Keep',exact:true})).toHaveCount(0);
  // Fix number keeps the number, selected, so typing replaces it.
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(added).toBeFocused();await expect(added).toHaveValue('2011');
  await expect.poll(()=>selected(finish.page,'Wristband number')).toBe('2011');
  await added.pressSequentially('3045');await added.press('Enter');
  await expect(warning).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  // Tapping the box does the same, and Enter checks it again.
  await added.click();
  await expect(warning).toHaveCount(0);
  await expect(added).toBeFocused();await expect(added).toHaveValue('3045');
  await expect.poll(()=>selected(finish.page,'Wristband number')).toBe('3045');
  await added.press('Enter');
  await expect(warning).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  await finish.page.screenshot({path:info.outputPath('finish-line-add-warning.png'),fullPage:true});
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  // Back to placing: the added runner has a button and a slot of its own.
  await expect(places(finish.page)).toHaveAccessibleName('Places: 1 of 5 recorded');
  await finish.page.getByRole('button',{name:'3045 came 2nd',exact:true}).click();
  await finish.page.getByRole('button',{name:'2012 came 3rd',exact:true}).click();
  // A placed slot can be tapped to fill it again: the runner it held goes back to the buttons.
  await finish.page.getByRole('button',{name:'3rd place: 2012. Change',exact:true}).click();
  await expect(finish.page.getByRole('heading',{level:2,name:'Who came 3rd?'})).toBeVisible();
  await finish.page.getByRole('button',{name:'2013 came 3rd',exact:true}).click();
  await expect(finish.page.getByRole('button',{name:'3rd place: 2013. Change',exact:true})).toBeVisible();
  await expect(runnerButtons(finish.page)).toHaveText(['2012','2014']);
  await finish.page.getByRole('button',{name:'Nobody else crossed the line',exact:true}).click();
  await expect(finish.page.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await expect(orderRows(finish.page)).toHaveText(['1st2011','2nd3045','3rd2013']);
  // Each runner left is Did not finish, until tapped to say Didn't run.
  const notPlaced=finish.page.getByRole('list',{name:'Not placed'}).getByRole('button');
  await expect(notPlaced).toHaveCount(2);
  await expect(notPlaced.first()).toHaveAccessibleName('2012, did not finish. Change');await expect(notPlaced.last()).toHaveAccessibleName('2014, did not finish. Change');
  await finish.page.getByRole('button',{name:'2014, did not finish. Change',exact:true}).click();
  await expect(finish.page.getByRole('button',{name:"2014, didn't run. Change",exact:true})).toBeVisible();
  // Dragging the handle moves the wristband.
  await dragTo(finish.page,handle(finish.page,3045),orderRows(finish.page).first());
  await expect(orderRows(finish.page)).toHaveText(['1st3045','2nd2011','3rd2013']);
  expect(await lookProblems(finish.page)).toEqual([]);await finish.page.screenshot({path:info.outputPath('check-the-order.png'),fullPage:true});
  await finish.page.getByRole('button',{name:'Save positions',exact:true}).click();
  await expect(finish.page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await expect(finish.page.locator('.rz-toast')).toContainText('Positions saved · Girl Cubs Heat 1');
  // Didn't run takes 2014 off the race, and the runner added at the finish is in it: the start line can't type 3045 again.
  const chips=start.page.getByRole('list',{name:'Wristbands entered'}).getByRole('button');
  await expect(chips).toHaveText(['2011','2012','2013','3045'],live);
  await expect(input).toBeEditable();await input.fill('3045');await input.press('Enter');
  await expect(start.page.getByRole('alert')).toContainText('3045 is already in this race. Check the wristband.');
  await expect(start.page.getByRole('tab',{name:/^Positions/})).toContainText('Positions4 of 4',live);
  await deleteCurrentRace(request,code);
});

test('the last runner placed goes straight to Check the order, where the handle and the arrow keys move rows and the order sent is exactly that',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Drag sprint ${project}`;
  const [a,b,c,d]=[2301,2302,2303,2304];
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Drag finish ${project}`,{job:'finish'});
  await writeCheckIn(request,await signInThroughApi(request,`Drag start ${project}`),code,[a,b,c,d]);
  const {race}=(await flowRace(request,token,code))!;
  await openRace(page,name);
  for(const [number,place] of [[a,'1st'],[b,'2nd'],[c,'3rd'],[d,'4th']] as const) await page.getByRole('button',{name:`${number} came ${place}`,exact:true}).click();
  await expect(page.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await expect(orderRows(page)).toHaveText([`1st${a}`,`2nd${b}`,`3rd${c}`,`4th${d}`]);
  await expect(page.getByRole('list',{name:'Not placed'})).toHaveCount(0);
  await expect(page.getByText('Everyone has a place.',{exact:true})).toBeVisible();
  // Dragging anywhere but the handle never moves a runner.
  await dragTo(page,orderRows(page).first().getByText(String(a),{exact:true}),orderRows(page).last());
  await expect(orderRows(page)).toHaveText([`1st${a}`,`2nd${b}`,`3rd${c}`,`4th${d}`]);
  // While dragging, the row lifts and the places update live.
  const drag=await startDrag(page,handle(page,d));
  await drag.over(orderRows(page).first());
  const lifted=orderRows(page).filter({hasText:String(d)});
  await expect(lifted).toHaveAttribute('data-dragging','true');
  await expect(lifted).toContainText('1st');
  await expect(orderRows(page).filter({hasText:String(a)})).toContainText('2nd');
  await page.screenshot({path:info.outputPath('dragging.png')});
  const id=(wristband:number)=>race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
  const saving=page.waitForRequest(request=>request.url().endsWith(`/api/races/${race.id}/order`) && request.method()==='POST');
  await drag.drop();
  await expect(orderRows(page)).toHaveText([`1st${d}`,`2nd${a}`,`3rd${b}`,`4th${c}`]);
  expect((await saving).postDataJSON()).toMatchObject({order:[d,a,b,c].map(id),didNotFinish:[],didNotRun:[],added:[]});
  // The arrow keys on a handle move its row one place at once.
  await handle(page,c).focus();await page.keyboard.press('ArrowUp');
  await expect(orderRows(page)).toHaveText([`1st${d}`,`2nd${a}`,`3rd${c}`,`4th${b}`]);
  // The order is saved as it changes: the race opened again shows it, straight on Check the order.
  await page.reload();
  await expect(page.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await expect(orderRows(page)).toHaveText([`1st${d}`,`2nd${a}`,`3rd${c}`,`4th${b}`]);
  await deleteCurrentRace(request,code);
});

test('a 12-runner heat is fully placed on one phone screen with no sideways scroll, and dragging near the edge scrolls the order',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Scroll sprint ${project}`;
  const runners=Array.from({length:12},(_,index)=>2401+index);
  await ownEvent(request,code,name);
  const {page}=await openPhone(`Scroll finish ${project}`,{job:'finish'});
  await writeCheckIn(request,await signInThroughApi(request,`Scroll start ${project}`),code,runners);
  await openRace(page,name);
  const noSideways=()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth);
  await expect(runnerButtons(page)).toHaveCount(12);
  expect(await noSideways()).toBe(true);
  await page.screenshot({path:info.outputPath('twelve-runners.png')});
  // A heat of more than 9 has smaller runner buttons, so every slot and every button fits above the footer without scrolling.
  const footer=(await page.locator('.rz-footer').boundingBox())!,last=(await runnerButtons(page).last().boundingBox())!;
  expect(last.y+last.height).toBeLessThanOrEqual(footer.y);
  expect(last.height).toBeGreaterThanOrEqual(44);
  expect(await lookProblems(page)).toEqual([]);
  for(const [index,number] of runners.entries()) await page.getByRole('button',{name:new RegExp(`^${number} came ${index+1}(st|nd|rd|th)$`)}).click();
  await expect(page.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await expect(orderRows(page)).toHaveCount(12);
  expect(await noSideways()).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  const viewport=page.viewportSize()!;
  const drag=await startDrag(page,handle(page,runners[0]));
  const from=(await handle(page,runners[0]).boundingBox())!;
  await drag.toPoint(from.x+from.width/2,viewport.height-12,20);
  await expect.poll(()=>page.evaluate(()=>Math.max(window.scrollY,document.querySelector('.rz-main')?.scrollTop??0))).toBeGreaterThan(50);
  await drag.drop();
  await expect(orderRows(page).first()).not.toContainText(String(runners[0]));
  await deleteCurrentRace(request,code);
});

test('quick taps on a slow link: taps made while a write is on its way show at once and go in one next write, the latest winning',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Finish queue ${project}`;
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Finish queue ${project}`,{job:'finish'});
  await writeCheckIn(request,token,code,[2031,2032,2033,2034]);
  await openRace(page,name);
  // The first write is held on its way until the other two taps are made.
  const sent:Array<{order:string[];version:number}>=[];
  let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/races/*/order',async route=>{sent.push(route.request().postDataJSON());if(sent.length===1) await held;await route.continue();});
  for(const [number,place] of [[2031,'1st'],[2032,'2nd'],[2033,'3rd']] as const) await page.getByRole('button',{name:`${number} came ${place}`,exact:true}).click();
  await expect(places(page)).toHaveAccessibleName('Places: 3 of 4 recorded');
  expect(sent).toHaveLength(1);
  release();
  await expect.poll(async()=>(await flowRace(request,token,code))!.race.parts.finish.value?.order.length).toBe(3);
  // One more write carries both later taps, at the version the first one was answered with.
  expect(sent).toHaveLength(2);
  expect(sent[0].order).toHaveLength(1);expect(sent[1].order).toHaveLength(3);
  expect(sent[1].version).toBe(sent[0].version+1);
  await expect(page.getByRole('heading',{level:2,name:'Who came 4th?'})).toBeVisible();
  await deleteCurrentRace(request,code);
});
