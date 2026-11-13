import { test as base,expect,request,type APIRequestContext,type BrowserContext,type Locator,type Page } from '@playwright/test';
import { isRunner,isTeamEntry } from '../src/shared/races.js';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import type { RaceFlowRead,RacesRead,Role } from '../src/shared/race-flow.js';
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
   * Build names with ownName(), so each is this test's alone. Every phone opened is closed when the test ends.
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
/**
 * Sets the shared day's This day to the current year, South and Day 1, so the day export works. Global setup calls it
 * once; a spec that starts a new day calls it again (a new day starts with Region and Day empty).
 */
export async function labelDay(request:APIRequestContext,token=process.env.E2E_OWNER_TOKEN!) {
  for(const data of [{year:new Date().getUTCFullYear()},{region:'South'},{dayNumber:1}]) {
    const response=await request.post('/api/day/this-day',{headers:{authorization:`Bearer ${token}`},data});
    if(!response.ok()) throw new Error(`This day answered ${response.status()}: ${await response.text()}`);
  }
}
/** A volunteer's job on the Join form and in the job sheet, as the radio cards name it. */
export type JobName='Start line'|'Finish line'|'Timer';
/**
 * Joins as a person would on the Join form: the full name, the Password (the Olympics password; the lead code instead
 * joins as Zone lead, and the owner password as the owner) and, for a volunteer, today's job. Then taps Join.
 */
export async function join(page:Page,name:string,{code=process.env.E2E_OLYMPICS_PASSWORD!,job}:{code?:string;job?:JobName}={}) {
  await nameIsThisTests(name);
  await page.getByLabel('Full name',{exact:true}).fill(name);
  await page.getByLabel('Password',{exact:true}).fill(code);
  if(job) await page.getByRole('radiogroup',{name:"What's your job today?"}).getByRole('radio',{name:new RegExp(`^${job}`)}).click();
  await page.getByRole('button',{name:'Join',exact:true}).click();
}
/**
 * A test may join or sign in with its own name again (logging back in, a second phone), but a name another test
 * already used is a clash: it fails here, by name, rather than as a timeout on a screen that asked for a middle name.
 * Names are kept in the run's test database, as claims are, since each --repeat-each pass runs in a worker of its own.
 */
async function nameIsThisTests(name:string) {
  // The remote smoke check has no run database; its names carry its own run id.
  if(!process.env.E2E_TEST_DATABASE_URL) return;
  const key=name.trim().replace(/\s+/g,' '),{testId,titlePath,repeatEachIndex}=test.info(),title=`${titlePath.join(' › ')}${repeatEachIndex?` (repeat ${repeatEachIndex})`:''}`;
  const db=new pg.Client({connectionString:process.env.E2E_TEST_DATABASE_URL});await db.connect();
  try {
    await db.query('CREATE TABLE IF NOT EXISTS e2e_names(name text PRIMARY KEY,test text NOT NULL,title text NOT NULL)');
    const first=(await db.query('INSERT INTO e2e_names(name,test,title) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING test,title',[key,testId,title])).rows[0];
    if(first.test!==testId) throw new Error(`"${key}" already joined in "${first.title}", so "${title}" clashes with it: build names with ownName() so each test's are its own`);
  } finally {await db.end();}
}
/** Signs a new profile in as a volunteer through the API (Olympics password, then Create profile) and returns its session token. */
export async function signInThroughApi(request:APIRequestContext,name:string) {
  await nameIsThisTests(name);
  const {pass}=await (await request.post('/api/password',{data:{password:process.env.E2E_OLYMPICS_PASSWORD}})).json();
  const created=await request.post('/api/profiles',{data:{pass,name}});
  expect(created.ok()).toBe(true);
  return (await created.json()).token as string;
}
/**
 * Taps the back arrow in the header, one screen at a time, until it has gone back to the named screen
 * (the arrow's label says "Back to <to>"), for example back(page,'Results'). Wait for the screen to settle first.
 * Results and Day setup have no back arrow: from there the lead's bar goes to Races.
 */
