import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,expect,flowPost,live,lookProblems,openRelays,ownCode,ownRelay,ownWristbands,press,runHeat,test,typedAhead,writeTeam,racesListStream,type Page} from './fixtures.js';
/** A relay's card on the Relays tab, by its event name and section. */
const card=(page:Page,name:string,section='Girl Cubs')=>page.getByRole('article',{name:`${name} · ${section}`,exact:true});
/** The open sheet, by its title. */
const sheet=(page:Page,title:string)=>page.getByRole('dialog',{name:title,exact:true});

test('the Relays tab lists relays with heats as race-flow cards with no team list; a relay with teams typed ahead but no heats is not listed, and its first heat has them under Still to run with their numbers and Add',async({openPhone,request},info)=>{
  const running=ownName('Relay tab running'),ahead=ownName('Relay tab typed ahead'),empty=ownName('Relay tab empty'),w=await ownWristbands('Girl Cubs',12);
  const [runningCode,aheadCode,emptyCode]=[await ownCode(),await ownCode(),await ownCode()];
  for(const [code,name] of [[runningCode,running],[aheadCode,ahead],[emptyCode,empty]]) await ownRelay(code,name);
  const {page,token}=await openPhone(ownName('Sam Patel relay tab'));
  const heat=await flowPost(request,token,'/api/races',{eventCode:runningCode,kind:'heat',number:1});
  await flowPost(request,token,`/api/relays/${heat.group.event.id}/teams`,{legs:[w(1),w(2),w(3),w(4)],keptWarnings:[],joinRaceId:heat.race.id});
  // Two teams typed ahead in the teams sheet of the build before: in no race, Team 2 with three children.
  await typedAhead(aheadCode,[[w(5),w(6),w(7),w(8)],[w(9),w(10),null,w(12)]]);
  await openRelays(page);
  await expect(page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:'Relays',exact:true})).toHaveAttribute('aria-current','page');
  await expect(card(page,running).getByRole('button',{name:/^Heat 1, /})).toBeVisible();
  // No Teams row, no Teams ready, no heats yet, no New team: a relay with no heats is not listed, teams or not.
  await expect(card(page,running).getByRole('button',{name:/^Teams/})).toHaveCount(0);
  await expect(card(page,ahead)).toHaveCount(0);
  await expect(card(page,empty)).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Teams ready, no heats yet'})).toHaveCount(0);
  await expect(page.locator('footer').getByRole('button',{name:'New team'})).toHaveCount(0);
  await expect(page.locator('footer').getByRole('button',{name:'New relay',exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relays-tab.png'),fullPage:true});
  await page.screenshot({path:info.outputPath('relays-tab-viewport.png')});
  // + New relay lists the relays, and makes the chosen one's next heat.
  await press(page.getByRole('button',{name:'New relay',exact:true}));
  const newRelay=sheet(page,'New relay');
  await press(newRelay.getByRole('button',{name:ahead,exact:true}));
  await press(newRelay.getByRole('button',{name:/^Girl Cubs/}));
  await press(newRelay.getByRole('button',{name:'Create heat 1',exact:true}));
  await expect(page.getByRole('heading',{level:1,name:`${ahead} · Girl Cubs`,exact:true})).toBeVisible();
  // The typed-ahead teams keep their numbers: a team typed in is Team 3, and both wait under Still to run with Add.
  await expect(page.getByRole('heading',{level:2,name:'Team 3 · 1st leg: wristband number?',exact:true})).toBeVisible();
  const toRun=page.getByRole('list',{name:'Still to run',exact:true}).getByRole('listitem');
  await expect(toRun).toHaveCount(2);
  await expect(toRun.nth(0)).toContainText(`Team 1${w(5)} · ${w(6)} · ${w(7)} · ${w(8)}`);
  await expect(toRun.nth(1)).toContainText(`Team 2${w(9)} · ${w(10)} · – · ${w(12)}Runs short · 3 of 4`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('typed-ahead-still-to-run.png')});
  // Add checks the short team in whole.
  await press(page.getByRole('button',{name:'Add Team 2',exact:true}));
  await expect(page.getByRole('region',{name:'Team 2',exact:true})).toBeVisible();
  await expect(toRun).toHaveCount(1);
  await expect(page.getByText('1 team · 3 children here')).toBeVisible();
});

test('+ Final shows only in the Zone lead role, behind a confirm worded for teams, and the final\'s start line has the teams of the heats',async({openPhone,request})=>{
  const name=ownName('Relays tab final'),code=await ownCode(),w=await ownWristbands('Girl Cubs',8);
  await ownRelay(code,name);
  const sam=await openPhone(ownName('Sam Patel relay final')),lead=await openPhone(ownName('Jo Evans relay final'),{lead:true});
  for(const team of [1,2]) await writeTeam(request,sam.token,code,[w(team*4-3),w(team*4-2),w(team*4-1),w(team*4)]);
  await runHeat(request,sam.token,code,2);
  await openRelays(sam.page);
  await expect(card(sam.page,name)).toContainText('A lead makes the final once every heat has run.');
  await expect(card(sam.page,name).getByRole('button',{name:/Final/})).toHaveCount(0);
  await openRelays(lead.page);
  await press(card(lead.page,name).getByRole('button',{name:'Create the final from the fastest 6',exact:true}));
  const confirm=sheet(lead.page,'Have all Girl Cubs heats run?');
  await expect(confirm).toContainText('1 heat saved. The final takes the fastest 6 teams, and no more heats can be added.');
  await press(confirm.getByRole('button',{name:'Make the final',exact:true}));
  await expect(lead.page.getByRole('heading',{level:1,name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(card(sam.page,name).getByRole('button',{name:/^Final, /})).toBeVisible(live);
  const final=(await (await request.get('/api/races',{headers:{authorization:`Bearer ${sam.token}`}})).json()).groups.find((group:{event:{code:string}})=>group.event.code===code).races.find((race:{kind:string})=>race.kind==='final');
  expect(((await (await request.get(`/api/races/${final.id}`,{headers:{authorization:`Bearer ${sam.token}`}})).json()) as RaceFlowRead).race.final!.entries).toHaveLength(2);
});

test('New relay on a day with no relays switched on says so, and where a zone lead switches them on',async({openPhone,request},info)=>{
  const {page,token}=await openPhone(ownName('No relays volunteer'));
  // The day as it reads with every relay switched off: the races list without its relays.
  const day=await(await request.get('/api/races',{headers:{authorization:`Bearer ${token}`}})).json();
  const frame=`data: ${JSON.stringify({...day,revision:day.revision+1000000,groups:day.groups.filter((group:{event:{relay:boolean}})=>!group.event.relay)})}\n\n`;
  await page.route(racesListStream,route=>route.fulfill({status:200,contentType:'text/event-stream',body:frame}));
  await page.reload();
  await openRelays(page);
  await press(page.getByRole('button',{name:'New relay',exact:true}));
  const newRelay=sheet(page,'New relay');
  await expect(newRelay.getByRole('status')).toHaveText('This day has no relays. A zone lead can switch them on in Day setup, Events.');
  // Nothing to choose, so no greyed button that can never be pressed.
  await expect(newRelay.getByRole('button',{name:'Choose the event and section'})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('no-relays.png')});
});
