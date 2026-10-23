import { test as base,expect,request,type APIRequestContext,type BrowserContext,type Locator,type Page } from '@playwright/test';
import pg from 'pg';
import type { HomeSnapshot,Job,RaceScreenRead } from '../src/shared/race-screen.js';
import { wrongTimes } from '../src/shared/wrong-times.js';
/** One person's phone in a multi-phone test: its own browser context, its page, and its session token for API setup. */
export interface PhoneSession { context:BrowserContext; page:Page; token:string }
/** Every "the other phone sees it" check waits this long, so a fall back to 5 s polling fails. Everything else keeps the 5 s default. */
export const live={timeout:2000};
// A real reset changes the lead code. The original scoring phone is retained by
// every reset journey, so each test reads the current codes rather than a seed.
export const test=base.extend<{freshCodes:void;openPhone:(name:string,options?:{lead?:boolean})=>Promise<PhoneSession>}>({
  /**
   * Opens a phone as its own browser context with this project's device settings, signed in through the API
   * as a new volunteer (or a lead) and on Home. Names must be unique across the run (add the project name).
   * Every phone opened is closed when the test ends.
   */
  openPhone:async({browser},use)=>{
    const contexts:BrowserContext[]=[];
    await use(async(name,{lead=false}={})=>{
      const context=await browser.newContext({...test.info().project.use});contexts.push(context);
      const token=await signInThroughApi(context.request,name);
      if(lead) expect((await context.request.post('/api/become-lead',{headers:{authorization:`Bearer ${token}`},data:{code:process.env.E2E_LEAD_CODE}})).ok()).toBe(true);
      const page=await context.newPage();
      await page.goto('/');await page.evaluate(token=>localStorage.setItem('msf:token',token),token);await page.reload();
      await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
      return {context,page,token};
    });
    for(const context of contexts) await context.close();
  },
  freshCodes:[async({request},use)=>{
    let response=await request.get('/api/day',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`}});
    // A password change ends every session; a fresh worker still holds setup's token, so sign the scoring team back in.
    if(response.status()===401) {await signScoringTeamBackIn(request);response=await request.get('/api/day',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`}});}
    expect(response.ok()).toBe(true);
    const {leadCode,olympicsPassword}=await response.json();
    process.env.E2E_LEAD_CODE=leadCode;process.env.E2E_OLYMPICS_PASSWORD=olympicsPassword;
    await use();
  },{auto:true}]
});
/** Signs setup's scoring team profile in again with the owner password; its role and Day setup are untouched. */
export async function signScoringTeamBackIn(request:APIRequestContext) {
  const response=await request.post('/api/owner-sign-in',{data:{password:'e2e-owner-fixture',name:'E2E Scoring',profiles:[JSON.parse(process.env.E2E_SCORING_PROFILE!)]}});
  expect(response.ok()).toBe(true);
  process.env.E2E_SCORING_TOKEN=(await response.json()).token;
}
/** On the Olympics password screen: types the password (or the owner password) and taps Continue. */
export async function typePassword(page:Page,password=process.env.E2E_OLYMPICS_PASSWORD!) {
  await page.getByLabel('Olympics password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
}
/**
 * Signs a new person in as a volunteer would: past the Olympics password screen when it shows,
 * then Create profile. Profiles last for the whole database, so names must be unique across the run
 * (each test adds its project name).
 */
export async function createProfile(page:Page,name:string) {
  const password=page.getByLabel('Olympics password',{exact:true}),profiles=page.getByRole('heading',{level:1,name:"Who's using this phone?"});
  await expect(password.or(profiles)).toBeVisible();
  if(await password.isVisible()) {await typePassword(page);await expect(profiles).toBeVisible();}
  const create=page.getByRole('button',{name:'New here? Create profile'});
  if(await create.getAttribute('aria-expanded')==='false') await create.click();
  await page.getByLabel('Full name',{exact:true}).fill(name);
  await page.getByRole('button',{name:'Create profile',exact:true}).click();
}
/** Signs in as a lead from the profile screen: past the Olympics password screen when it shows, then Lead sign-in with a full name and the lead code. */
export async function leadSignIn(page:Page,name:string,code=process.env.E2E_LEAD_CODE!) {
  const password=page.getByLabel('Olympics password',{exact:true}),profiles=page.getByRole('heading',{level:1,name:"Who's using this phone?"});
  await expect(password.or(profiles)).toBeVisible();
  if(await password.isVisible()) {await typePassword(page);await expect(profiles).toBeVisible();}
  const lead=page.getByRole('button',{name:'Lead today? Sign in'});
  if(await lead.getAttribute('aria-expanded')==='false') await lead.click();
  await page.getByLabel('Full name',{exact:true}).fill(name);
  await page.getByLabel("Today's lead code",{exact:true}).fill(code);
  await page.getByRole('button',{name:'Sign in as lead',exact:true}).click();
}
/** Signs a new profile in as a volunteer through the API (Olympics password, then Create profile) and returns its session token. */
export async function signInThroughApi(request:APIRequestContext,name:string) {
  const {pass}=await (await request.post('/api/password',{data:{password:process.env.E2E_OLYMPICS_PASSWORD}})).json();
  const created=await request.post('/api/profiles',{data:{pass,name}});
  expect(created.ok()).toBe(true);
  return (await created.json()).token as string;
}
/**
 * Taps the back arrow under the header, one level at a time, until it has gone back to the named screen
 * (the arrow's label says "Back to <to>"), for example back(page,'Results'). Wait for the screen to settle first.
 */
export async function back(page:Page,to:string) {
  const arrow=page.getByRole('navigation',{name:'Back',exact:true}).getByRole('button');
  for(let tries=0;tries<6;tries++) {
    await expect(arrow).toBeVisible();
    const label=(await arrow.getAttribute('aria-label'))!;
    await arrow.click();
    if(label===`Back to ${to}`) return;
    await expect(arrow).not.toHaveAttribute('aria-label',label);
  }
  throw new Error(`No way back to ${to}`);
}
// Race setup: every spec that needs a race entered or saved before it starts goes through these, so they are
// the one place that knows how a race is entered and saved. Each acts as the phone whose token it is given, on the
// event's race screen: it takes the job as opening its card does, then writes the whole column at the version it sees.
/** One race screen write as that phone; fails unless the server accepts it, and returns the race screen as it then stands. */
async function raceScreenWrite(request:APIRequestContext,token:string,eventCode:string,what:string,data:object) {
  const response=await request.post(`/api/race-screen/${eventCode}/${what}`,{headers:{authorization:`Bearer ${token}`},data});
  expect(response.ok(),`${what}: ${await response.text()}`).toBe(true);
  return await response.json() as RaceScreenRead;
}
/** The event's race screen as that phone sees it now. */
export async function readRaceScreen(request:APIRequestContext,token:string,eventCode:string) {
  const response=await request.get(`/api/race-screen/${eventCode}`,{headers:{authorization:`Bearer ${token}`}});
  expect(response.ok(),await response.text()).toBe(true);
  return await response.json() as RaceScreenRead;
}
/** Takes a job's hold on the event's race screen as that phone, as opening the job's card does (nothing changes if someone holds it). */
export function takeJob(request:APIRequestContext,token:string,eventCode:string,job:Job) {
  return raceScreenWrite(request,token,eventCode,'hold',{job});
}
/** Checks runners in on the race screen as that phone: takes check-in, then writes the whole list at the version it sees. */
export async function writeCheckIn(request:APIRequestContext,token:string,eventCode:string,runners:Array<number|{fix:number;to:number}>,keptWarnings?:number[]) {
  const {race}=await takeJob(request,token,eventCode,'check-in');
  // A fix keeps the entry of the number it replaces, as fixing a number on the card does.
  const entry=(runner:number|{fix:number;to:number})=>typeof runner==='number'?{wristband:runner}:{id:race.parts.runners.value!.find(old=>old.wristband===runner.fix)!.id,wristband:runner.to};
  return raceScreenWrite(request,token,eventCode,'check-in',{raceId:race.id,version:race.parts.runners.version,runners:runners.map(entry),keptWarnings});
}
/**
 * Writes the finishing order on the race screen as that phone, by wristband: takes the order, then writes the whole
 * column at the version it sees. Every runner goes in `order`, `didNotFinish` or `didNotRun`; `added` are runners
 * not on the list, typed at the finish (placed by naming them in `order` too).
 */
export async function writeOrder(request:APIRequestContext,token:string,eventCode:string,order:number[],{didNotFinish=[],didNotRun=[],added=[],keptWarnings=[]}:{didNotFinish?:number[];didNotRun?:number[];added?:number[];keptWarnings?:number[]}={}) {
  let {race}=await takeJob(request,token,eventCode,'order');
  // A runner typed at the finish has no entry until a write adds it, as on the card: added first, then placed.
  if(added.length) race=(await raceScreenWrite(request,token,eventCode,'order',{raceId:race.id,version:race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added,keptWarnings})).race;
  const id=(wristband:number)=>race.parts.runners.value!.find(runner=>runner.wristband===wristband)!.id;
  return raceScreenWrite(request,token,eventCode,'order',{raceId:race.id,version:race.parts.finish.version,order:order.map(id),didNotFinish:didNotFinish.map(id),didNotRun:didNotRun.map(id),added:[]});
}
/** Writes the times on the race screen as that phone, in hundredths by place; `keptWrong` are the places (0-based) whose wrong time it kept. */
export async function writeTimes(request:APIRequestContext,token:string,eventCode:string,places:number[],keptWrong:number[]=[]) {
  const {race}=await takeJob(request,token,eventCode,'times');
  return raceScreenWrite(request,token,eventCode,'times',{raceId:race.id,version:race.parts.times.version,places,keptWrong});
}
/** Presses Submit Race on the event's current race as that phone. The race is saved once everyone asked has pressed. */
export async function submitRace(request:APIRequestContext,token:string,eventCode:string) {
  return raceScreenWrite(request,token,eventCode,'submit',{raceId:(await readRaceScreen(request,token,eventCode)).race.id});
}
/**
 * A saved race, as one phone doing every job: checks the runners in, places them in that order (those beyond the
 * times Did not finish), types the times, keeping any wrong one, then presses Submit Race. Returns the race as it
 * was saved. `keptWarnings` are the wristbands whose warnings the starter kept.
 */
export async function recordRace(request:APIRequestContext,token:string,eventCode:string,runners:number[],places:number[],keptWarnings?:number[]) {
  await writeCheckIn(request,token,eventCode,runners,keptWarnings);
  await writeOrder(request,token,eventCode,runners.slice(0,places.length),{didNotFinish:runners.slice(places.length)});
  const {race}=await writeTimes(request,token,eventCode,places,wrongTimes(places).map(wrong=>wrong.index));
  expect((await submitRace(request,token,eventCode)).race.id,'the race is saved').not.toBe(race.id);
  return race as RaceScreenRead['race'] & {id:string};
}
/** Makes this test's own heats event (its code and name unique to the project), so its holds and races touch no other test. */
export async function ownEvent(request:APIRequestContext,code:string,name:string,section='Girl Cubs',format:'heats'|'timed'='heats') {
  expect((await request.post('/api/day/events',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{code,name,section,format}})).ok()).toBe(true);
}
/**
 * Makes this test's own relay (its code and name unique to the project), switched on, so its teams and races touch no
 * other test. A lead can't add a relay, so it goes straight into the e2e test database, switched off, and is switched
 * on through the API, which tells every open Home.
 */