export async function back(page:Page,to:string) {
  const arrow=page.getByRole('banner').getByRole('button',{name:/^Back to /}),races=leadsBar(page).getByRole('button',{name:'Races',exact:true});
  for(let tries=0;tries<6;tries++) {
    await expect(arrow.or(races).first()).toBeVisible();
    if(!await arrow.isVisible()) {if(to==='Races') return press(races);break;}
    const label=(await arrow.getAttribute('aria-label'))!,here=page.url();
    await arrow.click();
    if(label===`Back to ${to}`) return;
    await expect(page).not.toHaveURL(here);
  }
  throw new Error(`No way back to ${to}`);
}
/** On an event in Results: taps one of its tabs and waits for it to show. */
export async function eventTab(page:Page,name:'Heats'|'Final'|'Notes') {
  const tab=page.getByRole('navigation',{name:'Event'}).getByRole('button',{name,exact:true});
  await press(tab);await expect(tab).toHaveAttribute('aria-current','page');
}
// Race setup: every spec that needs a race entered or saved before it starts goes through these, so they are the one
// place that knows how a race is entered and saved. Each acts as the phone whose token it is given, in the race flow
// (ADR 0003), on the race the event is at: its final once it has one, else its latest race not saved, else a new next heat.
const bearer=(token:string)=>({authorization:`Bearer ${token}`});
async function postOk<T>(request:APIRequestContext,token:string,url:string,data:object) {
  const response=await request.post(url,{headers:bearer(token),data});
  expect(response.ok(),`${url}: ${await response.text()}`).toBe(true);
  return await response.json() as T;
}
/** The event's group in the races list. */
async function raceGroup(request:APIRequestContext,token:string,eventCode:string) {
  return ((await (await request.get('/api/races',{headers:bearer(token)})).json()) as RacesRead).groups.find(group=>group.event.code===eventCode)!;
}
/** The race the event is at as that phone sees it now, making its next heat when it has none. */
export async function flowRace(request:APIRequestContext,token:string,eventCode:string) {
  const group=await raceGroup(request,token,eventCode);
  const race=group.races.find(item=>item.kind==='final') ?? group.races.filter(item=>item.state!=='saved').at(-1);
  if(!race) return postOk<RaceFlowRead>(request,token,'/api/races',{eventCode,kind:'heat',number:group.nextHeat});
  return (await (await request.get(`/api/races/${race.id}`,{headers:bearer(token)})).json()) as RaceFlowRead;
}
/** Checks runners in to an individual event's race as that phone: the whole list, at the version it sees. */
export async function writeCheckIn(request:APIRequestContext,token:string,eventCode:string,runners:Array<number|{fix:number;to:number}>,keptWarnings:number[]=[]) {
  const {race}=await flowRace(request,token,eventCode);
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
  let {race}=await flowRace(request,token,eventCode);
  const url=`/api/races/${race.id}/order`;
  // A runner typed at the finish has no entry until a write adds it: added first, then placed.
  if(added.length) race=(await postOk<RaceFlowRead>(request,token,url,{raceId:race.id,version:race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added,keptWarnings})).race;
  const id=(wristband:number)=>race.parts.runners.value!.filter(isRunner).find(runner=>runner.wristband===wristband)!.id;
  return postOk<RaceFlowRead>(request,token,url,{raceId:race.id,version:race.parts.finish.version,order:order.map(id),didNotFinish:didNotFinish.map(id),didNotRun:didNotRun.map(id),added:[]});
}
/** Writes the times as that phone, in hundredths by place; `keptWrong` are the places (0-based) whose wrong time it kept. */
export async function writeTimes(request:APIRequestContext,token:string,eventCode:string,places:number[],keptWrong:number[]=[]) {
  const {race}=await flowRace(request,token,eventCode);
  return postOk<RaceFlowRead>(request,token,`/api/races/${race.id}/times`,{raceId:race.id,version:race.parts.times.version,places,keptWrong});
}
/**
 * Saves the event's race as that phone: marks every step not yet done done (That's everyone, Save the order, No more
 * finishers), which saves it once nothing blocks it.
 */
