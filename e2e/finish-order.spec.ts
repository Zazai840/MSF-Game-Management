import { lookProblems,deleteCurrentRace,dragTo,enterWristband,expect,live,openRaceScreen,ownEvent,readRaceScreen,signInThroughApi,startDrag,takeJob,test,writeCheckIn,writeOrder,writeTimes,type Page } from './fixtures.js';
import { isRunner } from '../src/shared/races.js';
/** The finishing order being dragged, and its rows. */
const orderRows=(page:Page)=>page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
const handle=(page:Page,number:number)=>page.getByRole('button',{name:`Drag to move ${number}`,exact:true});
const orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
const tableRows=(page:Page)=>page.getByRole('table',{name:'Order and times'}).getByRole('row');
/** On the race screen with the order already this phone's: its card open, the order ready to drag. */
async function changeTheOrder(page:Page,name:string) {
  await openRaceScreen(page,name);await orderCard(page).click();
  await page.getByRole('button',{name:'Change the order',exact:true}).click();
}

test('two phones: check-in on one, the order on the other, with a runner not on the list, nonfinishers and a drag',async({openPhone,request},info)=>{
  const project=info.project.name,code=`FO-${project.toUpperCase()}`,name=`Finish sprint ${project}`;
  await ownEvent(request,code,name);
  const start=(await openPhone(`Start finish ${project}`)).page,finish=(await openPhone(`Finish ${project}`)).page;
  await openRaceScreen(start,name);await start.getByRole('button',{name:/^Check-in Wristbands/}).click();
  for(const number of [2011,2012,2013,2014]) await enterWristband(start,number);
  const checkedIn=start.getByRole('list',{name:'Checked in'}).getByRole('listitem');
  await expect(checkedIn).toHaveText(['2011','2012','2013','2014']);
  await openRaceScreen(finish,name);await orderCard(finish).click();
  await finish.getByRole('button',{name:'Do the order',exact:true}).click();
  await expect(finish.getByRole('heading',{name:'Who came 1st?',exact:true})).toBeVisible();
  expect(await lookProblems(finish)).toEqual([]);await finish.screenshot({path:info.outputPath('finish-order-question.png'),fullPage:true});
  await finish.getByRole('button',{name:'2011',exact:true}).click();
  // A runner not on the list goes in through the phone's own number pad, with check-in's warnings.
  await finish.getByRole('button',{name:'Add runner',exact:true}).click();
  const label='Runner not on the list: wristband number',input=finish.getByLabel(label,{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).toBeFocused();
  await enterWristband(finish,2011,label);
  const warning=finish.getByRole('alert');
  await expect(warning).toContainText('2011 is already in this race. Check the wristband.');
  await expect(warning.getByRole('button',{name:'Keep',exact:true})).toHaveCount(0);
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toBeFocused();await expect(input).toHaveValue('');
  await enterWristband(finish,0,label);
  await expect(warning).toContainText('0 is not a wristband number. Wristbands are 1 to 4999.');
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await input.pressSequentially('3045');await input.press('Enter');
  await expect(warning).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  await finish.screenshot({path:info.outputPath('finish-order-add-warning.png'),fullPage:true});
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  await finish.getByRole('button',{name:'3045',exact:true}).click();await finish.getByRole('button',{name:'2012',exact:true}).click();
  await finish.getByRole('button',{name:'Nobody else crossed the line',exact:true}).click();
  await expect(finish.getByRole('heading',{name:'2013 has no place. What happened?',exact:true})).toBeVisible();
  await finish.getByRole('button',{name:'Did not finish',exact:true}).click();
  await expect(finish.getByRole('heading',{name:'2014 has no place. What happened?',exact:true})).toBeVisible();
  await finish.getByRole('button',{name:"Didn't run",exact:true}).click();
  await expect(finish.getByText('Everyone has a place',{exact:true})).toBeVisible();
  await expect(tableRows(finish)).toHaveText([/^Place/,/^1st\s*2011\s*$/,/^2nd\s*3045At finish\s*$/,/^3rd\s*2012\s*$/]);
  await expect(finish.getByRole('list',{name:'No place'})).toHaveText(['2013Did not finishGive a place']);
  // Didn't run takes 2014 off the race, and the runner added at the finish is in it: check-in can't type 3045 again.
  await expect(checkedIn).toHaveText(['2011','2012','2013','3045'],live);
  await enterWristband(start,3045);
  await expect(start.getByRole('alert')).toContainText('3045 is already in this race. Check the wristband.');
  // Dragging moves the wristband; the other phone shows the new order live.
  await finish.getByRole('button',{name:'Change the order',exact:true}).click();
  await expect(finish.getByText('Drag a wristband to its place: times stay by place.',{exact:true})).toBeVisible();
  await expect(orderRows(finish)).toHaveText(['1st2011','2nd3045At finish','3rd2012']);
  await dragTo(finish,handle(finish,3045),orderRows(finish).first());
  await expect(orderRows(finish)).toHaveText(['1st3045At finish','2nd2011','3rd2012']);
  expect(await lookProblems(finish)).toEqual([]);await finish.screenshot({path:info.outputPath('finish-order-review.png'),fullPage:true});
  await finish.getByRole('button',{name:'Done',exact:true}).click();
  await start.getByRole('button',{name:/^Order and Times/}).click();
  await expect(tableRows(start)).toHaveText([/^Place/,/^1st\s*3045/,/^2nd\s*2011/,/^3rd\s*2012/],live);
  await deleteCurrentRace(request,code);
});

test('dragging the handle reorders the finishing order with live places while times stay by place, and sends exactly that order',async({openPhone,request},info)=>{
  const project=info.project.name,code=`FD-${project.toUpperCase()}`,name=`Drag sprint ${project}`;
  const [a,b,c,d]=[2301,2302,2303,2304];
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Drag finish ${project}`);
  await writeCheckIn(request,await signInThroughApi(request,`Drag start ${project}`),code,[a,b,c,d]);
  const {race}=await writeOrder(request,token,code,[a,b,c,d]);
  await writeTimes(request,await signInThroughApi(request,`Drag timer ${project}`),code,[1234,1301]);
  await changeTheOrder(page,name);
  await expect(orderRows(page)).toHaveText([`1st12.34${a}`,`2nd13.01${b}`,`3rd${c}`,`4th${d}`]);
  await expect(handle(page,a)).toBeVisible();
  // Dragging anywhere but the handle never moves a runner.
  await dragTo(page,orderRows(page).first().getByText(String(a),{exact:true}),orderRows(page).last());
  await expect(orderRows(page)).toHaveText([`1st12.34${a}`,`2nd13.01${b}`,`3rd${c}`,`4th${d}`]);
  // While dragging, the row lifts and the places update live, each with its place's time.
  const drag=await startDrag(page,handle(page,d));
  await drag.over(orderRows(page).first());
  const lifted=orderRows(page).filter({hasText:String(d)});
  await expect(lifted).toHaveAttribute('data-dragging','true');
  await expect(lifted).toContainText('1st12.34');
  await expect(orderRows(page).filter({hasText:String(a)})).toContainText('2nd13.01');
  await expect(orderRows(page).filter({hasText:String(c)})).toContainText('4th');
  await page.screenshot({path:info.outputPath('finish-order-dragging.png')});
  const saving=page.waitForRequest(request=>request.url().endsWith(`/api/race-screen/${code}/order`) && request.method()==='POST');
  await drag.drop();
  await expect(orderRows(page)).toHaveText([`1st12.34${d}`,`2nd13.01${a}`,`3rd${b}`,`4th${c}`]);
  await expect(orderRows(page).filter({hasText:String(d)})).not.toHaveAttribute('data-dragging','true');
  const id=(wristband:number)=>race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
  expect((await saving).postDataJSON()).toMatchObject({order:[d,a,b,c].map(id),didNotFinish:[],didNotRun:[],added:[]});
  // The times stay by place: the table pairs them with the new order.
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(tableRows(page)).toHaveText([/^Place/,new RegExp(`^1st\\s*${d}\\s*12\\.34$`),new RegExp(`^2nd\\s*${a}\\s*13\\.01$`),new RegExp(`^3rd\\s*${b}\\s*$`),new RegExp(`^4th\\s*${c}\\s*$`)]);
  await page.reload();await changeTheOrder(page,name);
  await expect(orderRows(page)).toHaveText([`1st12.34${d}`,`2nd13.01${a}`,`3rd${b}`,`4th${c}`]);
  await deleteCurrentRace(request,code);
});

test('dragging near the edge of the screen scrolls the finishing order',async({openPhone,request},info)=>{
  const project=info.project.name,code=`FS-${project.toUpperCase()}`,name=`Scroll sprint ${project}`;
  const runners=Array.from({length:14},(_,index)=>2401+index);
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Scroll finish ${project}`);
  await writeCheckIn(request,await signInThroughApi(request,`Scroll start ${project}`),code,runners);
  await writeOrder(request,token,code,runners);
  await changeTheOrder(page,name);
  await expect(orderRows(page)).toHaveCount(14);
  await page.evaluate(()=>window.scrollTo(0,0));
  const viewport=page.viewportSize()!;
  const drag=await startDrag(page,handle(page,runners[0]));
  const start=(await handle(page,runners[0]).boundingBox())!;
  await drag.toPoint(start.x+start.width/2,viewport.height-12,20);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);
  await expect(orderRows(page).filter({hasText:String(runners[0])})).not.toContainText(/^1st/);
  await drag.drop();
  await expect(orderRows(page).first()).not.toContainText(String(runners[0]));
  await deleteCurrentRace(request,code);
});