export async function ownRelay(code:string,name:string,section='Girl Cubs') {
  const db=new pg.Client({connectionString:process.env.E2E_TEST_DATABASE_URL});await db.connect();
  try {
    await db.query(`INSERT INTO events(id,day_id,code,name,section,format,enabled,relay,programme_order)
      SELECT gen_random_uuid(),d.id,$1,$2,$3,'heats',false,true,(SELECT COALESCE(MAX(programme_order),-1)+1 FROM events WHERE day_id=d.id) FROM olympics_days d WHERE d.active`,[code,name,section]);
  } finally {await db.end();}
  const api=await request.newContext({baseURL:process.env.E2E_BASE_URL});
  try {expect((await api.post(`/api/day/events/${code}/enabled`,{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{enabled:true}})).ok()).toBe(true);}
  finally {await api.dispose();}
}
/** One Teams screen write as that phone; fails unless the server accepts it, and returns Home as it then stands. */
async function teamsWrite(request:APIRequestContext,token:string,relayCode:string,what:string,data:object) {
  const response=await request.post(`/api/teams/${relayCode}/${what}`,{headers:{authorization:`Bearer ${token}`},data});
  expect(response.ok(),`${what}: ${await response.text()}`).toBe(true);
  return await response.json() as HomeSnapshot;
}
/** Takes the relay's teams hold as that phone, whoever has it, as Take over does. */
export function takeTeams(request:APIRequestContext,token:string,relayCode:string) {
  return teamsWrite(request,token,relayCode,'take-over',{});
}
/** Opens a team to change it as that phone, as tapping it does ("Priya Shah is changing this team" elsewhere); returns the version it opened. */
export async function openTeam(request:APIRequestContext,token:string,relayCode:string,teamId:string,changeAnyway=false) {
  const home=await teamsWrite(request,token,relayCode,'open',{teamId,changeAnyway});
  return home.events.find(event=>event.code===relayCode)!.teams!.find(team=>team.id===teamId)!.version;
}
/**
 * Writes a team as that phone, as its Done does: takes the relay's teams hold, opens the team (with no `teamId`, a new
 * team), then sends the four boxes (null for an empty box) and the wristbands whose warnings it kept.
 */
