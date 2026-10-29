import {ownCode,backToRaces,expect,leadMenuButton,lookProblems,openLeadMenu,openRace,ownEvent,recordRace,submitRace,test,writeCheckIn,writeOrder,writeTimes,type Page} from './fixtures.js';
/**
 * A zone lead in the race flow: no To check screen. Issues live on races: a lead's Ready for you is the groups with
 * open issues, each card names them, and inside a race each issue sits on the step it is about, with It's right or the
 * way to settle it. Results and Day setup are in the lead menu.
 */
const card=(page:Page,name:string,section='Girl Cubs')=>page.getByRole('article',{name:`${name} · ${section}`,exact:true});
const status=(page:Page,name:string)=>card(page,name).locator('.rz-racecard__status');
const readyForYou=(page:Page)=>page.locator('h2:text-is("Ready for you") ~ article');
const owner=()=>process.env.E2E_OWNER_TOKEN!;

test('a lead\'s Ready for you is the groups with open issues, each card naming them, and the lead menu opens Results and Day setup',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Lead issues ${project}`,calm=`Lead calm ${project}`,code=await ownCode(),calmCode=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');await ownEvent(request,calmCode,calm,'Girl Cubs','timed');
  // A kept time faster than the place before, and a calm race.
  await recordRace(request,owner(),code,[2001,2002],[1600,1305]);
  await recordRace(request,owner(),calmCode,[2011],[1400]);
  const {page}=await openPhone(`Lead issues ${project}`,{lead:true});
  await expect(page.getByRole('button',{name:'Your job: Zone lead. Change job',exact:true})).toBeVisible();
  await expect(status(page,name)).toHaveText('Heat 1: A time looks wrong');
  await expect(readyForYou(page).filter({hasText:name})).toHaveCount(1);
  await expect(readyForYou(page).filter({hasText:calm})).toHaveCount(0);
  await page.locator('details',{hasText:/^Done \(\d+\)/}).locator('summary').click();
  await expect(status(page,calm)).toHaveText('Every race saved');
  await expect(card(page,name).getByRole('button',{name:/^Heat 1/})).toHaveAccessibleName('Heat 1, saved');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-races.png'),fullPage:true});
  // The avatar's menu: Results, Day setup and your details.
  await leadMenuButton(page).click();
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['Results','Day setup','Your details']);
  await page.screenshot({path:info.outputPath('lead-menu.png')});
  await page.getByRole('menuitem',{name:'Results',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expect(page.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  await expect(page.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
});

test('inside a race each issue sits on its step\'s tab; It\'s right clears it and records who accepted it',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Lead tabs ${project}`,code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');
  // A kept wrong-section number, a runner added at the finish, and a kept wrong time.
  await writeCheckIn(request,owner(),code,[3045,2001],[3045]);
  await writeOrder(request,owner(),code,[3045,2001,2002],{added:[2002]});
  await writeTimes(request,owner(),code,[1500,1300,1600],[1]);
  await submitRace(request,owner(),code);
  const {page}=await openPhone(`Lead tabs ${project}`,{lead:true});
  await expect(status(page,name)).toContainText('Heat 1: ');
  await openRace(page,name);
  const tabs=page.getByRole('tablist',{name:'Heat 1 steps'});
  await expect(tabs.getByRole('tab')).toHaveText([/^Runners.*1 to check$/,/^Positions.*1 to check$/,/^Times.*1 to check$/]);
  // Runners: the kept number, with Fix and It's right.
  const runners=page.getByRole('alert').filter({hasText:'3045'});
  await expect(runners).toContainText('A wristband number needs checking. 3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999. Correct it or mark it checked.');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-runners.png'),fullPage:true});
  await runners.getByRole('button',{name:"It's right",exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'3045'})).toHaveCount(0);
  await expect(tabs.getByRole('tab',{name:/^Runners/})).not.toContainText('to check');
  // Positions: the runner added at the finish.
  await tabs.getByRole('tab',{name:/^Positions/}).click();
  await expect(tabs.getByRole('tab',{name:/^Positions/})).toHaveAttribute('aria-selected','true');
  const added=page.getByRole('alert').filter({hasText:'2002'});
  await expect(added).toBeVisible();
  await added.getByRole('button',{name:"It's right",exact:true}).click();
  await expect(added).toHaveCount(0);
  // Times: the kept wrong time, joined to its wristband by place.
  await tabs.getByRole('tab',{name:/^Times/}).click();
  const time=page.getByRole('alert').filter({hasText:'A time looks wrong'});
  await expect(time).toContainText('2nd place (13.00) is faster than 1st (15.00). The timer kept it as typed.');
  await expect(page.getByRole('list',{name:'Times'}).getByRole('listitem')).toHaveText([/^1st\s*3045\s*15\.00/,/^2nd\s*2001\s*13\.00/,/^3rd\s*2002\s*16\.00/]);
  await page.screenshot({path:info.outputPath('lead-times-issue.png'),fullPage:true});
  await time.getByRole('button',{name:"It's right",exact:true}).click();
  await expect(time).toHaveCount(0);
  await expect(tabs.getByRole('tab')).not.toContainText(['to check']);
  // Nothing left to check: the card says so on Races, and the accepted issues name who accepted them.
  await backToRaces(page);
  await page.locator('details',{hasText:/^Done \(\d+\)/}).locator('summary').click();
  await expect(status(page,name)).toHaveText('Every race saved');
  const notes=(await (await request.get(`/api/lead/events/${code}/results`,{headers:{authorization:`Bearer ${owner()}`}})).json()).auditNotes.map((note:{action:string})=>note.action);
  expect(notes).toEqual(expect.arrayContaining(['mark-warning-checked','mark-added-checked']));
});

