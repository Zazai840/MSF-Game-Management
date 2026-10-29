import { test as base,expect,request,type APIRequestContext,type BrowserContext,type Locator,type Page } from '@playwright/test';
import { isRunner,isTeamEntry } from '../src/shared/races.js';
import pg from 'pg';
import type { RaceFlowRead,RacesRead,Role } from '../src/shared/race-flow.js';
import type { HomeSnapshot,Job,RaceScreenRead } from '../src/shared/race-screen.js';
import { wrongTimes } from '../src/shared/wrong-times.js';
/** One person's phone in a multi-phone test: its own browser context, its page, and its session token for API setup. */
export interface PhoneSession { context:BrowserContext; page:Page; token:string }
/** Every "the other phone sees it" check waits this long, so a fall back to 5 s polling fails. Everything else keeps the 5 s default. */
export const live={timeout:2000};
// A real reset changes the lead code. The original owner phone is retained by
// every reset journey, so each test reads the current codes rather than a seed.
export const test=base.extend<{freshCodes:void;openPhone:(name:string,options?:{lead?:boolean;job?:Role})=>Promise<PhoneSession>}>({
  /**
   * Opens a phone as its own browser context with this project's device settings, signed in through the API
   * as a new volunteer (or a lead) with today's job chosen (Start line unless named; a lead is Zone lead), on Races.
   * Names must be unique across the run (add the project name). Every phone opened is closed when the test ends.
   */
  openPhone:async({browser},use)=>{
    const contexts:BrowserContext[]=[];
    await use(async(name,{lead=false,job}={})=>{
      const context=await browser.newContext({...test.info().project.use});contexts.push(context);
      const token=await signInThroughApi(context.request,name),headers={authorization:`Bearer ${token}`};
      if(lead) expect((await context.request.post('/api/become-lead',{headers,data:{code:process.env.E2E_LEAD_CODE}})).ok()).toBe(true);
      const {dayId}=await (await context.request.get('/api/me',{headers})).json();
      const page=await context.newPage();
      await page.goto('/');
      await page.evaluate(([token,role])=>{localStorage.setItem('msf:token',token);localStorage.setItem('msf:role',role);},[token,JSON.stringify({day:dayId,role:job??(lead?'lead':'start')})]);
      await page.reload();
      await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
      return {context,page,token};
    });
    for(const context of contexts) await context.close();
  },
  freshCodes:[async({request},use)=>{
    let response=await request.get('/api/day',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`}});
    // A password change ends every session; a fresh worker still holds setup's token, so sign the owner back in.
    if(response.status()===401) {await signOwnerBackIn(request);response=await request.get('/api/day',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`}});}
    expect(response.ok()).toBe(true);
    const {leadCode,olympicsPassword}=await response.json();
    process.env.E2E_LEAD_CODE=leadCode;process.env.E2E_OLYMPICS_PASSWORD=olympicsPassword;
    await use();
  },{auto:true}]
});
/** Signs setup's owner profile in again with the owner password; its role and Day setup are untouched. */
export async function signOwnerBackIn(request:APIRequestContext) {
  const response=await request.post('/api/owner-sign-in',{data:{password:'e2e-owner-fixture',name:'E2E Owner',profiles:[JSON.parse(process.env.E2E_OWNER_PROFILE!)]}});
  expect(response.ok()).toBe(true);
  process.env.E2E_OWNER_TOKEN=(await response.json()).token;
}
/** A volunteer's job on the Join form and in the job sheet, as the radio cards name it. */
export type JobName='Start line'|'Finish line'|'Timer';
/**
 * Joins as a person would on the Join form: the full name, the Password (the Olympics password; the lead code instead
 * joins as Zone lead, and the owner password as the owner) and, for a volunteer, today's job. Then taps Join.
 */