export async function writeTeam(request:APIRequestContext,token:string,relayCode:string,legs:Array<number|null>,{teamId,keptWarnings=[]}:{teamId?:string;keptWarnings?:number[]}={}) {
  await takeTeams(request,token,relayCode);
  const version=teamId?await openTeam(request,token,relayCode,teamId):undefined;
  return teamsWrite(request,token,relayCode,'done',{teamId,version,legs,keptWarnings});
}
/** From Home: the Relays tab, then the Teams button, and waits for the Teams screen. */
export async function openTeams(page:Page) {
  await page.getByRole('tab',{name:'Relays',exact:true}).click();
  await page.getByRole('button',{name:/^Teams Type each relay's teams at the prep area/}).click();
  await expect(page.getByRole('heading',{level:1,name:'Teams',exact:true})).toBeVisible();
}
/**
 * Deletes the event's current race for good, as a lead does a race opened by mistake, so no race a test left
 * unsaved lingers on the shared test day. Every race screen test ends with it. A saved race stays, and an empty
 * next race has nothing to delete.
 */
export async function deleteCurrentRace(request:APIRequestContext,code:string) {
  const {race}=await readRaceScreen(request,process.env.E2E_SCORING_TOKEN!,code);
  if(race.id===null || race.state==='saved') return;
  expect((await request.post(`/api/lead/races/${race.id}/delete`,{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{permanent:true}})).ok()).toBe(true);
}
/** From Home: taps the event's tile and waits for its race screen. */
export async function openRaceScreen(page:Page,name:string,section='Girl Cubs') {
  await page.getByRole('region',{name,exact:true}).getByRole('button',{name:new RegExp(`^${name} ${section} · `)}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} ${section}`,exact:true})).toBeVisible();
}
/** Hides the page as an app switch does (the race screen's stream closes), or shows it again (it reconnects). */
export async function setHidden(page:Page,hidden:boolean) {
  await page.evaluate(hidden=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'));},hidden);
}
/** The Next button beside a number box on the race screen, found by the box's label. */
export function nextBeside(page:Page,label:string) {
  return page.locator('.number-entry-row',{has:page.getByLabel(label,{exact:true})}).getByRole('button',{name:'Next',exact:true});
}
/** Types one wristband into the phone number input and taps the Next beside it, as a volunteer would. */
export async function enterWristband(page:Page,number:number|string,label='Wristband number') {
  await page.getByLabel(label,{exact:true}).fill(String(number));
  await nextBeside(page,label).click();
}
/** Goes to Home the way a person would: back along the back arrow. Wait for the screen to settle first. */
export async function goHome(page:Page) {await back(page,'Home');}
/** From Home: taps I'm a zone lead and gives the lead code (or the owner password). */
export async function becomeLead(page:Page,code=process.env.E2E_LEAD_CODE!) {
  await page.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
  await page.getByLabel('Lead code or owner password').fill(code);
  await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
}
/** The lead's Dashboard button, whatever its "N to check" badge says. */
export function dashboardButton(page:Page) {
  return page.getByRole('button',{name:/^Dashboard( \d+ to check)?$/});
}
const dashboardTitles={Results:'Results','Day setup':'Day setup'} as const;
/** One of the Dashboard's buttons, Results or Day setup, whatever its explanation says. To check is on the Dashboard itself. */
export function dashboardMenuButton(page:Page,section:keyof typeof dashboardTitles) {
  return page.getByRole('main').getByRole('button',{name:new RegExp(`^${dashboardTitles[section]} `)});
}
/** From Home: opens the Dashboard, which shows To check, and, when named, Results or Day setup. */
export async function openDashboard(page:Page,section?:keyof typeof dashboardTitles) {
  await dashboardButton(page).click();
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
  if(section) await dashboardMenuButton(page,section).click();
}
/** A To check item, found by any text on it (event code, wristband, title); tapping it opens the race. */
export function toCheckItem(page:Page,text:RegExp) {
  return page.getByRole('list',{name:'To check'}).getByRole('button',{name:text});
}
/**
 * Starts dragging from `from` the way a person would: a real finger on the phone projects
 * (touch events through the browser's touch emulation), the mouse on desktop.
 * Move with `over` / `toPoint`, then `drop`.
 */
export async function startDrag(page:Page,from:Locator) {
  const touch=!!test.info().project.use.hasTouch;
  // A person scrolls the handle into sight before putting a finger on it.
  await from.scrollIntoViewIfNeeded();
  const box=(await from.boundingBox())!;
  let x=box.x+box.width/2,y=box.y+box.height/2;
  const cdp=touch?await page.context().newCDPSession(page):null;
  const finger=(type:'touchStart'|'touchMove'|'touchEnd',px=x,py=y)=>cdp!.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:px,y:py}]});
  if(touch) await finger('touchStart');else {await page.mouse.move(x,y);await page.mouse.down();}
  async function toPoint(targetX:number,targetY:number,moves=12) {
    for(let index=1;index<=moves;index++) {
      const px=x+(targetX-x)*index/moves,py=y+(targetY-y)*index/moves;
      if(touch) await finger('touchMove',px,py);else await page.mouse.move(px,py);
    }
    x=targetX;y=targetY;
  }
  return {
    toPoint,
    /** Moves so the dragged point sits on the middle of `target` (same column as the start). */
    async over(target:Locator) {const to=(await target.boundingBox())!;await toPoint(x,to.y+to.height/2);},
    async drop() {
      if(touch) {await finger('touchEnd');await cdp!.detach();} else await page.mouse.up();
      // The drag helper ignores clicks for 50 ms after a drop so the drop never counts as a tap; no person taps that fast.
      await page.waitForTimeout(100);
    },
  };
}
/** Drags `from` onto `to` and lets go. */
export async function dragTo(page:Page,from:Locator,to:Locator) {
  const drag=await startDrag(page,from);await drag.over(to);await drag.drop();
}
/** Types one place's time (digits only, as a timer would) into the phone number input and taps the Next beside it. */
export async function enterTime(page:Page,digits:number|string) {
  await page.getByLabel('Place time',{exact:true}).fill(String(digits));
  await nextBeside(page,'Place time').click();
}
/** Every rule of the v2 look that can be measured on the screen currently shown. */
export async function lookProblems(page:Page) {
  await page.evaluate(()=>document.fonts.ready);
  return page.evaluate(()=>{
    const problems:string[]=[];
    const visible=(element:Element)=>{const box=element.getBoundingClientRect();const style=getComputedStyle(element);return box.width>0&&box.height>0&&style.visibility!=='hidden'&&style.display!=='none';};
    const describe=(element:Element)=>`${element.tagName.toLowerCase()} "${(element.textContent||element.getAttribute('aria-label')||'').trim().slice(0,40)}"`;
    const rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number);
    const luminance=(value:string)=>{const [r,g,b]=rgb(value).slice(0,3).map(channel=>{const c=channel/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
    const background=(element:Element|null):string=>{
      for(let current=element;current;current=current.parentElement) {const value=getComputedStyle(current).backgroundColor;if(rgb(value)[3]!==0) return value;}
      return 'rgb(255, 255, 255)';
    };
    for(const target of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary')) {
      if(!visible(target)) continue;
      const box=(target.matches('input[type=radio],input[type=checkbox]')&&target.closest('label')?target.closest('label')!:target).getBoundingClientRect();
      if(box.height<43.5||box.width<43.5) problems.push(`tap target ${describe(target)} is ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    // House style: surfaces are told apart by tone, not outlines; labels in sentence case; one clock; Refresh says only Refresh.
    for(const box of document.querySelectorAll('div,li,section,article,nav,ol,ul,details,aside,header,footer,p,small,span')) {
      if(!visible(box)) continue;
      // An outline that marks a state stays: a wrong time, the row being edited, the row being dragged, a legend swatch.
      if(box.matches(".time-wrong,.lead-editing,[data-dragging],.results-swatch")) continue;
      const style=getComputedStyle(box);
      if(['top','right','bottom','left'].some(side=>parseFloat(style.getPropertyValue(`border-${side}-width`))>0&&style.getPropertyValue(`border-${side}-style`)!=='none')) problems.push(`outlined ${describe(box)}`);
      if(style.textTransform==='uppercase') problems.push(`uppercase ${describe(box)}`);
    }
    if(/\b\d{1,2}:\d\d(:\d\d)?\s?(AM|PM)\b/i.test(document.body.innerText)) problems.push('a 12-hour clock is shown');
    for(const button of document.querySelectorAll('button')) if(visible(button)&&/^Refresh ./.test(button.textContent!.trim())) problems.push(`refresh button ${describe(button)}`);
    for(const heading of document.querySelectorAll('h1,h2')) {
      const size=parseFloat(getComputedStyle(heading).fontSize);
      if(visible(heading)&&(size<22||size>26)) problems.push(`heading ${describe(heading)} is ${size}px`);
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      const element=node.parentElement!;
      if(!node.textContent!.trim()||!visible(element)||element.closest('[aria-hidden=true],button:disabled,script,style')) continue;
      const style=getComputedStyle(element);
      if(element.closest('p,li,label,dd,dt,td,th,button,output,a')&&!element.closest('small,.badge,h1,h2,h3')&&parseFloat(style.fontSize)<15) problems.push(`text ${describe(element)} is ${style.fontSize}`);
      const [a,b]=[luminance(style.color),luminance(background(element))].sort((x,y)=>y-x);
      const ratio=(a+0.05)/(b+0.05);
      if(ratio<4.5) problems.push(`text ${describe(element)} contrast ${ratio.toFixed(2)}`);
    }
    return problems;
  });
}
export { expect };
export type { APIRequestContext,Locator,Page };
