import {ownCode,deleteCurrentRace,expect,lookProblems,nextBeside,openRace,ownEvent,recordRace,selected,submitRace,test,writeOrder,writeTimes,type Page} from './fixtures.js';
const chips=(page:Page)=>page.getByRole('list',{name:'Wristbands entered'}).getByRole('button');
const meta=(page:Page)=>page.locator('.rz-prompt__meta');
test('wristbands go in through the phone keyboard, each saved as it is typed, and the input keeps focus between runners',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Keyboard sprint ${project}`;
  await ownEvent(request,code,name);
  const {page,context,token}=await openPhone(`Keyboard ${project}`);
  await request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}});
  await openRace(page,name);
  await expect(page.getByRole('heading',{level:2,name:'Runner 1: wristband number?'})).toBeVisible();
  const input=page.getByLabel('Wristband number',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');
  await expect(input).toHaveAttribute('pattern','[0-9]*');
  await expect(input).toHaveAttribute('enterkeyhint','next');
  await expect(input).toHaveAttribute('autocomplete','off');
  await expect(input).toBeFocused();
  // Enter with nothing typed does nothing.
  await input.press('Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Android keyboards let through . , - and space: only the digits stay.
  await input.pressSequentially('20.0-1');
  await expect(input).toHaveValue('2001');
  await input.press('Enter');
  await expect(chips(page)).toHaveText(['2001']);
  // The box opens again for the next runner once the number is saved.
  await expect(input).toBeEditable();await expect(input).toHaveValue('');await expect(input).toBeFocused();
  await expect(page.getByRole('heading',{level:2,name:'Runner 2: wristband number?'})).toBeVisible();
  await input.pressSequentially('2002');
  const next=nextBeside(page,'Wristband number');
  await expect(next).toBeInViewport();
  await next.click();
  await expect(chips(page)).toHaveText(['2001','2002']);
  await expect(input).toBeEditable();await expect(input).toBeFocused();await expect(input).toHaveValue('');
  // Pasted text keeps only its digits.
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText(' 2 0-03 x'));
  await input.press('ControlOrMeta+V');
  await expect(input).toHaveValue('2003');
  await input.press('Backspace');await input.pressSequentially('4');
  await input.press('Enter');
  await expect(chips(page)).toHaveText(['2001','2002','2004']);
  await expect(input).toBeEditable();
  // A warning closes the keyboard so the choice shows; tapping the box drops it and opens the number to edit, selected.
  await input.pressSequentially('3045');await input.press('Enter');
  const warning=page.getByRole('alert');
  await expect(warning).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  await expect(input).not.toBeFocused();
  await page.screenshot({path:info.outputPath('start-line-warning.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  await input.click();
  await expect(warning).toHaveCount(0);
  await expect(input).toBeFocused();await expect(input).toBeEditable();await expect(input).toHaveValue('3045');
  await expect.poll(()=>selected(page,'Wristband number')).toBe('3045');
  // The tap selects again a frame later: let it land before moving the caret.
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(null)))));
  // Correcting a digit and Next checks it again and adds it.
  await input.press('ArrowLeft');await input.press('Delete');await input.pressSequentially('2');
  await expect(input).toHaveValue('2045');
  await nextBeside(page,'Wristband number').click();
  await expect(chips(page)).toHaveText(['2001','2002','2004','2045']);
  await expect(input).toHaveValue('');await expect(input).toBeFocused();
  // Fix number does the same: the number stays, selected, so typing replaces it.
  await input.pressSequentially('3047');await input.press('Enter');
  await expect(warning).toContainText('3047 is not a Girl Cubs number.');
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(warning).toHaveCount(0);
  await expect(input).toBeFocused();await expect(input).toHaveValue('3047');
  await expect.poll(()=>selected(page,'Wristband number')).toBe('3047');
  await input.pressSequentially('2047');await expect(input).toHaveValue('2047');
  await input.press('Enter');
  await expect(chips(page)).toHaveText(['2001','2002','2004','2045','2047']);
  for(const number of ['2045','2047']) await page.getByRole('button',{name:`Remove ${number}`,exact:true}).click();
  await expect(chips(page)).toHaveText(['2001','2002','2004']);
  await expect(input).toBeEditable();
  await input.click();
  // A number already in the race is refused: Fix number only, which keeps it selected too.
  await input.pressSequentially('2001');await input.press('Enter');
  await expect(warning).toContainText('2001 is already in this race. Check the wristband.');
  await expect(warning.getByRole('button',{name:'Keep',exact:true})).toHaveCount(0);
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toBeFocused();await expect(input).toHaveValue('2001');
  await expect.poll(()=>selected(page,'Wristband number')).toBe('2001');
  // Keep adds the number, amber, and its name says so.
  await input.pressSequentially('3046');await input.press('Enter');
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove 3046, kept for a lead to check',exact:true})).toBeVisible();
  await expect(input).toBeFocused();
  // Tapping a number takes it off.
  await page.getByRole('button',{name:'Remove 2002',exact:true}).click();
  await expect(chips(page)).toHaveText(['2001','2004','3046']);
  await expect(meta(page)).toHaveText('Heat 1 · 3 runners so far');
  await page.screenshot({path:info.outputPath('start-line.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  // Every number was saved as it went in: the race opened again shows the same list, still not done.
  await page.reload();
  await expect(chips(page)).toHaveText(['2001','2004','3046']);
  await expect(page.getByRole('tablist',{name:'Heat 1 progress'})).toContainText('You · 3 so far');
  await deleteCurrentRace(request,code);
});
test('a volunteer fixes a number that is no wristband and keeps wrong-section and already-ran warnings, which reach the lead once the heat is saved',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Warning sprint ${project}`;
  await ownEvent(request,code,name);
  const token=process.env.E2E_OWNER_TOKEN!;
  // 2008 ran in Heat 1, which is saved.
  await recordRace(request,token,code,[2008],[1234]);
  const {page}=await openPhone(`Warnings ${project}`);
  await page.getByRole('article',{name:`${name} · Girl Cubs`}).getByRole('button',{name:'Add heat 2',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'New race'})).toBeVisible();
  await page.getByRole('button',{name:'Create heat 2',exact:true}).click();
  await expect(meta(page)).toHaveText('Heat 2 · 0 runners so far');
  const input=page.getByLabel('Wristband number',{exact:true});
  await input.fill('0');await nextBeside(page,'Wristband number').click();
  await expect(page.getByRole('alert')).toContainText('0 is not a wristband number. Wristbands are 1 to 4999.');
  await page.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toHaveValue('0');
  await input.fill('2009');
  await nextBeside(page,'Wristband number').click();
  await expect(input).toBeEditable();await expect(input).toHaveValue('');
  await input.fill('3045');await nextBeside(page,'Wristband number').click();
  await expect(page.getByRole('alert')).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  await page.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(input).toBeEditable();await expect(input).toHaveValue('');
  await input.fill('2008');await nextBeside(page,'Wristband number').click();
  await expect(page.getByRole('alert')).toContainText('2008 already ran in another race of this event.');
  await page.screenshot({path:info.outputPath('already-ran.png'),fullPage:true});
  await page.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(meta(page)).toHaveText('Heat 2 · 3 runners so far');
  await expect(chips(page)).toHaveText(['2009','3045','2008']);
  for(const number of [3045,2008]) await expect(page.getByRole('button',{name:`Remove ${number}, kept for a lead to check`,exact:true})).toBeVisible();
  // The kept warnings are on the server's list, and go to the lead once the heat is saved.
  const lead={authorization:`Bearer ${token}`};
  const issues=async()=>(await (await request.get('/api/lead/results',{headers:lead})).json()).needsYou.filter((item:{event:{code:string}})=>item.event.code===code).map((item:{wristband?:number})=>item.wristband);
  expect(await issues()).not.toContain(3045);
  await writeOrder(request,token,code,[2009,3045,2008]);await writeTimes(request,token,code,[1200,1300,1400]);await submitRace(request,token,code);
  expect(await issues()).toEqual(expect.arrayContaining([3045,2008]));
  await deleteCurrentRace(request,code);
});
test('the 6th runner brings the usual heat size note once; That\'s everyone saves Runners, back on Races with Undo',async({openPhone,request},info)=>{
  const project=info.project.name,code=await ownCode(),name=`Usual size sprint ${project}`;
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(`Usual ${project}`);
  await request.post('/api/races',{headers:{authorization:`Bearer ${token}`},data:{eventCode:code,kind:'heat',number:1}});
  await openRace(page,name);
  const input=page.getByLabel('Wristband number',{exact:true});
  for(const number of [2101,2102,2103,2104,2105]) {await expect(input).toBeEditable();await input.fill(String(number));await input.press('Enter');await expect(chips(page).last()).toHaveText(String(number));}
  await expect(page.getByRole('status').filter({hasText:'usual number'})).toHaveCount(0);
  await expect(input).toBeEditable();await input.fill('2106');await input.press('Enter');
  const note=page.getByRole('status').filter({hasText:"That's 6 runners, the usual number for a heat. Tap That's everyone, or add more if this heat really has more."});
  await expect(note).toBeVisible();
  await page.screenshot({path:info.outputPath('usual-size.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  await note.getByRole('button',{name:'Add another runner',exact:true}).click();
  await expect(note).toHaveCount(0);
  await expect(input).toBeEditable();await input.fill('2107');await input.press('Enter');
  await expect(chips(page)).toHaveCount(7);
  // Never again at the 7th; the prompt says it in words.
  await expect(note).toHaveCount(0);
  await expect(meta(page)).toHaveText('Heat 1 · 7 runners so far · more than usual');
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  const toast=page.locator('.rz-toast');
  await expect(toast).toContainText('Runners saved · Girl Cubs Heat 1');
  await expect(page.getByRole('article',{name:`${name} · Girl Cubs`}).getByRole('button',{name:/^Heat 1/})).toHaveAccessibleName(/^Heat 1, /);
  await page.screenshot({path:info.outputPath('toast.png')});
  expect(await lookProblems(page)).toEqual([]);
  // Undo reverses only this save and reopens the race at the step.
  await toast.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`})).toBeVisible();
  await expect(page.getByRole('tablist',{name:'Heat 1 progress'})).toContainText('You · 7 so far');
  await expect(chips(page)).toHaveCount(7);
  await deleteCurrentRace(request,code);
});