test('an issue settled elsewhere opens in Results, and the race actions open over the race',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Lead results ${project}`,code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');
  // 2001 has a result in two races: the lead chooses which counts, in Results.
  await recordRace(request,owner(),code,[2001,2002],[1200,1300]);
  await recordRace(request,owner(),code,[2001],[1250],[2001]);
  const {page}=await openPhone(`Lead results ${project}`,{lead:true});
  await openRace(page,name,'Girl Cubs','H2');
  const ranTwice=page.getByRole('alert').filter({hasText:'2001'});
  await expect(ranTwice).toBeVisible();
  await expect(ranTwice.getByRole('button',{name:"It's right",exact:true})).toHaveCount(0);
  await ranTwice.getByRole('button',{name:'Open in Results',exact:true}).click();
  // The event's results, with the runner's actions open.
  await expect(page.getByRole('heading',{level:1,name:`${name} Girl Cubs`,exact:true})).toBeVisible();
  const sheet=page.getByRole('dialog',{name:'Actions for 2001'});
  await expect(sheet.getByRole('heading',{name:'Runner 2001',exact:true})).toBeVisible();
  await sheet.getByRole('button',{name:'Choose which result counts',exact:true}).click();
  await sheet.getByLabel('Count Heat 2',{exact:true}).check();
  await sheet.getByRole('button',{name:'Save counted result',exact:true}).click();await expect(sheet).toHaveCount(0);
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  await openRace(page,name,'Girl Cubs','H2');
  await expect(page.getByRole('alert').filter({hasText:'2001'})).toHaveCount(0);
  // "⋯" opens the race actions over the race.
  await page.getByRole('button',{name:'Race actions: re-run, delete, correct, disqualify',exact:true}).click();
  const actions=page.getByRole('dialog',{name:'Race actions'});
  await expect(actions.getByRole('button',{name:'Correct times',exact:true})).toBeVisible();
  await actions.screenshot({path:info.outputPath('race-actions.png')});
  await page.keyboard.press('Escape');
  await expect(actions).toHaveCount(0);
});
