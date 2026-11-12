import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,ownCode,ownEvent,ownRelay,ownWristbands,deleteCurrentRace,enterTime,expect,flowPost,lookProblems,recordRace,press,test,tickTeam,writeCheckIn,writeOrder,writeTeam,writeTimes,type APIRequestContext,type Page} from './fixtures.js';
/**
 * A Zone lead marking a step done goes back to Races, as a volunteer does, with the same one-line toast and Undo, on
 * the tab that holds the race's event whatever tab the phone remembered. A lead changing a step already done stays.
 */
const owner=()=>process.env.E2E_OWNER_TOKEN!;
const read=async(request:APIRequestContext,raceId:string)=>(await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${owner()}`}})).json()) as RaceFlowRead;
const toast=(page:Page)=>page.locator('.rz-toast');
const onTab=(page:Page,tab:'Races'|'Relays')=>expect(page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:tab,exact:true})).toHaveAttribute('aria-current','page');
/** Opens a race at its address on a phone whose Races home last showed `tab`. */
async function openAt(page:Page,raceId:string,tab:'races'|'relays') {
  await page.evaluate(tab=>localStorage.setItem('msf:home-tab',tab),tab);
  await page.goto(`/races/${raceId}`);
}
/** The toast is one line, the save's words with Undo and nothing more (no next step). */
async function savedToast(page:Page,words:string) {
  await expect(toast(page).locator('.rz-toast__msg')).toHaveText(words);
  await expect(toast(page)).toHaveText(`${words}Undo`);
}

test('a lead marking That\'s everyone and the last place\'s time on a heat lands on Races with the toast, and Undo reopens the race at that step',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Lead toast heat');
  await ownEvent(request,code,name,'Girl Cubs','heats');
  await recordRace(request,owner(),code,[2001],[1300]);
  const {race}=await writeCheckIn(request,owner(),code,[2002,2003]);
  const {page}=await openPhone(ownName('Lead toast heat'),{lead:true});
  // The phone remembered Relays; a heat's event is on Races.
  await openAt(page,race.id,'relays');
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  await onTab(page,'Races');
  await savedToast(page,'Runners saved · Girl Cubs Heat 2');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-toast-runners.png')});
  // The last place's time marks Times done: back on Races with the toast.
  await writeTimes(request,owner(),code,[1250]);
  await openAt(page,race.id,'relays');
  const tabs=page.getByRole('tablist',{name:'Heat 2 steps'});
  await press(tabs.getByRole('tab',{name:/^Times/}));
  await enterTime(page,'1400');
  await onTab(page,'Races');
  await savedToast(page,'Times saved · Girl Cubs Heat 2');
  // Undo reverses only this save and reopens the race at Times.
  await press(toast(page).getByRole('button',{name:'Undo',exact:true}));
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(tabs.getByRole('tab',{name:/^Times/})).toHaveAttribute('aria-selected','true');
  // The times stay; only the done mark went.
  await expect(page.getByRole('heading',{level:2,name:'Every place has a time'})).toBeVisible();
  await expect.poll(async()=>(await read(request,race.id)).steps.times!.state).toBe('in progress');
  await deleteCurrentRace(request,code);
});

test('a lead saving a final\'s finishing order lands on Races with "Finishing order saved · Girl Cubs Final"',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Lead toast final');
  await ownEvent(request,code,name,'Girl Cubs','heats');
  await recordRace(request,owner(),code,[2011,2012],[1200,1300]);
  const final=await flowPost(request,owner(),'/api/races',{eventCode:code,kind:'final',number:0,direct:true});
  const {page}=await openPhone(ownName('Lead toast final'),{lead:true});
  await openAt(page,final.race.id,'relays');
  for(const number of [2011,2012]) await press(page.getByRole('button',{name:`${number}: Here`,exact:true}));
  await expect(page.getByRole('button',{name:'2012: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  await onTab(page,'Races');
  await savedToast(page,'Runners saved · Girl Cubs Final');
  await openAt(page,final.race.id,'relays');
  await press(page.getByRole('tablist',{name:'Final steps'}).getByRole('tab',{name:/^Finishing order/}));
  await press(page.getByRole('button',{name:'2012 came 1st',exact:true}));
  await press(page.getByRole('button',{name:'2011 came 2nd',exact:true}));
  await press(page.getByRole('button',{name:'Save the order',exact:true}));
  await onTab(page,'Races');
  await savedToast(page,'Finishing order saved · Girl Cubs Final');
});

test('a lead marking That\'s everyone on a relay heat lands on Relays with the toast, though the phone remembered Races',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Lead toast relay'),w=await ownWristbands('Girl Cubs',4);
  await ownRelay(code,name,'Girl Cubs');
  await writeTeam(request,owner(),code,[w(1),w(2),w(3),w(4)]);
  const made=await flowPost(request,owner(),'/api/races',{eventCode:code,kind:'heat',number:1});
  await tickTeam(request,owner(),code,1);
  const {page}=await openPhone(ownName('Lead toast relay'),{lead:true});
  await openAt(page,made.race.id,'races');
  await press(page.locator('footer.rz-footer').getByRole('button',{name:"That's everyone",exact:true}));
  await onTab(page,'Relays');
  await savedToast(page,'Runners saved · Girl Cubs Heat 1');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-toast-relay.png')});
  await deleteCurrentRace(request,code);
});

test('a lead correcting Times after the Timer marked it done stays on the race with no toast',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Lead toast correct');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {race}=await writeCheckIn(request,owner(),code,[2021,2022]);
  // The Timer typed one time and tapped No more finishers.
  await writeTimes(request,owner(),code,[1300]);
  await flowPost(request,owner(),`/api/races/${race.id}/steps/times/done`,{});
  const {page}=await openPhone(ownName('Lead toast correct'),{lead:true});
  await openAt(page,race.id,'races');
  const tabs=page.getByRole('tablist',{name:'Heat 1 steps'});
  await press(tabs.getByRole('tab',{name:/^Times/}));
  // The 2nd place's time is the last place's: it marks Times done again, which changes nothing.
  await enterTime(page,'1400');
  await expect.poll(async()=>(await read(request,race.id)).race.parts.times.value?.places).toEqual([1300,1400]);
  await expect(page.getByRole('button',{name:'2nd place: 14.00',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(tabs.getByRole('tab',{name:/^Times/})).toHaveAttribute('aria-selected','true');
  await expect(toast(page)).toHaveCount(0);
  await deleteCurrentRace(request,code);
});

test('a lead tapping each done button on an unsaved heat whose steps are already done is told so, with why the heat is not in Results, and sees the same done marks as a volunteer',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Lead done answer'),bands=[2031,2032,2033,2034,2035,2036,2037,2038];
  await ownEvent(request,code,name,'Girl Cubs','heats');
  // The demonstration run: more runners than usual, all placed, the last two with no time, every volunteer's step marked done.
  const timer=await openPhone(ownName('Done answer timer'),{job:'timer'});
  const {race}=await writeCheckIn(request,timer.token,code,bands);
  await writeOrder(request,timer.token,code,bands);
  await writeTimes(request,timer.token,code,[1100,1200,1300,1400,1500,1600]);
  for(const step of ['runners','positions','times']) await flowPost(request,timer.token,`/api/races/${race.id}/steps/${step}/done`,{});
  const lead=await openPhone(ownName('Done answer lead'),{lead:true}),{page}=lead;
  // The lead disqualifies one of the two: the heat still has a place with no time.
  const entry=race.parts.runners.value!.find(runner=>'wristband' in runner && runner.wristband===2038)!;
  expect((await request.post(`/api/lead/races/${race.id}/runners/${entry.id}/disqualify`,{headers:{authorization:`Bearer ${lead.token}`},data:{reason:'Out of lane',comment:''}})).ok()).toBe(true);
  await openAt(page,race.id,'races');
  const tabs=page.getByRole('tablist',{name:'Heat 1 steps'}),answer=(step:string)=>page.getByText(`${step} already done. Not in Results yet: 7th place has no time.`,{exact:true});
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  await expect(answer('Runners are')).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-done-answer.png')});
  await press(tabs.getByRole('tab',{name:/^Finishing order/}));
  await expect(answer('Runners are')).toHaveCount(0);
  await press(page.getByRole('button',{name:'Save the order',exact:true}));
  await expect(answer('Finishing order is')).toBeVisible();
  await press(tabs.getByRole('tab',{name:/^Times/}));
  await press(page.getByRole('button',{name:'No more finishers',exact:true}));
  await expect(answer('Times are')).toBeVisible();
  // Still on the race: nothing was saved, so no toast and no trip to Races.
  await expect(page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
  // Both phones mark every step done.
  await timer.page.goto(`/races/${race.id}`);
  await expect(timer.page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  for(const phone of [page,timer.page]) await expect(phone.locator('.rz-step__label:has(.rz-icon)')).toHaveText(['Runners','Finishing order','Times']);
  await deleteCurrentRace(request,code);
});

/**
 * The toast's measured shape, whatever its words: its height, whether it is centred, how many rows its line takes,
 * whether its ends are fully round, and whether any of it is cut or off the screen.
 */
const shape=(page:Page)=>toast(page).evaluate(element=>{
  const box=element.getBoundingClientRect(),message=element.querySelector('.rz-toast__msg')!,screen=document.documentElement.clientWidth;
  const words=document.createRange();words.selectNodeContents(message.lastChild!);
  const lines=[...words.getClientRects()].filter(rect=>rect.width>0),inside=(rect:DOMRect)=>rect.left>=box.left&&rect.right<=box.right&&rect.top>=box.top&&rect.bottom<=box.bottom;
  const main=document.querySelector('.rz-main')!,pad=getComputedStyle(main);
  return {height:box.height,width:box.width,offCentre:Math.abs(box.left+box.width/2-screen/2),
    content:main.clientWidth-parseFloat(pad.paddingLeft)-parseFloat(pad.paddingRight),
    rows:new Set(lines.map(rect=>Math.round(rect.bottom))).size,
    roundEnds:parseFloat(getComputedStyle(element).borderTopLeftRadius)>=box.height/2,
    cut:element.scrollWidth>element.clientWidth||element.scrollHeight>element.clientHeight||!lines.every(inside)||box.left<0||box.right>screen||box.top<0,
    aboveDocked:box.bottom<=document.querySelector('footer.rz-footer')!.getBoundingClientRect().top};
});

test('a plain toast is a 36px pill as wide as its words, centred, with fully round ends',async({openPhone,request},info)=>{
  const code=await ownCode();
  await ownEvent(request,code,ownName('Pill plain'),'Girl Cubs','timed');
  const {page}=await openPhone(ownName('Pill plain lead'),{lead:true});
  await page.goto('/day/events');
  await press(page.getByRole('button',{name:`Switch off ${code}`,exact:true}));
  await expect(toast(page)).toBeVisible();
  await expect(toast(page).getByRole('button')).toHaveCount(0);
  const pill=await shape(page);
  expect(pill).toMatchObject({height:36,rows:1,roundEnds:true,cut:false});
  expect(pill.width).toBeLessThan(pill.content);
  expect(pill.offCentre).toBeLessThanOrEqual(0.5);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('toast-pill-plain.png')});
});

test('a toast with Undo is a 44px pill above the docked button on narrow and wide screens, and a line too long for one row wraps to two in a rounded box with no words cut',async({openPhone,request},info)=>{
  const code=await ownCode();
  await ownEvent(request,code,ownName('Pill undo'),'Girl Cubs','heats');
  const {race}=await writeCheckIn(request,owner(),code,[2041,2042]);
  const {page}=await openPhone(ownName('Pill undo lead'),{lead:true});
  // Wide first: the saved line fits on one row whatever its words.
  await page.setViewportSize({width:1280,height:800});
  await openAt(page,race.id,'races');
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  const undo=toast(page).getByRole('button',{name:'Undo',exact:true});
  // The toast waits while its button has focus, so there is time to measure it.
  await undo.focus();
  const wide=await shape(page);
  expect(wide).toMatchObject({height:44,rows:1,roundEnds:true,cut:false,aboveDocked:true});
  expect(wide.width).toBeLessThan(wide.content);
  expect(wide.offCentre).toBeLessThanOrEqual(0.5);
  expect((await undo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('toast-pill-undo-wide.png')});
  // A narrow phone, and an Undo that fails: its line does not fit on one row beside the button.
  await page.setViewportSize({width:320,height:700});
  await page.route('**/steps/*/undone',route=>route.abort());
  const failed=page.waitForEvent('requestfailed');
  await press(undo);
  await failed;
  await expect.poll(async()=>(await shape(page)).rows).toBe(2);
  const narrow=await shape(page);
  expect(narrow).toMatchObject({rows:2,roundEnds:false,cut:false,aboveDocked:true});
  expect(narrow.offCentre).toBeLessThanOrEqual(0.5);
  expect((await undo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('toast-box-two-rows.png')});
  await deleteCurrentRace(request,code);
});

/** What a person saw of one toast: how long it was on the screen and, at each frame, how solid it was, where its foot was and how far off centre it sat. */
interface Watched { shownFor:number; frames:Array<{at:number;opacity:number;bottom:number;offCentre:number}> }
/** Watches the next toast, from before it shows until it has gone. Start it before the press that saves; `watched` waits for the toast to go. */
const watchToast=(page:Page)=>page.evaluate(()=>{
  (window as unknown as {toastWatch:Promise<Watched>}).toastWatch=new Promise(resolve=>{
    const frames:Watched['frames']=[];
    let shown=0;
    const frame=()=>{
      const element=document.querySelector('.rz-toast'),now=performance.now();
      if(element) {
        shown||=now;
        const box=element.getBoundingClientRect();
        frames.push({at:now-shown,opacity:Number(getComputedStyle(element).opacity),bottom:box.bottom,offCentre:Math.abs(box.left+box.width/2-document.documentElement.clientWidth/2)});
      } else if(shown) return resolve({shownFor:now-shown,frames});
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
});
const watched=(page:Page)=>page.evaluate(()=>(window as unknown as {toastWatch:Promise<Watched>}).toastWatch);
/** The frame nearest a time after the toast showed. */
const frameAt=(seen:Watched,at:number)=>seen.frames.reduce((near,frame)=>Math.abs(frame.at-at)<Math.abs(near.at-at)?frame:near);
/** About 3 seconds: a timer on a busy machine runs late, never early. */
const aboutThreeSeconds=(time:number)=>{expect(time).toBeGreaterThan(2700);expect(time).toBeLessThan(3700);};
/** A lead on Day setup's events with an event of their own to switch off and on: each press saves and shows a plain toast. */
async function onEvents(page:Page,request:APIRequestContext,words:string) {
  const code=await ownCode();
  await ownEvent(request,code,ownName(words),'Girl Cubs','timed');
  await page.goto('/day/events');
  return code;
}

test('a plain toast fades and rises in, stays centred, is still showing after 2 seconds and has faded out and gone after about 3',async({openPhone,request})=>{
  const {page}=await openPhone(ownName('Toast time lead'),{lead:true}),code=await onEvents(page,request,'Toast time');
  await watchToast(page);
  await press(page.getByRole('button',{name:`Switch off ${code}`,exact:true}));
  const seen=await watched(page),first=seen.frames[0]!,rest=frameAt(seen,1000),last=seen.frames.at(-1)!;
  aboutThreeSeconds(seen.shownFor);
  // In: it starts clear and below its place, and is solid and in place well within a second.
  expect(first.opacity).toBeLessThan(0.5);
  expect(first.bottom).toBeGreaterThan(rest.bottom);
  expect(frameAt(seen,500)).toEqual({...rest,at:expect.any(Number)});
  expect(frameAt(seen,2000)).toMatchObject({opacity:1,bottom:rest.bottom});
  // Out: it is solid until the fade, and is not taken away until it has faded.
  expect(frameAt(seen,seen.shownFor-400).opacity).toBe(1);
  expect(last.opacity).toBeLessThan(0.2);
  expect(Math.max(...seen.frames.map(frame=>frame.offCentre))).toBeLessThanOrEqual(0.5);
});

test('with reduced motion the toast shows and goes with no animation, after about 3 seconds',async({openPhone,request})=>{
  const {page}=await openPhone(ownName('Toast still lead'),{lead:true}),code=await onEvents(page,request,'Toast still');
  await page.emulateMedia({reducedMotion:'reduce'});
  await watchToast(page);
  await press(page.getByRole('button',{name:`Switch off ${code}`,exact:true}));
  const seen=await watched(page),first=seen.frames[0]!;
  aboutThreeSeconds(seen.shownFor);
  expect(first.opacity).toBe(1);
  for(const frame of seen.frames) expect(frame).toEqual({...first,at:expect.any(Number)});
});

test('a new toast takes the place of the one showing, and has its own 3 seconds',async({openPhone,request})=>{
  const {page}=await openPhone(ownName('Toast next lead'),{lead:true}),code=await onEvents(page,request,'Toast next');
  await watchToast(page);
  await press(page.getByRole('button',{name:`Switch off ${code}`,exact:true}));
  await expect(toast(page)).toHaveText(/switched off/);
  await page.waitForTimeout(1500);
  await press(page.getByRole('button',{name:`Switch on ${code}`,exact:true}));
  await expect(toast(page)).toHaveText(/switched on/);
  await expect(toast(page)).toHaveCount(1);
  // The second toast came 1.5 seconds into the first, and its count started afresh.
  expect((await watched(page)).shownFor).toBeGreaterThan(4200);
});

test('a toast with Undo stays while its button has focus, and goes about 3 seconds after the focus leaves',async({openPhone,request})=>{
  const code=await ownCode();
  await ownEvent(request,code,ownName('Toast focus'),'Girl Cubs','heats');
  const {race}=await writeCheckIn(request,owner(),code,[2051,2052]);
  const {page}=await openPhone(ownName('Toast focus lead'),{lead:true});
  await openAt(page,race.id,'races');
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  const undo=toast(page).getByRole('button',{name:'Undo',exact:true});
  await undo.focus();
  await page.waitForTimeout(4000);
  await expect(undo).toBeVisible();
  await expect(toast(page)).toHaveCSS('opacity','1');
  await undo.blur();
  const left=Date.now();
  await expect(toast(page)).toHaveCount(0,{timeout:6000});
  aboutThreeSeconds(Date.now()-left);
  await deleteCurrentRace(request,code);
});

test('the 3 seconds start again when the toast changes to the "changed since" warning',async({openPhone,request})=>{
  const code=await ownCode();
  await ownEvent(request,code,ownName('Toast changed'),'Girl Cubs','heats');
  const {race}=await writeCheckIn(request,owner(),code,[2061,2062]);
  const {page}=await openPhone(ownName('Toast changed lead'),{lead:true});
  await openAt(page,race.id,'races');
  await watchToast(page);
  await press(page.getByRole('button',{name:"That's everyone",exact:true}));
  await expect(toast(page).getByRole('button',{name:'Undo',exact:true})).toBeVisible();
  await page.waitForTimeout(1500);
  // Someone else changes the runners after this phone's save.
  await writeCheckIn(request,owner(),code,[2061,2062,2063]);
  await expect(toast(page).getByRole('button',{name:'Open race',exact:true})).toBeVisible();
  const changed=Date.now();
  await expect(toast(page)).toHaveCount(0,{timeout:6000});
  aboutThreeSeconds(Date.now()-changed);
  expect((await watched(page)).shownFor).toBeGreaterThan(4200);
  await deleteCurrentRace(request,code);
});
