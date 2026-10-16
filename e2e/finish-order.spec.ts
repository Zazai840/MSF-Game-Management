import { lookProblems,dragTo,enterWristband,expect,goHome,jobButton,joinDay,pickRace,savedRaceLabel,startDrag,steps,test,type Page } from './fixtures.js';
const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
async function join(page:Page,name:string) {
  await page.goto('/');await joinDay(page,name);
}
/** The finishing order check list and its rows. */
const orderRows=(page:Page)=>page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
const handle=(page:Page,number:number)=>page.getByRole('button',{name:`Drag to move ${number}`,exact:true});
const current=(page:Page)=>steps(page).locator('[aria-current=step]');
/** Checks a race in through the API and returns it. */
async function checkIn(page:Page,runners:number[]) {
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  return (await (await page.request.post('/api/races/check-in',{headers,data:{eventCode:'R4',runners}})).json()).race;
}
/** Opens one race from the Finish order race picker (reached through the trail). */
async function openRace(page:Page,race:{number:number}) {
  await pickRace(page,'Finishing order',new RegExp(`\\(R4\\) · Heat ${race.number}$`));
}

test('two phones check in and record Finish order with missing runner, trail, nonfinishers and correction',async({page,browser},info)=>{
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const n=(number:number)=>number+offset;
  await page.request.post('/api/day/events/R4/rename',{headers,data:{name:'60m'}});
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await join(page,`Start finish ${info.project.name}`);
  await jobButton(page,'Start line').click();await page.getByRole('button',{name:'60m Girl Cubs · R4',exact:true}).click();
  for(const number of [n(2011),n(2012),n(2013),n(2014)]) await enterWristband(page,number);
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();
  const label=await savedRaceLabel(page);
  const context=await browser.newContext({...info.project.use});const finish=await context.newPage();
  await join(finish,`Finish ${info.project.name}`);await jobButton(finish,'Finish order').click();
  await openRace(finish,{number:Number(label.split(' ')[1])});
  await expect(finish.getByRole('heading',{name:'Who came 1st?',exact:true})).toBeVisible();
  // The trail replaces the separate Home and Other race buttons.
  await expect(current(finish)).toHaveText(`60m Girl Cubs ${label}`);
  await expect(finish.getByRole('button',{name:'Other race',exact:true})).toHaveCount(0);
  expect(await lookProblems(finish)).toEqual([]);await finish.screenshot({path:info.outputPath('finish-order-question.png'),fullPage:true});
  await finish.getByRole('button',{name:String(n(2012)),exact:true}).click();
  // The places trail stays, for jumping back to a place.
  await finish.getByRole('button',{name:`1st: ${n(2012)}`,exact:true}).click();
  await expect(finish.getByRole('heading',{name:'Who came 1st?',exact:true})).toBeVisible();
  await finish.getByRole('button',{name:String(n(2011)),exact:true}).click();
  // A runner not on the list goes in through the phone's own number pad, with check-in's warnings.
  await finish.getByRole('button',{name:'+ Runner not on the list',exact:true}).click();
  await expect(finish.getByRole('heading',{name:'Runner not on the list: wristband number?',exact:true})).toBeVisible();
  await expect(current(finish)).toHaveText('Runner not on the list');
  const input=finish.getByLabel('Wristband number',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');await expect(input).toBeFocused();
  await enterWristband(finish,n(2011));
  const warning=finish.getByRole('alert');
  await expect(warning).toContainText(`${n(2011)} is already in this race. Check the wristband.`);
  await expect(warning.getByRole('button',{name:'Keep',exact:true})).toHaveCount(0);
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toBeFocused();await expect(input).toHaveValue('');
  await enterWristband(finish,0);
  await expect(warning).toContainText('0 is not a wristband number. Wristbands are 1 to 4999.');
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await input.pressSequentially('3045');await input.press('Enter');
  await expect(warning).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  await finish.screenshot({path:info.outputPath('finish-order-add-warning.png'),fullPage:true});
  await warning.getByRole('button',{name:'Keep',exact:true}).click();await finish.getByRole('button',{name:'3045',exact:true}).click();
  await finish.getByRole('button',{name:String(n(2012)),exact:true}).click();await finish.getByRole('button',{name:'Nobody else crossed the line',exact:true}).click();
  await expect(finish.getByRole('heading',{name:`${n(2013)} has no place. What happened?`,exact:true})).toBeVisible();
  await finish.getByRole('button',{name:'Did not finish',exact:true}).click();await finish.getByRole('button',{name:"Didn't run",exact:true}).click();
  await expect(finish.getByRole('heading',{name:'Check the order',exact:true})).toBeVisible();
  await expect(finish.getByText('Wrong place? Drag the handle on the right to move a runner.',{exact:true})).toBeVisible();
  await expect(current(finish)).toHaveText('Check');
  // Tapping the race name opens the race picker, as on check-in and Times; carrying on keeps the order.
  await steps(finish).getByRole('button',{name:`60m Girl Cubs ${label}`,exact:true}).click();
  await expect(finish.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
  await finish.getByRole('button',{name:`Carry on with 60m Girl Cubs ${label}`,exact:true}).click();
  await expect(finish.getByRole('heading',{name:'Check the order',exact:true})).toBeVisible();
  await expect(finish.getByRole('button',{name:'+ Runner not on the list',exact:true})).toBeVisible();
  await expect(orderRows(finish)).toHaveText([`1st${n(2011)}`,'2nd3045Added at the finish',`3rd${n(2012)}`]);
  await dragTo(finish,handle(finish,3045),orderRows(finish).first());
  await expect(orderRows(finish).first()).toContainText('3045');
  await expect(orderRows(finish)).toHaveText(['1st3045Added at the finish',`2nd${n(2011)}`,`3rd${n(2012)}`]);
  expect(await lookProblems(finish)).toEqual([]);await finish.screenshot({path:info.outputPath('finish-order-review.png'),fullPage:true});
  await finish.route('**/api/races/*/finish',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary connection problem'})}));
  await finish.getByRole('button',{name:'Save',exact:true}).click();await expect(finish.getByText('Not saved - tap Save again',{exact:true})).toBeVisible();
  await finish.screenshot({path:info.outputPath('finish-order-not-saved.png'),fullPage:true});
  await finish.reload();await jobButton(finish,'Finish order').click();
  await expect(finish.getByRole('heading',{name:'Check the order',exact:true})).toBeVisible();
  await expect(orderRows(finish).first()).toContainText('3045');
  await finish.unroute('**/api/races/*/finish');await finish.getByRole('button',{name:'Save',exact:true}).click();
  // The saved confirmation follows Save.
  expect(await savedRaceLabel(finish)).toBe(label);
  await expect(finish.getByTestId('saved-race')).toHaveText(`60m Girl Cubs · ${label} · 1st: 3045`);
  await expect(finish.getByRole('button',{name:'Next race',exact:true})).toBeVisible();
  await finish.screenshot({path:info.outputPath('finish-order-saved.png'),fullPage:true});
  await goHome(finish);await jobButton(finish,'Finish order').click();
  await openRace(finish,{number:Number(label.split(' ')[1])});
  await expect(finish.getByRole('heading',{name:'Check the order',exact:true})).toBeVisible();
  await expect(orderRows(finish).first()).toContainText('3045');
  await dragTo(finish,handle(finish,n(2011)),orderRows(finish).first());
  await expect(orderRows(finish)).toHaveText([`1st${n(2011)}`,'2nd3045Added at the finish',`3rd${n(2012)}`]);
  await finish.getByRole('button',{name:'Save',exact:true}).click();
  await expect(finish.getByTestId('saved-race')).toHaveText(`60m Girl Cubs · ${label} · 1st: ${n(2011)}`);
  await finish.getByRole('main').getByRole('button',{name:'Home',exact:true}).click();
  await expect(jobButton(finish,'Finish order')).toBeVisible();await expect(jobButton(finish,'Finish order')).not.toContainText('ready');
  await context.close();
});

test('dragging the handle reorders the finishing order with live places, and Save sends exactly that order',async({page},info)=>{
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const [a,b,c,d]=[2301,2302,2303,2304].map(number=>number+offset);
  const race=await checkIn(page,[a,b,c,d]);
  const next=await checkIn(page,[2351+offset]);
  await join(page,`Drag finish ${info.project.name}`);await jobButton(page,'Finish order').click();
  await openRace(page,race);
  for(const number of [a,b,c,d]) await page.getByRole('button',{name:String(number),exact:true}).click();
  await page.getByRole('button',{name:'Check the order',exact:true}).click();
  await expect(orderRows(page)).toHaveText([`1st${a}`,`2nd${b}`,`3rd${c}`,`4th${d}`]);
  await expect(handle(page,a)).toBeVisible();
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
  await expect(orderRows(page).filter({hasText:String(c)})).toContainText('4th');
  await page.screenshot({path:info.outputPath('finish-order-dragging.png')});
  await drag.drop();
  await expect(orderRows(page)).toHaveText([`1st${d}`,`2nd${a}`,`3rd${b}`,`4th${c}`]);
  await expect(orderRows(page).filter({hasText:String(d)})).not.toHaveAttribute('data-dragging','true');
  const saving=page.waitForRequest(request=>request.url().endsWith(`/api/races/${race.id}/finish`) && request.method()==='POST');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  expect((await saving).postDataJSON()).toMatchObject({order:[d,a,b,c],didNotFinish:[],didNotRun:[],added:[]});
  await expect(page.getByTestId('saved-race')).toHaveText(new RegExp(`· Heat ${race.number} · 1st: ${d}$`));
  // Next race goes straight on to a race still waiting for its finishing order.
  await page.getByRole('button',{name:'Next race',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Who came 1st?',exact:true})).toBeVisible();
  await expect(current(page)).not.toHaveText('Saved');
  await page.request.post(`/api/races/${next.id}/delete`,{headers,data:{permanent:true}});
});

test('dragging near the edge of the screen scrolls the finishing order',async({page},info)=>{
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*20;
  const runners=Array.from({length:14},(_,index)=>2401+offset+index);
  const race=await checkIn(page,runners);
  await join(page,`Scroll finish ${info.project.name}`);await jobButton(page,'Finish order').click();
  await openRace(page,race);
  for(const number of runners) await page.getByRole('button',{name:String(number),exact:true}).click();
  await page.getByRole('button',{name:'Check the order',exact:true}).click();
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
  await page.request.post(`/api/races/${race.id}/delete`,{headers,data:{permanent:true}});
});

test('Finish order preserves its draft versions while polling and reload expose a changed runner list',async({page},info)=>{
  const checked=await page.request.post('/api/races/check-in',{headers,data:{eventCode:'R4',runners:[2101,2102]}});
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const race=(await checked.json()).race;
  await join(page,`Draft finish ${info.project.name}`);await jobButton(page,'Finish order').click();
  await openRace(page,race);
  await page.getByRole('button',{name:'2102',exact:true}).click();await page.getByRole('button',{name:'2101',exact:true}).click();
  await page.getByRole('button',{name:'Check the order',exact:true}).click();
  await page.request.post(`/api/races/${race.id}/runners`,{headers,data:{baseVersion:1,runners:[2101,2102,2103]}});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.reload();await jobButton(page,'Finish order').click();
  await expect(orderRows(page).first()).toContainText('2102');
  await expect(orderRows(page)).toHaveCount(2);
  const saving=page.waitForRequest(request=>request.url().endsWith(`/api/races/${race.id}/finish`) && request.method()==='POST');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  expect((await saving).postDataJSON()).toMatchObject({baseVersion:0,runnersVersion:1,order:[2102,2101]});
  await expect(page.getByText('Two versions - zone lead to check',{exact:true})).toBeVisible();
  const retained=await (await page.request.get(`/api/lead/races/${race.id}`,{headers})).json();
  expect(retained.clashes.find((clash:any)=>clash.part==='finish').candidates.some((candidate:any)=>candidate.value?.order[0]===race.parts.runners.value[1].id)).toBe(true);
  await goHome(page);await jobButton(page,'Finish order').click();
  await openRace(page,race);
  for(const number of [2101,2102,2103]) await page.getByRole('button',{name:String(number),exact:true}).click();
  await page.getByRole('button',{name:'Check the order',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Two versions - zone lead to check',{exact:true})).toBeVisible();
  const latest=await (await page.request.get(`/api/lead/races/${race.id}`,{headers})).json();
  const chosen=latest.clashes.find((clash:any)=>clash.part==='finish').candidates.at(-1);
  await page.request.post(`/api/lead/races/${race.id}/clashes/finish`,{headers,data:{candidateId:chosen.id}});
});

test('on a narrow phone a long race name still leaves a step to go back along the trail',async({page},info)=>{
  const code=`L49${info.project.name.toUpperCase()}`,name=`Under 11s obstacle sprint ${info.project.name}`;
  await page.request.post('/api/day/events',{headers,data:{code,name,section:'Girl Cubs',format:'heats'}});
  await page.request.post('/api/day/confirm-events',{headers,data:{}});
  const race=(await (await page.request.post('/api/races/check-in',{headers,data:{eventCode:code,runners:[2501,2502]}})).json()).race;
  await join(page,`Long name ${info.project.name}`);await jobButton(page,'Finish order').click();
  await pickRace(page,'Finishing order',new RegExp(`\\(${code}\\) · Heat ${race.number}$`));
  await expect(current(page)).toHaveText(`${name} Girl Cubs Heat ${race.number}`);
  await expect(page.getByRole('heading',{name:'Who came 1st?',exact:true})).toBeVisible();
  const back=steps(page).getByRole('button',{name:'Finishing order',exact:true});
  await expect(back).toBeInViewport();
  await page.screenshot({path:info.outputPath('finish-order-long-name.png')});
  await back.click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
  await page.request.post(`/api/races/${race.id}/delete`,{headers,data:{permanent:true}});
});