export async function submitRace(request:APIRequestContext,token:string,eventCode:string) {
  let flow=await flowRace(request,token,eventCode);
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
  // The server keeps only the places that are wrong, so keeping every place keeps any wrong one.
  await writeTimes(request,token,eventCode,places,places.map((_,index)=>index));
  const {race}=await submitRace(request,token,eventCode);
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
/** A phone or event name no other test in this run uses: the words, this project's name and, under --repeat-each, which repeat it is. */
export const ownName=(words:string)=>{const {project,repeatEachIndex}=test.info();return `${words} ${project.name}${repeatEachIndex?` ${repeatEachIndex}`:''}`;};
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
/** An event's card in the Results list, found by its event code. A card of an event with no races is under the closed "Not started" line: `notStartedCard`. */
export const resultsCard=(page:Page,code:string)=>page.getByRole('button').filter({has:page.locator('.rz-code-tag',{hasText:new RegExp(`^${code}$`)})});
/** The card of an event with no races yet: opens the Results list's "Not started" line, then answers the card. */
export async function notStartedCard(page:Page,code:string) {
  await press(page.locator('details:not([open]) > summary',{hasText:/^Not started \(\d+\)$/}));
  return resultsCard(page,code);
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
/**
 * Makes a team Still to run as that phone: typed into the heat the relay is at (its next heat when none is open), as the
 * start line's last Next does, with the four boxes (null for an empty box) and the wristbands whose warnings it kept,
 * then taken off again. Returns the race as it then stands.
 */
export async function writeTeam(request:APIRequestContext,token:string,relayCode:string,legs:Array<number|null>,{keptWarnings=[]}:{keptWarnings?:number[]}={}) {
  const heat=await flowRace(request,token,relayCode);
  const read=await flowPost(request,token,`/api/relays/${heat.group.event.id}/teams`,{legs,keptWarnings,joinRaceId:heat.race.id});
  const typed=read.race.parts.runners.value!.filter(isTeamEntry).at(-1)!;
  return flowPost(request,token,`/api/races/${heat.race.id}/teams/${typed.team.id}/take-off`,{});
}
/**
 * Teams typed ahead on the build before teams were made only in a heat, by its teams sheet: rows of the relay in no race,
 * numbered in the order given. They go straight into the e2e test database, as that build left them.
 */
export async function typedAhead(relayCode:string,teams:Array<Array<number|null>>) {
  const db=new pg.Client({connectionString:process.env.E2E_TEST_DATABASE_URL});await db.connect();
  try {
    for(const [index,legs] of teams.entries()) await db.query(`INSERT INTO relay_teams(id,event_id,number,legs,changed_by)
      SELECT gen_random_uuid(),e.id,$2,$3,'Typed ahead' FROM events e JOIN olympics_days d ON d.id=e.day_id AND d.active WHERE e.code=$1`,
      [relayCode,index+1,JSON.stringify(legs.map(wristband=>({wristband,warnings:[]})))]);
  } finally {await db.end();}
}
/** One race-flow write as that phone; fails unless the server accepts it, and returns the race as it then stands. */
export const flowPost=(request:APIRequestContext,token:string,url:string,data:object)=>postOk<RaceFlowRead>(request,token,url,data);
/** A relay Start line tap as that phone on the race the relay is at, naming the team by its number, as tapping it does. */
async function teamTap(request:APIRequestContext,token:string,relayCode:string,what:'tick'|'absent',number:number,data:object={}) {
  const read=await flowRace(request,token,relayCode);
  return flowPost(request,token,`/api/races/${read.race.id}/teams/${read.teams!.find(team=>team.number===number)!.id}/${what}`,data);
}
/** Adds Team `number` to the heat the relay is at as that phone, as Add does (anyone can: ADR 0002). */
export function tickTeam(request:APIRequestContext,token:string,relayCode:string,number:number) {
  return teamTap(request,token,relayCode,'tick',number);
}
/** Marks a relay final's teams Here as that phone, as its start line's Here does, naming each team by its number. */
export async function markFinalHere(request:APIRequestContext,token:string,relayCode:string,numbers:number[]) {
  for(const number of numbers) await teamTap(request,token,relayCode,'absent',number,{mark:'here'});
}
/**
 * Writes a relay heat's finishing order as that phone, naming teams by their number, at the version it sees. Every
 * team in the heat goes in `order`, `didNotFinish` or `didNotRun`; `addedTeams` (still to run) take the places after `order`.
 */
export async function writeTeamOrder(request:APIRequestContext,token:string,relayCode:string,order:number[],{didNotFinish=[],didNotRun=[],addedTeams=[]}:{didNotFinish?:number[];didNotRun?:number[];addedTeams?:number[]}={}) {
  const {race,teams}=await flowRace(request,token,relayCode);
  const id=(number:number)=>race.parts.runners.value!.filter(isTeamEntry).find(entry=>entry.team.number===number)!.id;
  return flowPost(request,token,`/api/races/${race.id}/order`,{raceId:race.id,version:race.parts.finish.version,order:order.map(id),didNotFinish:didNotFinish.map(id),didNotRun:didNotRun.map(id),added:[],addedTeams:addedTeams.map(number=>teams!.find(team=>team.number===number)!.id)});
}
/** Runs the heat the relay is at (its next heat when none is open) to saved through the race flow: its first `teams` teams still to run added, every child checked in, placed by number and timed. */
export async function runHeat(request:APIRequestContext,token:string,code:string,teams:number) {
  const post=(url:string,data:object)=>flowPost(request,token,url,data);
  let read=await flowRace(request,token,code);
  const id=read.race.id;
  for(const team of read.teams!.filter(item=>!item.races.length).slice(0,teams)) read=await post(`/api/races/${id}/teams/${team.id}/tick`,{});
  read=await post(`/api/races/${id}/steps/runners/done`,{});
  const order=(read.race.parts.runners.value||[]).filter(isTeamEntry).sort((a,b)=>a.team.number-b.team.number).map(entry=>entry.id);
  read=await post(`/api/races/${id}/order`,{raceId:id,version:read.race.parts.finish.version,order,didNotFinish:[],didNotRun:[],added:[]});
  read=await post(`/api/races/${id}/steps/positions/done`,{});
  read=await post(`/api/races/${id}/times`,{raceId:id,version:read.race.parts.times.version,places:order.map((_,index)=>1400+index*50),keptWrong:[]});
  read=await post(`/api/races/${id}/steps/times/done`,{});
  expect(read.race.state).toBe('saved');
  return read;
}
/**
 * Deletes the event's races not yet saved for good, as a lead does a race opened by mistake, so no race a test left
 * unsaved lingers on the shared test day. A saved race stays.
 */
export async function deleteCurrentRace(request:APIRequestContext,code:string) {
  const owner=process.env.E2E_OWNER_TOKEN!;
  const group=((await (await request.get('/api/races',{headers:bearer(owner)})).json()) as RacesRead).groups.find(item=>item.event.code===code)!;
  const ids=group.races.filter(race=>race.state!=='saved').map(race=>race.id);
  for(const id of ids) expect((await request.post(`/api/lead/races/${id}/delete`,{headers:bearer(owner),data:{permanent:true}})).ok()).toBe(true);
}
/**
 * From Races: taps a race's chip on its event group's card ("H1", "Final"), opening Done when the group is done, and
 * waits for the race: its Race screen, or for a lead on a saved race its race page.
 */
export async function openRace(page:Page,name:string,section='Girl Cubs',chip='H1') {
  // A chip is "Heat 1, saved": a lead's line under the chips ("Heat 1 has a tie to settle") names a heat too.
  const label=chip==='Final'?/^Final,/:new RegExp(`^Heat ${chip.slice(1)},`),card=page.getByRole('article',{name:`${name} · ${section}`,exact:true});
  // Once the races have come in, a group that is done waits under the closed Done disclosure.
  await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  const done=page.locator('details:not([open])',{has:page.locator('summary',{hasText:/^Done \(/})});
  // A live update can move the card under the closed Done between the look and the tap: look again until the tap lands.
  await expect(async()=>{
    if(!await card.isVisible() && await done.count()) await done.locator('summary').click();
    await card.getByRole('button',{name:label}).click({timeout:2000});
  }).toPass();
  const race=chip==='Final'?'Final':`Heat ${chip.slice(1)}`;
  await expect(page.getByRole('heading',{level:1,name:`${name} · ${section}`,exact:true}).or(page.getByRole('banner').getByRole('heading',{level:1,name:race,exact:true}))).toBeVisible();
}
/** On Races: the Relays tab. */
export async function openRelays(page:Page) {
  await page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:/^Relays/}).click();
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
/** A lead makes an event's final the one way there is: "+ Final" on its Races card, then Make the final, and back to Races. */
export async function makeFinal(page:Page,name:string,section:string) {
  await page.getByRole('article',{name:`${name} · ${section}`}).getByRole('button',{name:'Create the final from the fastest 6',exact:true}).click();
  await page.getByRole('dialog',{name:`Have all ${section} heats run?`,exact:true}).getByRole('button',{name:'Make the final',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} · ${section}`,exact:true})).toBeVisible();
  await backToRaces(page);
}
/** The final made by the owner from the fastest heats, everyone marked Here, placed in this order and saved. */
export async function saveFinal(request:APIRequestContext,code:string,order:number[]) {
  const token=process.env.E2E_OWNER_TOKEN!,headers={authorization:`Bearer ${token}`};
  expect((await request.post('/api/races',{headers,data:{eventCode:code,kind:'final'}})).ok()).toBe(true);
  const {race}=await flowRace(request,token,code);
  const here=race.final!.entries.map(entry=>entry.finalEntryId);
  expect((await request.post(`/api/races/${race.id}/absent`,{headers,data:{raceId:race.id,version:race.parts.runners.version,here,absent:[]}})).ok()).toBe(true);
  await writeOrder(request,token,code,order);
  await submitRace(request,token,code);
}
/**
 * Opens the race's actions sheet and taps one of its buttons ("Correct times", "Delete Heat 1"): by the race page's
 * button with words ("Correct or delete Heat 1"), or by "⋯" on the race screen.
 */
export async function raceAction(page:Page,action:string) {
  await press(page.getByRole('main').getByRole('button',{name:/^(Correct or delete|Restore or delete|Delete) (Heat \d+|Final)$/}).or(page.getByRole('banner').getByRole('button',{name:'Race actions',exact:true})));
  await press(page.getByRole('dialog',{name:/ · actions$/}).getByRole('button',{name:action,exact:true}));
}
/** The Confirm the medals screen's medal places, one row per place ("1st 2041 Heat 2 · 10.00 Fix"). */
export const medalPlaces=(page:Page)=>page.getByRole('list',{name:'Medal places',exact:true}).getByRole('listitem');
/** On the Confirm the medals screen: taps its docked Confirm the medals, which goes back where the screen was opened. */
export async function confirmTheMedals(page:Page) {
  // The bar names the screen; nothing below it says so again.
  await expect(page.getByRole('heading',{name:'Confirm the medals',exact:true})).toHaveCount(1);
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Confirm the medals',exact:true})).toBeVisible();
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Confirm the medals',exact:true}));
  await expect(page.getByRole('banner').getByRole('heading',{level:1,name:'Confirm the medals',exact:true})).toHaveCount(0);
}
/** A card's or race's chips as they read, in order: "H1", "Add heat 2", "F", "+ Final". */
export const chipTexts=(within:Locator)=>within.getByRole('list',{name:'Heats',exact:true}).getByRole('button').evaluateAll(chips=>chips.map(chip=>chip.textContent||chip.getAttribute('aria-label')));
/** The job band below the top bar on Races and on a race ("Your role is Finish line"); a tap opens the job sheet. */
export const jobBand=(page:Page,job='.*')=>page.getByRole('button',{name:new RegExp(`^Your role is ${job}\\. Change job$`)});
/** Switches today's job from the job band on Races or a race, as a volunteer does. */
export async function switchJob(page:Page,job:JobName) {
  await press(page.getByRole('button',{name:/^Your role is .*\. Change job$/}));
  await page.getByRole('radiogroup',{name:'What\'s your job today?'}).getByRole('radio',{name:new RegExp(`^${job}`)}).click();
}
/** From the job band: Zone lead, then the lead code (or the owner password). */
export async function becomeLead(page:Page,code=process.env.E2E_LEAD_CODE!) {
  await press(page.getByRole('button',{name:/^Your role is .*\. Change job$/}));
  await page.getByRole('radio',{name:/^Zone lead/}).click();
  await page.getByLabel('Lead code',{exact:true}).fill(code);
  await page.getByRole('button',{name:'Switch to Zone lead',exact:true}).click();
  await expect(page.getByRole('button',{name:'Your role is Zone lead. Change job'})).toBeVisible();
}
/** The lead's bar (Races, Results, Day setup), at the foot of every lead screen on a lead's phone only: there, it shows that the phone is a lead's. The Race screen has none. */
export function leadsBar(page:Page) {
  return page.getByRole('navigation',{name:'Lead screens',exact:true});
}
/** From any screen as a lead: the lead's bar's Results or Day setup tab; from a Race screen, back along the back arrow to Races first. */
export async function openLeadsBarTab(page:Page,name:'Results'|'Day setup') {
  const tab=leadsBar(page).getByRole('button',{name,exact:true}),arrow=page.getByRole('banner').getByRole('button',{name:/^Back to /});
  for(let tries=0;tries<6;tries++) {
    await expect(tab.or(arrow).first()).toBeVisible();
    if(await tab.isVisible()) return press(tab);
    const here=page.url();
    await press(arrow);await expect(page).not.toHaveURL(here);
  }
  throw new Error(`No way back to the lead's bar`);
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
      // A person stops over the place before letting go. A finger lifted while still moving is a flick: Chromium on
      // Linux (CI) then takes the next tap as the one that stops the flick and sends no click for it.
      if(touch) {await page.waitForTimeout(100);await finger('touchMove');await finger('touchEnd');await cdp!.detach();} else await page.mouse.up();
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
 * The toast after a lead save: just its line, with no Undo (Undo is only for a race step) and no "Saved" pill anywhere.
 * Returns the toast, for a look check while it shows.
 */
export async function expectToast(page:Page,line:string|RegExp) {
  const toast=page.getByRole('status').filter({hasText:line});
  await expect(toast).toHaveText(line);
  await expect(toast.getByRole('button')).toHaveCount(0);
  await expect(page.getByText('Saved',{exact:true})).toHaveCount(0);
  return toast;
}
/**
 * Pulls down from the top of the screen, past the point where the hint says "Let go to refresh", and lets go: the
 * one way to refresh by hand. The finger is sent the same way on the laptop project, which has no Refresh button either.
 */
export async function pullToRefresh(page:Page) {
  await page.evaluate(()=>scrollTo(0,0));
  const touch=await page.context().newCDPSession(page);
  const send=(type:'touchStart'|'touchMove'|'touchEnd',y?:number)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:y===undefined?[]:[{x:180,y}]});
  await send('touchStart',200);for(let y=220;y<=520;y+=20) await send('touchMove',y);
  await expect(page.locator('.rz-pull')).toHaveText('Let go to refresh');
  // Letting go there refreshes. "Refreshing…" shows for under a second, and the read may change the screen, so only the let-go is waited for.
  await send('touchEnd');await touch.detach();
  await expect(page.locator('.rz-pull[data-state="ready"]')).toHaveCount(0);
}
/** A phone taps; desktop has no touch, so it clicks. Both press the mouse down, which a button that keeps typing cancels. */
// eslint-disable-next-line no-restricted-syntax -- the one place a tap belongs.
export const press=(target:Locator,force=false)=>test.info().project.use.hasTouch?target.tap({force}):target.click({force});
/** Each target shows whole without scrolling: the page is at its top, and each sits between the top of the screen and the footer or the lead's bar, whichever is higher (or the keyboard). */
export async function inViewAboveFooter(page:Page,targets:Locator[]) {
  const {scrolled,visible,footer}=await page.evaluate(()=>({scrolled:scrollY,visible:visualViewport?visualViewport.offsetTop+visualViewport.height:innerHeight,
    footer:Math.min(...['footer.rz-footer','.rz-leads-bar'].map(foot=>document.querySelector(foot)?.getBoundingClientRect().top??Infinity))}));
  expect(scrolled).toBe(0);
  for(const target of targets) {
    const box=(await target.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y+box.height,`${await target.textContent()} above the footer`).toBeLessThanOrEqual(Math.min(visible,footer)+0.5);
  }
}
/**
 * The Approved colour pairs table of docs/running-zone-design-system/accessibility.md as computed colours ("30,43,81 on
 * 240,231,211"), with each colour's token name for the report. Token values come from tokens.json.
 */
const approvedColours=(()=>{
  const docs=new URL('../docs/running-zone-design-system/',import.meta.url);
  const tokens=new Map<string,string>(JSON.parse(readFileSync(new URL('tokens.json',docs),'utf8')).color.tokens.map(({name,value}:{name:string;value:string})=>[name,value]));
  const colour=(name:string):string=>{const value=tokens.get(name);if(!value) throw new Error(`No colour token ${name}`);return value.startsWith('{')?colour(value.slice(1,-1)):[1,3,5].map(at=>parseInt(value.slice(at,at+2),16)).join(',');};
  const doc=readFileSync(new URL('accessibility.md',docs),'utf8'),table=doc.slice(doc.indexOf('## Approved colour pairs'),doc.indexOf('## Pairs that fail'));
  const pairs=[...table.matchAll(/^\| `([\w-]+)` \| `([\w-]+)` \|/gm)].map(([,text,ground])=>`${colour(text)} on ${colour(ground)}`);
  if(pairs.length<40) throw new Error('Read the approved colour pairs from accessibility.md');
  return {pairs,names:Object.fromEntries([...tokens.keys()].reverse().map(name=>[colour(name),name]))};
})();
/**
 * Every rule of the look that can be measured on the screen currently shown. Every screen renders inside the Running
 * Zone screen root (`.rz-screen`) and follows the design system (docs/running-zone-design-system/accessibility.md):
 * 44px targets, WCAG AA contrast and only its approved colour pairs, with display capitals from CSS.
 */
export async function lookProblems(page:Page) {
  // A control just tapped is still pressed for a moment, then grows back from its pressed size (140 ms): measure once that has ended.
  await page.waitForFunction(()=>!document.querySelector('.rz-screen :active'));
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(animation=>!(animation.effect?.getTiming().iterations===Infinity)).map(animation=>animation.finished.catch(()=>{}))));
  await page.evaluate(()=>document.fonts.ready);
  return page.evaluate(approved=>{
    const problems:string[]=[];
    const visible=(element:Element)=>{const box=element.getBoundingClientRect();const style=getComputedStyle(element);return box.width>0&&box.height>0&&style.visibility!=='hidden'&&style.display!=='none';};
    const describe=(element:Element)=>`${element.tagName.toLowerCase()} "${(element.textContent||element.getAttribute('aria-label')||'').trim().slice(0,40)}"`;
    const rgb=(value:string)=>value.match(/[\d.]+/g)!.map(Number);
    const luminance=(value:string)=>{const [r,g,b]=rgb(value).slice(0,3).map(channel=>{const c=channel/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;});return 0.2126*r+0.7152*g+0.0722*b;};
    const background=(element:Element|null):string=>{
      for(let current=element;current;current=current.parentElement) {
        const value=getComputedStyle(current).backgroundColor;if(rgb(value)[3]!==0) return value;
        // Tabs with a sliding cell: the tab the cell is on shows the cell's colour, not the bar's.
        const cell=current.parentElement?.querySelector(':scope > .rz-tab-cell');
        if(cell) {const on=cell.getBoundingClientRect(),box=current.getBoundingClientRect(),middle=box.x+box.width/2;if(middle>on.left&&middle<on.right) return getComputedStyle(cell).backgroundColor;}
      }
      return 'rgb(255, 255, 255)';
    };
    for(const target of document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary')) {
      if(!visible(target)) continue;
      const box=(target.matches('input[type=radio],input[type=checkbox]')&&target.closest('label')?target.closest('label')!:target).getBoundingClientRect();
      if(box.height<43.5||box.width<43.5) problems.push(`tap target ${describe(target)} is ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    // Nothing shows outside a screen root: the older look is gone. One clock; no button beside the Updated at line.
    for(const element of document.body.querySelectorAll(':not(script,style)')) {
      if(visible(element) && !element.closest('.rz-screen') && !element.querySelector('.rz-screen')) problems.push(`outside the screen root ${describe(element)}`);
    }
    if(/\b\d{1,2}:\d\d(:\d\d)?\s?(AM|PM)\b/i.test(document.body.innerText)) problems.push('a 12-hour clock is shown');
    for(const button of document.querySelectorAll('.rz-refresh button')) if(visible(button)) problems.push(`refresh button ${describe(button)}`);
    // The step strip: each cell's label and status on one line, and the labels in line across the strip.
    for(const strip of document.querySelectorAll('.rz-steps')) {
      if(!visible(strip)) continue;
      for(const line of strip.querySelectorAll('.rz-step__label,.rz-step__status')) if(line.getBoundingClientRect().height>parseFloat(getComputedStyle(line).lineHeight)*1.5) problems.push(`wrapped ${describe(line)}`);
      const tops=[...strip.querySelectorAll('.rz-step__label')].map(label=>Math.round(label.getBoundingClientRect().top));
      if(new Set(tops).size>1) problems.push(`step labels out of line ${describe(strip)}`);
    }
    // A prompt's line above its question ("Heat 1 · drag a handle to move a runner") on one line, never a word left on a second.
    for(const meta of document.querySelectorAll('.rz-prompt__meta')) if(visible(meta)&&meta.getBoundingClientRect().height>parseFloat(getComputedStyle(meta).lineHeight)*1.5) problems.push(`wrapped ${describe(meta)}`);
    // A button's label on one line: every line box of its text starts at the same height.
    for(const button of document.querySelectorAll('.rz-btn')) {
      if(!visible(button)) continue;
      const lines=[...button.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).flatMap(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()];});
      if(lines.length && Math.max(...lines.map(line=>line.top))-Math.min(...lines.map(line=>line.top))>Math.min(...lines.map(line=>line.height))/2) problems.push(`wrapped ${describe(button)}`);
    }
    // A phone's footer spans the screen with its content on the 20px gutter, and the Updated-at line is centred in it (Races has it at the left of its one row).
    for(const footer of document.querySelectorAll('.rz-footer')) {
      if(!visible(footer) || innerWidth>=600) continue;
      const box=footer.getBoundingClientRect(),style=getComputedStyle(footer);
      if(Math.abs(box.left)>0.5||Math.abs(box.right-document.documentElement.clientWidth)>0.5||parseFloat(style.paddingLeft)!==20||parseFloat(style.paddingRight)!==20) problems.push(`footer off the gutter ${describe(footer)}`);
      for(const child of footer.children) {
        const edge=child.getBoundingClientRect();
        if(visible(child)&&(edge.left<box.left+19.5||edge.right>box.right-19.5)) problems.push(`footer content off the gutter ${describe(child)}`);
      }
      for(const line of footer.matches('.rz-footer--home')?[]:footer.querySelectorAll('.rz-refresh')) {
        const range=document.createRange();range.selectNodeContents(line);const text=range.getBoundingClientRect();
        if(Math.abs((text.left-box.left)-(box.right-text.right))>1) problems.push(`not centred ${describe(line)}`);
      }
    }
    // A choice group's label starts in line with its buttons.
    for(const group of document.querySelectorAll('.rz-screen fieldset')) {
      const legend=group.querySelector(':scope > legend'),first=group.querySelector('.rz-choices > *');
      if(!legend||!first||!visible(legend)||!visible(first)) continue;
      const range=document.createRange();range.selectNodeContents(legend);
      if(Math.abs(range.getBoundingClientRect().left-first.getBoundingClientRect().left)>0.5) problems.push(`label out of line ${describe(legend)}`);
    }
    // A section heading sits nearer the cards it heads than what is above it.
    for(const heading of document.querySelectorAll('.rz-main > .rz-section')) {
      const above=heading.previousElementSibling??heading.parentElement!.previousElementSibling,below=heading.nextElementSibling;
      if(!visible(heading)||!above||!below) continue;
      const box=heading.getBoundingClientRect();
      if(box.top-above.getBoundingClientRect().bottom<=below.getBoundingClientRect().top-box.bottom) problems.push(`heading closer to what is above ${describe(heading)}`);
    }
    // No empty tag (an event code still on its way), and an open menu never covers the avatar that opened it.
    for(const tag of document.querySelectorAll('.rz-code-tag')) if(visible(tag)&&!tag.textContent!.trim()) problems.push('empty code tag');
    for(const menu of document.querySelectorAll('[role=menu]')) {
      if(!visible(menu)) continue;
      const area=menu.getBoundingClientRect();
      for(const avatar of document.querySelectorAll('.rz-avatar')) {
        const box=avatar.getBoundingClientRect();
        if(visible(avatar)&&area.left<box.right&&area.right>box.left&&area.top<box.bottom&&area.bottom>box.top) problems.push(`menu covers ${describe(avatar)}`);
      }
    }
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let node=walker.nextNode();node;node=walker.nextNode()) {
      const element=node.parentElement!;
      // A greyed-out button's label is exempt, but not a Timer slot's: slots held while a warning waits must still read.
      if(!node.textContent!.trim()||!visible(element)||element.closest('[aria-hidden=true],button:disabled:not(.rz-slot),script,style')) continue;
      const style=getComputedStyle(element);
      const size=parseFloat(style.fontSize);
      const [a,b]=[luminance(style.color),luminance(background(element))].sort((x,y)=>y-x);
      const ratio=(a+0.05)/(b+0.05),large=size>=24||size>=19&&Number(style.fontWeight)>=700;
      if(ratio<(large?3:4.5)) problems.push(`text ${describe(element)} contrast ${ratio.toFixed(2)}`);
      // Only the design system's approved colour pairs, whatever their contrast.
      const pair=`${rgb(style.color).slice(0,3).join(',')} on ${rgb(background(element)).slice(0,3).join(',')}`;
      if(!approved.pairs.includes(pair)) problems.push(`text ${describe(element)} is an unapproved colour pair ${pair.replace(/[\d,]+/g,colour=>approved.names[colour]??`rgb(${colour})`)}`);
    }
    return problems;
  },approvedColours);
}
// Tabs with a sliding cell (SlidingTabs.tsx): the lead's bar and the pill tabs. Each set is a `<nav>` found by its label.
/** One frame of a set of tabs: the tab marked current, and where the cell is, counted in tabs from the first (0.5: halfway between the first two). */
export type CellSample={tab:string;at:number};
type CellWatch=Window&{cellTrace:CellSample[];cellThen?:string};
/**
 * For `page.addInitScript(watchCell,label)`: runs in the page from its first moment. On every frame it notes a
 * CellSample of the tabs with that label. A frame the same as the one before is not noted, so a cell that never moved
 * leaves one sample. With a tab named by `cellThen`, it presses that tab once the cell is a fifth of a tab on its way:
 * a second tap while the cell moves.
 */
export function watchCell(label:string) {
  const traced=window as unknown as CellWatch;traced.cellTrace=[];
  const frame=()=>{
    const nav=document.querySelector(`nav[aria-label="${label}"]`),moving=nav?.querySelector('.rz-tab-cell'),tabs=[...nav?.querySelectorAll('button')??[]];
    if(moving && tabs.length>1) {
      // Measured between middles: a pressed tab shrinks a little about its middle, which must not read as the cell moving.
      const middle=(element:Element)=>{const box=element.getBoundingClientRect();return box.x+box.width/2;};
      const first=middle(tabs[0]),tab=tabs.find(button=>button.getAttribute('aria-current')==='page')?.textContent??'';
      const sample={tab,at:Math.round((middle(moving)-first)/(middle(tabs[1])-first)*100)/100+0},last=traced.cellTrace.at(-1);
      if(!last || last.tab!==sample.tab || last.at!==sample.at) traced.cellTrace.push(sample);
      if(traced.cellThen && sample.at>0.2) {tabs.find(button=>button.textContent===traced.cellThen)!.click();delete traced.cellThen;}
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
/** What the watched page noted since the last call, the frame now on the screen included. */
export const cellTrace=(page:Page)=>page.evaluate(()=>new Promise<CellSample[]>(resolve=>requestAnimationFrame(()=>resolve((window as unknown as CellWatch).cellTrace.splice(0)))));
/** The watched page presses this tab itself once the cell is a fifth of a tab on its way. */
export const cellThen=(page:Page,name:string)=>page.evaluate(then=>{(window as unknown as CellWatch).cellThen=then;},name);
/** Where the watched cell is on the frame now on the screen. */
export const cellAt=(page:Page)=>page.evaluate(()=>(window as unknown as CellWatch).cellTrace.at(-1)?.at);
/** The cell of these tabs is at rest on the tab: the tab's place and size. */
export async function cellOn(tabs:Locator,name:string) {
  await expect.poll(async()=>{
    const [on,under]=await Promise.all([tabs.locator('.rz-tab-cell'),tabs.getByRole('button',{name,exact:true})].map(part=>part.evaluate(el=>{const box=el.getBoundingClientRect();return [box.x,box.y,box.width,box.height];})));
    return Math.max(...on.map((edge,index)=>Math.abs(edge-under[index])));
  },name).toBeLessThanOrEqual(0.5);
}
/** With reduced motion nothing of these tabs is set to move: no transition on the cell's place, nor on a tab's colour or size. */
export async function stillTabs(tabs:Locator) {
  for(const part of [tabs.locator('.rz-tab-cell'),...await tabs.getByRole('button').all()]) expect(await part.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
}
/** The cell slid from one tab's place to another's: it started where it was, passed between the tabs and never went back. */
export function cellSlid(samples:CellSample[],from:number,to:number,into:string) {
  const places=samples.map(sample=>sample.at),arrived=samples.findIndex(sample=>sample.tab===into),seen=JSON.stringify(samples);
  // Right after the change the cell is still where it was: it did not jump.
  expect(Math.abs(places[arrived]-from),seen).toBeLessThanOrEqual(0.05);
  expect(places.some(place=>place>Math.min(from,to)+0.05 && place<Math.max(from,to)-0.05),seen).toBe(true);
  expect(places.slice(arrived),seen).toEqual([...places.slice(arrived)].sort((a,b)=>to>from?a-b:b-a));
  expect(places.at(-1),seen).toBe(to);
}
export { expect };
export type { APIRequestContext,Locator,Page };
