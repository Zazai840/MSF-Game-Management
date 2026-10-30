import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,expect,live,lookProblems,ownCode,ownRelay,ownWristbands,test,writeTeam,type Page} from './fixtures.js';
const meta=(page:Page)=>page.locator('.rz-prompt__meta');
/** A team's card in this heat, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
/** A child's Here / Not yet in this heat, by wristband. */
const here=(page:Page,wristband:number)=>page.getByRole('button',{name:`${wristband}: Here`,exact:true});
const stillToRun=(page:Page)=>page.getByRole('list',{name:'Still to run'});

test('two start-line phones check a relay heat in at once: Add, Take off and every Here tap land on both, and That\'s everyone marks Runners done',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay start');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',11);
  const sam=await openPhone(ownName('Sam Patel start')),priya=await openPhone(ownName('Priya Shah start'));
  await writeTeam(request,sam.token,code,[w(11),w(12),w(13),w(14)]);
  await writeTeam(request,sam.token,code,[w(21),w(22),null,w(24)]);
  await writeTeam(request,sam.token,code,[w(31),w(32),w(33),w(34)]);
  const made=await request.post('/api/races',{headers:{authorization:`Bearer ${sam.token}`},data:{eventCode:code,kind:'heat',number:1}});
  expect(made.ok(),await made.text()).toBe(true);
  const raceId=((await made.json()) as RaceFlowRead).race.id;
  for(const phone of [sam,priya]) await phone.page.goto(`/races/${raceId}`);
  const [one,two]=[sam.page,priya.page];
  await expect(meta(one)).toHaveText('Heat 1 · 0 teams · 0 children here');
  await expect(one.getByRole('heading',{level:2,name:'Which teams are running?'})).toBeVisible();
  await expect(stillToRun(one).getByRole('listitem')).toHaveCount(3);
  const short=stillToRun(one).getByRole('listitem').nth(1);
  for(const text of ['Team 2',`${w(21)} · ${w(22)} · – · ${w(24)}`,'Runs short · 3 of 4']) await expect(short).toContainText(text);
  // Each phone adds a team; the other sees it at once.
  await stillToRun(one).getByRole('button',{name:'Add Team 1',exact:true}).click();
  await stillToRun(two).getByRole('button',{name:'Add Team 2',exact:true}).click();
  for(const page of [one,two]) {
    await expect(card(page,1)).toBeVisible(live);await expect(card(page,2)).toBeVisible(live);
    await expect(stillToRun(page).getByRole('listitem')).toHaveCount(1,live);
  }
  await expect(card(one,2)).toContainText('Runs short · 3 of 4');
  await expect(card(one,1).getByText('1st leg',{exact:true})).toBeVisible();
  // A short team's empty leg reads "–", with no Here, so it can be dragged to another leg.
  await expect(card(one,2).locator('.rz-attendance__who').nth(2)).toHaveText('3rd leg–');
  await expect(card(one,2).getByRole('button',{name:/: Here$/})).toHaveCount(3);
  await expect(here(one,w(11))).toHaveText('Not yet');
  // Both phones tap at once, on different children of one team: both land, with no version refusal.
  await Promise.all([here(one,w(11)).click(),here(two,w(12)).click()]);
  for(const page of [one,two]) {
    await expect(here(page,w(11))).toHaveAttribute('aria-pressed','true',live);
    await expect(here(page,w(12))).toHaveAttribute('aria-pressed','true',live);
    await expect(here(page,w(11))).toHaveText('Here');
    await expect(meta(page)).toHaveText('Heat 1 · 2 teams · 2 children here',live);
  }
  await expect(one.getByText('changed this a moment ago')).toHaveCount(0);
  // Take off only while none of the team's children is here.
  await expect(card(one,1).getByRole('button',{name:'Take off',exact:true})).toHaveCount(0);
  await card(two,2).getByRole('button',{name:'Take off',exact:true}).click();
  await expect(card(one,2)).toHaveCount(0,live);
  await expect(stillToRun(one).getByRole('listitem')).toHaveCount(2,live);
  await stillToRun(one).getByRole('button',{name:'Add Team 2',exact:true}).click();
  await expect(card(two,2)).toBeVisible(live);
  // The last tap on a child wins.
  await here(two,w(11)).click();
  await expect(here(one,w(11))).toHaveAttribute('aria-pressed','false',live);
  await expect(here(one,w(11))).toHaveText('Not yet');
  await here(one,w(11)).click();
  await expect(meta(two)).toHaveText('Heat 1 · 2 teams · 2 children here',live);
  // A short team's Edit and Take off sit where a full team's Edit does, beside the name, its note under the name.
  const top=async(team:number,button:string)=>(await card(one,team).getByRole('button',{name:button,exact:true}).boundingBox())!.y-(await card(one,team).boundingBox())!.y;
  const edit=await top(1,'Edit Team 1');
  expect(await top(2,'Edit Team 2')).toBeCloseTo(edit,0);
  expect(await top(2,'Take off')).toBeCloseTo(edit,0);
  const title=(await card(one,2).getByRole('heading',{name:'Team 2'}).boundingBox())!,note=(await card(one,2).getByText('Runs short · 3 of 4').boundingBox())!;
  expect(note.y).toBeGreaterThanOrEqual(title.y+title.height-1);
  expect(await lookProblems(one)).toEqual([]);
  await one.screenshot({path:info.outputPath('relay-start-line.png'),fullPage:true});
  await one.screenshot({path:info.outputPath('relay-start-line-viewport.png')});
  await one.locator('footer.rz-footer').getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(one.locator('.rz-toast')).toContainText('Runners saved · Girl Cubs Heat 1');
  const read=await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${priya.token}`}})).json() as RaceFlowRead;
  expect(read.steps.runners!.state).toBe('done');
});