test('quick taps on a slow link: taps made while a write is on its way show at once and go in one next write, the latest winning',async({openPhone,request},info)=>{
  const project=info.project.name,code=`FQ-${project.toUpperCase()}`,name=`Finish queue ${project}`;
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Finish queue ${project}`);
  await writeCheckIn(request,token,code,[2031,2032,2033]);await takeJob(request,token,code,'order');
  await openRaceScreen(page,name);await orderCard(page).click();
  // The first write is held on its way until the other two taps are made.
  const sent:Array<{order:string[];version:number}>=[];
  let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/race-screen/*/order',async route=>{sent.push(route.request().postDataJSON());if(sent.length===1) await held;await route.continue();});
  for(const number of [2031,2032,2033]) await page.getByRole('button',{name:String(number),exact:true}).click();
  await expect(tableRows(page)).toHaveText([/^Place/,/^1st\s*2031/,/^2nd\s*2032/,/^3rd\s*2033/]);
  expect(sent).toHaveLength(1);
  release();
  await expect.poll(async()=>(await readRaceScreen(request,token,code)).race.parts.finish.value?.order.length).toBe(3);
  // One more write carries both later taps, at the version the first one was answered with.
  expect(sent).toHaveLength(2);
  expect(sent[0].order).toHaveLength(1);expect(sent[1].order).toHaveLength(3);
  expect(sent[1].version).toBe(sent[0].version+1);
  await expect(tableRows(page)).toHaveText([/^Place/,/^1st\s*2031/,/^2nd\s*2032/,/^3rd\s*2033/]);
  await deleteCurrentRace(request,code);
});
