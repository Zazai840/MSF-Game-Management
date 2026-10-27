import { deleteCurrentRace,expect,live,lookProblems,openRaceScreen,openRelays,ownRelay,readRaceScreen,signInThroughApi,submitRace,takeJob,test,tickTeam,writeTeam,writeTeamOrder,writeTimes,type APIRequestContext,type Page } from './fixtures.js';
/**
 * A relay's race screen keeps its jobs held one phone at a time, with Take over, and a heat saves on Submit Race from
 * every holder (ADR 0003). These were the race screen's tests on individual events, which now work in the race flow.
 */
const orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
const dockSays=(page:Page,text:string)=>expect(page.getByRole('status').filter({hasText:text})).toHaveText(text,live);
/** The relay's two teams, both ticked into Heat 1 by `token`. */
async function twoTeams(request:APIRequestContext,token:string,code:string) {
  for(const legs of [[2101,2102,2103,2104],[2201,2202,2203,2204]]) await writeTeam(request,token,code,legs,{keptWarnings:legs});
  await tickTeam(request,token,code,1);await tickTeam(request,token,code,2);
}
async function openRelay(page:Page,name:string) {await openRelays(page);await openRaceScreen(page,name);}

test('Take over on a relay confirms in the card, carries on from what was entered, and the old holder\'s next write is refused',async({openPhone,request},info)=>{
  const project=info.project.name,code=`RT-${project.toUpperCase()}`,name=`Take over relay ${project}`,jo=`Jo relay takeover ${project}`,ali=`Ali relay takeover ${project}`;
  await ownRelay(code,name);
  const old=await openPhone(jo),taker=await openPhone(ali);
  await twoTeams(request,old.token,code);
  await takeJob(request,old.token,code,'order');
  await openRelay(taker.page,name);await orderCard(taker.page).click();
  await expect(taker.page.getByRole('button',{name:'Take over the order',exact:true})).toBeVisible();
  await taker.page.getByRole('button',{name:'Take over the order',exact:true}).click();
  await expect(taker.page.getByText(`Take over the order from ${jo}? ${jo}'s phone shows it read-only from now on. Everything already entered stays.`,{exact:true})).toBeVisible();
  await taker.page.screenshot({path:info.outputPath('take-over-confirm.png'),fullPage:true});
  expect(await lookProblems(taker.page)).toEqual([]);
  await taker.page.getByRole('button',{name:'Take over',exact:true}).click();
  await expect(orderCard(taker.page)).toHaveAccessibleName(/Order: You/);
  // Jo's phone, still showing the old holder, writes the order: refused, and the holder is the new one.
  const seen=await readRaceScreen(request,old.token,code);
  const refused=await request.post(`/api/race-screen/${code}/order`,{headers:{authorization:`Bearer ${old.token}`},data:{raceId:seen.race.id,version:seen.race.parts.finish.version,order:[],didNotFinish:[],didNotRun:[],added:[]}});
  expect(refused.status()).toBe(409);
  expect((await refused.json()).message).toBe(`${ali} took over the order`);
  await openRelay(old.page,name);await orderCard(old.page).click();
  await expect(orderCard(old.page)).toHaveAccessibleName(new RegExp(`Order: ${ali}`));
  await deleteCurrentRace(request,code);
});

test('Submit Race on a relay waits for every holder: every phone shows who it waits on, Not yet clears the presses, and the last press saves the heat',async({openPhone,request},info)=>{
  const project=info.project.name,code=`RS-${project.toUpperCase()}`,name=`Submit relay ${project}`,jo=`Jo relay submit ${project}`;
  await ownRelay(code,name);
  const priya=await openPhone(`Priya relay submit ${project}`),timer=await openPhone(jo),ali=await openPhone(`Ali relay submit ${project}`);
  await twoTeams(request,priya.token,code);
  await writeTeamOrder(request,priya.token,code,[2,1]);
  for(const phone of [priya,timer,ali]) await openRelay(phone.page,name);
  await expect(priya.page.getByText('Place 1 has no time',{exact:true})).toBeVisible();
  await expect(priya.page.getByRole('button',{name:'Submit Race',exact:true})).toBeDisabled();
  await writeTimes(request,timer.token,code,[1520,1610]);
  await expect(priya.page.getByRole('button',{name:'Submit Race',exact:true})).toBeEnabled(live);
  // Ali holds nothing, so is not asked.
  await expect(ali.page.getByRole('button',{name:'Submit Race',exact:true})).toHaveCount(0);
  await priya.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await dockSays(priya.page,`You submitted. Waiting on ${jo}`);
  await dockSays(ali.page,`Waiting on ${jo}`);
  await dockSays(timer.page,'Waiting on you');
  expect(await lookProblems(timer.page)).toEqual([]);
  await timer.page.screenshot({path:info.outputPath('submitted-asked.png'),fullPage:true});
  // Anyone may tap Not yet: it sends the heat back and clears every press.
  await ali.page.getByRole('button',{name:'Not yet',exact:true}).click();
  for(const page of [ali.page,timer.page]) await expect(orderCard(page)).toBeVisible(live);
  expect((await readRaceScreen(request,priya.token,code)).pressed).toEqual([]);
  // Both holders press again: the heat is saved on every phone, and the relay moves to its next heat.
  await submitRace(request,priya.token,code);
  await timer.page.getByRole('button',{name:'Submit Race',exact:true}).click();
  for(const phone of [priya,timer,ali]) await expect(phone.page.getByText('Heat 1 saved',{exact:true})).toBeVisible(live);
  await deleteCurrentRace(request,code);
});

test('a lead\'s Save as lead saves a relay heat stuck waiting on another phone, after a confirm',async({openPhone,request},info)=>{
  const project=info.project.name,code=`XQ-${project.toUpperCase()}`,name=`Save as lead relay ${project}`,jo=`Jo relay stuck ${project}`;
  await ownRelay(code,name);
  const timer=await signInThroughApi(request,jo),priya=await openPhone(`Priya relay stuck ${project}`);
  await twoTeams(request,priya.token,code);
  await writeTeamOrder(request,priya.token,code,[1,2]);await writeTimes(request,timer,code,[1500,1600]);
  await submitRace(request,priya.token,code);
  const alex=await openPhone(`Alex relay lead ${project}`,{lead:true});
  await openRelay(alex.page,name);await openRelay(priya.page,name);
  await dockSays(alex.page,`Waiting on ${jo}`);
  await expect(priya.page.getByRole('button',{name:'Save as lead',exact:true})).toHaveCount(0);
  await alex.page.getByRole('button',{name:'Save as lead',exact:true}).click();
  await expect(alex.page.getByText(`${jo} hasn't submitted. Save anyway?`,{exact:true})).toBeVisible();
  await alex.page.screenshot({path:info.outputPath('save-as-lead-confirm.png'),fullPage:true});
  expect(await lookProblems(alex.page)).toEqual([]);
  await alex.page.getByRole('button',{name:'Save anyway',exact:true}).click();
  for(const page of [alex.page,priya.page]) await expect(page.getByText('Heat 1 saved',{exact:true})).toBeVisible(live);
  // Jo's hold went with the save; Priya keeps the order on the next heat.
  expect(Object.keys((await readRaceScreen(request,priya.token,code)).holds)).toEqual(['order']);
  await deleteCurrentRace(request,code);
});