export async function join(page:Page,name:string,{code=process.env.E2E_OLYMPICS_PASSWORD!,job}:{code?:string;job?:JobName}={}) {
  await page.getByLabel('Full name',{exact:true}).fill(name);
  await page.getByLabel('Password',{exact:true}).fill(code);
  if(job) await page.getByRole('radiogroup',{name:"What's your job today?"}).getByRole('radio',{name:new RegExp(`^${job}`)}).click();
  await page.getByRole('button',{name:'Join',exact:true}).click();
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
// Race setup: every spec that needs a race entered or saved before it starts goes through these, so they are the one
// place that knows how a race is entered and saved. Each acts as the phone whose token it is given. An individual event
// works in the race flow (ADR 0003) on the race it is at: its final once it has one, else its latest race not saved,
// else a new next heat. A relay keeps its race screen: each write takes the job as opening its card does, then writes
// the whole column at the version it sees.
const bearer=(token:string)=>({authorization:`Bearer ${token}`});
async function postOk<T>(request:APIRequestContext,token:string,url:string,data:object) {
  const response=await request.post(url,{headers:bearer(token),data});
  expect(response.ok(),`${url}: ${await response.text()}`).toBe(true);
  return await response.json() as T;
}
/** The event's group in the races list, or undefined for a relay. */
async function raceGroup(request:APIRequestContext,token:string,eventCode:string) {
  return ((await (await request.get('/api/races',{headers:bearer(token)})).json()) as RacesRead).groups.find(group=>group.event.code===eventCode);
}
/** The race an individual event is at as that phone sees it now, making its next heat when it has none; null for a relay. */
export async function flowRace(request:APIRequestContext,token:string,eventCode:string) {
  const group=await raceGroup(request,token,eventCode);
  if(!group) return null;
  const race=group.races.find(item=>item.kind==='final') ?? group.races.filter(item=>item.state!=='saved').at(-1);
  if(!race) return postOk<RaceFlowRead>(request,token,'/api/races',{eventCode,kind:'heat',number:group.nextHeat});
  return (await (await request.get(`/api/races/${race.id}`,{headers:bearer(token)})).json()) as RaceFlowRead;
}
/** One race screen write on a relay as that phone; fails unless the server accepts it, and returns the race screen as it then stands. */
function raceScreenWrite(request:APIRequestContext,token:string,eventCode:string,what:string,data:object) {
  return postOk<RaceScreenRead>(request,token,`/api/race-screen/${eventCode}/${what}`,data);
}
/** A relay's race screen as that phone sees it now. */
export async function readRaceScreen(request:APIRequestContext,token:string,eventCode:string) {
  const response=await request.get(`/api/race-screen/${eventCode}`,{headers:bearer(token)});
  expect(response.ok(),await response.text()).toBe(true);
  return await response.json() as RaceScreenRead;
}
/** Takes a job's hold on a relay's race screen as that phone, as opening the job's card does (nothing changes if someone holds it). */
export function takeJob(request:APIRequestContext,token:string,eventCode:string,job:Job) {
  return raceScreenWrite(request,token,eventCode,'hold',{job});
}
/** Checks runners in to an individual event's race as that phone: the whole list, at the version it sees. */
export async function writeCheckIn(request:APIRequestContext,token:string,eventCode:string,runners:Array<number|{fix:number;to:number}>,keptWarnings:number[]=[]) {
  const {race}=(await flowRace(request,token,eventCode))!;
  // A fix keeps the entry of the number it replaces, as fixing a number does.
  const entry=(runner:number|{fix:number;to:number})=>typeof runner==='number'?{wristband:runner}:{id:race.parts.runners.value!.filter(isRunner).find(old=>old.wristband===runner.fix)!.id,wristband:runner.to};
  return postOk<RaceFlowRead>(request,token,`/api/races/${race.id}/check-in`,{raceId:race.id,version:race.parts.runners.version,runners:runners.map(entry),keptWarnings});
}
/**
 * Writes an individual event's finishing order as that phone, by wristband, at the version it sees. Every runner goes
 * in `order`, `didNotFinish` or `didNotRun`; `added` are runners not on the list, typed at the finish (placed by naming
 * them in `order` too).
 */
export async function writeOrder(request:APIRequestContext,token:string,eventCode:string,order:number[],{didNotFinish=[],didNotRun=[],added=[],keptWarnings=[]}:{didNotFinish?:number[];didNotRun?:number[];added?:number[];keptWarnings?:number[]}={}) {
  let {race}=(await flowRace(request,token,eventCode))!;
  const url=`/api/races/${race.id}/order`;
  // A runner typed at the finish has no entry until a write adds it: added first, then placed.
  if(added.length) race=(await postOk<RaceFlowRead>(request,token,url,{raceId:race.id,version:race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added,keptWarnings})).race;
  const id=(wristband:number)=>race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
  return postOk<RaceFlowRead>(request,token,url,{raceId:race.id,version:race.parts.finish.version,order:order.map(id),didNotFinish:didNotFinish.map(id),didNotRun:didNotRun.map(id),added:[]});
}
/** Writes the times as that phone, in hundredths by place; `keptWrong` are the places (0-based) whose wrong time it kept. A relay takes the times job first. */
export async function writeTimes(request:APIRequestContext,token:string,eventCode:string,places:number[],keptWrong:number[]=[]):Promise<{race:RaceFlowRead['race']|RaceScreenRead['race']}> {
  const flow=await flowRace(request,token,eventCode);
  if(flow) return postOk<RaceFlowRead>(request,token,`/api/races/${flow.race.id}/times`,{raceId:flow.race.id,version:flow.race.parts.times.version,places,keptWrong});
  const {race}=await takeJob(request,token,eventCode,'times');
  return raceScreenWrite(request,token,eventCode,'times',{raceId:race.id,version:race.parts.times.version,places,keptWrong});
}
/**
 * Saves the event's race as that phone: on an individual event, marks every step not yet done done (That's everyone,
 * Save positions, No more finishers), which saves it once nothing blocks it; on a relay, presses Submit Race, which
 * saves it once everyone asked has pressed.
 */
export async function submitRace(request:APIRequestContext,token:string,eventCode:string) {
  let flow=await flowRace(request,token,eventCode);
  if(!flow) return raceScreenWrite(request,token,eventCode,'submit',{raceId:(await readRaceScreen(request,token,eventCode)).race.id});
  for(const [step,status] of Object.entries(flow.steps)) if(status!.state!=='done') flow=await postOk<RaceFlowRead>(request,token,`/api/races/${flow.race.id}/steps/${step}/done`,{});
  return flow;
}
/**
 * A saved race of an individual event, as one phone doing every step: checks the runners in, places them in that
 * order (those beyond the times Did not finish), types the times, keeping any wrong one, then marks every step done.
 * Returns the race as it was saved. `keptWarnings` are the wristbands whose warnings the starter kept.
 */
export async function recordRace(request:APIRequestContext,token:string,eventCode:string,runners:number[],places:number[],keptWarnings?:number[]) {
  await writeCheckIn(request,token,eventCode,runners,keptWarnings);
  await writeOrder(request,token,eventCode,runners.slice(0,places.length),{didNotFinish:runners.slice(places.length)});
  await writeTimes(request,token,eventCode,places,wrongTimes(places).map(wrong=>wrong.index));
  const {race}=await submitRace(request,token,eventCode) as RaceFlowRead;
  expect(race.state,'the race is saved').toBe('saved');
  return race;
}
/**
 * Claims `size` numbers of a counter no other test in this run has used, from `start` on, and answers the first. The
 * counters live in the run's own test database, so specs sharing the test day never clash whatever order they run
 * in, and a worker restarted after a failure carries on from where the last one stopped.
 */
async function claim(counter:string,size:number,start:number) {
  const db=new pg.Client({connectionString:process.env.E2E_TEST_DATABASE_URL});await db.connect();
  try {
    await db.query('CREATE TABLE IF NOT EXISTS e2e_claims(counter text PRIMARY KEY,next integer NOT NULL)');
    return Number((await db.query('INSERT INTO e2e_claims(counter,next) VALUES($1,$2::integer+$3::integer) ON CONFLICT(counter) DO UPDATE SET next=e2e_claims.next+$3::integer RETURNING next-$3::integer AS first',[counter,start,size])).rows[0].first);
  } finally {await db.end();}
}
/** An event code no other test in this run uses (E1, E2 and so on): every event a spec makes takes one. */
export const ownCode=async()=>`E${await claim('code',1,1)}`;
const claimed=(code:string)=>expect(code,'Claim the event code with ownCode()').toMatch(/^E\d+$/);
const sectionStart={'Boy Beavers':1,'Girl Beavers':1,'Boy Cubs':1000,'Girl Cubs':2000,'Boy Scouts':3000,'Girl Scouts':4000} as const;
/**
 * This test's own children for relay teams: a block of `count` wristbands of the section that no other test's teams
 * use (a child in two relays is a warning every phone shows). Answers a namer: each new key (n(1), n(2101), any
 * number the spec likes) takes the block's next wristband, and the same key always answers the same one.
 */
export async function ownWristbands(section:keyof typeof sectionStart,count:number) {
  const first=await claim(`wristbands:${sectionStart[section]}`,count,sectionStart[section]),named=new Map<number,number>();
  if(first+count>sectionStart[section]+(sectionStart[section]===1?999:1000)) throw new Error(`The run has used every ${section} wristband: claim fewer`);
  return (key:number)=>{
    if(!named.has(key)) {if(named.size===count) throw new Error(`Claim more than ${count} ${section} wristbands`);named.set(key,first+named.size);}
    return named.get(key)!;
  };
}
/** Makes this test's own event under a code from ownCode(), so its races touch no other test. */
export async function ownEvent(request:APIRequestContext,code:string,name:string,section='Girl Cubs',format:'heats'|'timed'='heats',type:'races'|'hurdles'='races') {
  claimed(code);
  expect((await request.post('/api/day/events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{code,name,section,format,type}})).ok()).toBe(true);
}
/**
 * Makes this test's own relay under a code from ownCode(), switched on, so its teams and races touch no
 * other test. A lead can't add a relay, so it goes straight into the e2e test database, switched off, and is switched
 * on through the API, which tells every open Home.
 */
export async function ownRelay(code:string,name:string,section='Girl Cubs') {
  claimed(code);
  const db=new pg.Client({connectionString:process.env.E2E_TEST_DATABASE_URL});await db.connect();
  try {
    await db.query(`INSERT INTO events(id,day_id,code,name,section,format,enabled,relay,type,programme_order)
      SELECT gen_random_uuid(),d.id,$1,$2,$3,'heats',false,true,'relays',(SELECT COALESCE(MAX(programme_order),-1)+1 FROM events WHERE day_id=d.id) FROM olympics_days d WHERE d.active`,[code,name,section]);
  } finally {await db.end();}
  const api=await request.newContext({baseURL:process.env.E2E_BASE_URL});
  try {expect((await api.post(`/api/day/events/${code}/enabled`,{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{enabled:true}})).ok()).toBe(true);}
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
/** A relay check-in tap as that phone on the race it sees now, naming the team by its number, as tapping it does. */
async function checkInTap(request:APIRequestContext,token:string,relayCode:string,what:'tick'|'take-off'|'here'|'edit-open',number:number,data:object={}) {
  const seen=await readRaceScreen(request,token,relayCode);
  return raceScreenWrite(request,token,relayCode,what,{raceId:seen.race.id,teamId:seen.teams!.find(team=>team.number===number)!.id,...data});
}
/** Ticks Team `number` into the relay's current heat as that phone (anyone can: there is no check-in hold on a relay). */
export function tickTeam(request:APIRequestContext,token:string,relayCode:string,number:number) {
  return checkInTap(request,token,relayCode,'tick',number);
}
/**
 * Leaves Team `number` open as that phone, as an Edit at check-in left open does, on a team since taken off the heat:
 * the team is still to run, and other phones see "Priya Shah is changing this team" with Change anyway.
 */
export async function leaveTeamOpen(request:APIRequestContext,token:string,relayCode:string,number:number) {
  await tickTeam(request,token,relayCode,number);
  await checkInTap(request,token,relayCode,'edit-open',number);
  await checkInTap(request,token,relayCode,'take-off',number);
}
/** Marks the child on leg `leg` (1 for the 1st) of a ticked Team `number` here as that phone, or not here. */
export function markHere(request:APIRequestContext,token:string,relayCode:string,number:number,leg:number,here=true) {
  return checkInTap(request,token,relayCode,'here',number,{leg:leg-1,here});
}
/**
 * Writes a relay heat's finishing order as that phone, naming teams by their number: takes the order, then writes the
 * whole column at the version it sees. Every ticked team goes in `order`, `didNotFinish` or `didNotRun`.
 */
export async function writeTeamOrder(request:APIRequestContext,token:string,relayCode:string,order:number[],{didNotFinish=[],didNotRun=[],addedTeams=[]}:{didNotFinish?:number[];didNotRun?:number[];addedTeams?:number[]}={}) {
  const {race}=await takeJob(request,token,relayCode,'order');
  const id=(number:number)=>race.parts.runners.value!.filter(isTeamEntry).find(entry=>entry.team.number===number)!.id;
  // Teams still to run added at the finish ("Add team") take the places after `order`.
  const listed=addedTeams.length?(await readRaceScreen(request,token,relayCode)).teams!:[];
  return raceScreenWrite(request,token,relayCode,'order',{raceId:race.id,version:race.parts.finish.version,order:order.map(id),didNotFinish:didNotFinish.map(id),didNotRun:didNotRun.map(id),added:[],addedTeams:addedTeams.map(number=>listed.find(team=>team.number===number)!.id)});
}
/** From Races: the Relays tab, then the Teams button, and waits for the Teams screen. */
export async function openTeams(page:Page) {
  await openRelays(page);
  await page.getByRole('button',{name:/^Teams Type each relay's teams at the prep area/}).click();
  await expect(page.getByRole('heading',{level:1,name:'Teams',exact:true})).toBeVisible();
}
/**
 * Deletes the event's races not yet saved for good (a relay's current race), as a lead does a race opened by
 * mistake, so no race a test left unsaved lingers on the shared test day. A saved race stays.
 */
export async function deleteCurrentRace(request:APIRequestContext,code:string) {
  const owner=process.env.E2E_OWNER_TOKEN!,group=await raceGroup(request,owner,code);
  const ids=group?group.races.filter(race=>race.state!=='saved').map(race=>race.id):[(await readRaceScreen(request,owner,code)).race].filter(race=>race.id!==null && race.state!=='saved').map(race=>race.id!);
  for(const id of ids) expect((await request.post(`/api/lead/races/${id}/delete`,{headers:bearer(owner),data:{permanent:true}})).ok()).toBe(true);
}
/** From Races: taps a race's chip on its event group's card ("H1", "Final"), opening Done when the group is done, and waits for the race. */
export async function openRace(page:Page,name:string,section='Girl Cubs',chip='H1') {
  const label=chip==='Final'?/^Final[, ]/:new RegExp(`^Heat ${chip.slice(1)}[, ]`),card=page.getByRole('article',{name:`${name} · ${section}`,exact:true});
  // Once the races have come in, a group that is done waits under the closed Done disclosure.
  await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  const done=page.locator('details:not([open])',{has:page.locator('summary',{hasText:/^Done \(/})});
  if(!await card.isVisible() && await done.count()) await done.locator('summary').click();
  await card.getByRole('button',{name:label}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} · ${section}`,exact:true})).toBeVisible();
}
/** On Races: the Relays tab. */
export async function openRelays(page:Page) {
  await page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:/^Relays/}).click();
}
/** From the Relays tab: taps the relay's tile and waits for its race screen. */
export async function openRaceScreen(page:Page,name:string,section='Girl Cubs') {
  await page.getByRole('region',{name,exact:true}).getByRole('button',{name:new RegExp(`^${name} ${section} · `)}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} ${section}`,exact:true})).toBeVisible();
}
/** Hides the page as an app switch does (the race screen's stream closes), or shows it again (it reconnects). */
export async function setHidden(page:Page,hidden:boolean) {
  await page.evaluate(hidden=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'));},hidden);
}
/** The Next for a number box, found by the box's label: beside it on a relay's race screen, in the footer on a race. */
export function nextBeside(page:Page,label:string) {
  return page.locator('.number-entry-row',{has:page.getByLabel(label,{exact:true})}).getByRole('button',{name:'Next',exact:true})
    .or(page.locator('.rz-footer').getByRole('button',{name:'Next',exact:true}));
}
/** The text selected in a number box, found by its label: what the next digit typed replaces. */
export function selected(page:Page,label:string) {
  return page.getByLabel(label,{exact:true}).evaluate((input:HTMLInputElement)=>document.activeElement===input?input.value.slice(input.selectionStart!,input.selectionEnd!):'');
}
/** Types one wristband into the phone number input and taps the Next beside it, as a volunteer would. */
export async function enterWristband(page:Page,number:number|string,label='Wristband number') {
  await page.getByLabel(label,{exact:true}).fill(String(number));
  await nextBeside(page,label).click();
}
/** Goes to Home the way a person would: back along the back arrow. Wait for the screen to settle first. */
export async function goHome(page:Page) {await back(page,'Races');}
/** From a race: its back link to Races. */
export async function backToRaces(page:Page) {
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
}
/** Switches today's job from the job chip on Races or a race, as a volunteer does. */
export async function switchJob(page:Page,job:JobName) {
  await page.getByRole('button',{name:/^Your job: .*\. Change job$/}).click();
  await page.getByRole('radiogroup',{name:'Your job'}).getByRole('radio',{name:new RegExp(`^${job}`)}).click();
}
/** From the job chip: Zone lead, then the lead code (or the owner password). */
export async function becomeLead(page:Page,code=process.env.E2E_LEAD_CODE!) {
  await page.getByRole('button',{name:/^Your job: .*\. Change job$/}).click();
  await page.getByRole('radio',{name:/^Zone lead/}).click();
  await page.getByLabel('Lead code',{exact:true}).fill(code);
  await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
  await expect(page.getByRole('button',{name:'Your job: Zone lead. Change job'})).toBeVisible();
}
/** A lead's avatar, which opens the lead menu (Results, Day setup, Your details). */
export function leadMenuButton(page:Page) {
  return page.getByRole('button',{name:/: Results, Day setup and your details$/});
}
/** From Races or a race as a lead: the lead menu, then Results or Day setup. */
export async function openLeadMenu(page:Page,section:'Results'|'Day setup') {
  await leadMenuButton(page).click();
  await page.getByRole('menu').getByRole('menuitem',{name:section,exact:true}).click();
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
/**
 * Every rule of the look that can be measured on the screen currently shown. The race flow's screens (inside
 * `.rz-screen`) follow the Running Zone design system (docs/running-zone-design-system/accessibility.md): 44px
 * targets and WCAG AA contrast, with display capitals from CSS. The older screens (Results, Day setup, a relay's race
 * screen) also keep the v2 house style: no outlines, sentence case, 15px text, 22-26px headings.
 */
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
    const designSystem=(element:Element)=>!!element.closest('.rz-screen');
    for(const box of document.querySelectorAll('div,li,section,article,nav,ol,ul,details,aside,header,footer,p,small,span')) {
      if(!visible(box) || designSystem(box)) continue;
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
      if(visible(heading)&&!designSystem(heading)&&(size<22||size>26)) problems.push(`heading ${describe(heading)} is ${size}px`);
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      const element=node.parentElement!;
      if(!node.textContent!.trim()||!visible(element)||element.closest('[aria-hidden=true],button:disabled,script,style')) continue;
      const style=getComputedStyle(element);
      const size=parseFloat(style.fontSize);
      if(!designSystem(element)&&element.closest('p,li,label,dd,dt,td,th,button,output,a')&&!element.closest('small,.badge,h1,h2,h3')&&size<15) problems.push(`text ${describe(element)} is ${style.fontSize}`);
      const [a,b]=[luminance(style.color),luminance(background(element))].sort((x,y)=>y-x);
      const ratio=(a+0.05)/(b+0.05),large=designSystem(element)&&(size>=24||size>=19&&Number(style.fontWeight)>=700);
      if(ratio<(large?3:4.5)) problems.push(`text ${describe(element)} contrast ${ratio.toFixed(2)}`);
    }
    return problems;
  });
}
export { expect };
export type { APIRequestContext,Locator,Page };
