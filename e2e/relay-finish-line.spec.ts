import type { RaceFlowRead } from '../src/shared/race-flow.js';
import {ownName,enterTime,expect,live,lookProblems,ownCode,ownRelay,ownWristbands,test,writeTeam,type Page} from './fixtures.js';
const meta=(page:Page)=>page.locator('.rz-prompt__meta');
const tiles=(page:Page)=>page.getByRole('list',{name:'Teams not yet placed'}).getByRole('button');
const places=(page:Page)=>page.getByRole('list',{name:/^Places: /});
const orderRows=(page:Page)=>page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
const notPlaced=(page:Page,team:number)=>page.getByRole('list',{name:'Not placed'}).getByRole('group',{name:`Team ${team}`,exact:true});
const footer=(page:Page)=>page.locator('footer.rz-footer');

/** How many lines an element's text takes. */
const lines=(element:Element)=>{const range=document.createRange();range.selectNodeContents(element);return new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size;};

test('four phones run a relay heat to saved: two start lines, the finish line placing team tiles, and the timer, with no Submit Race',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Relay finish');
  await ownRelay(code,name,'Girl Cubs');
  const w=await ownWristbands('Girl Cubs',15);
  const sam=await openPhone(ownName('Sam Patel relay start')),priya=await openPhone(ownName('Priya Shah relay start'));
  const finish=await openPhone(ownName('Finish relay'),{job:'finish'}),timer=await openPhone(ownName('Timer relay'),{job:'timer'});
  await writeTeam(request,sam.token,code,[w(11),w(12),w(13),w(14)]);
  await writeTeam(request,sam.token,code,[w(21),w(22),w(23),w(24)]);
  await writeTeam(request,sam.token,code,[w(31),w(32),w(33),null]);
  await writeTeam(request,sam.token,code,[w(41),w(42),w(43),w(44)]);
  const made=await request.post('/api/races',{headers:{authorization:`Bearer ${sam.token}`},data:{eventCode:code,kind:'heat',number:1}});
  expect(made.ok(),await made.text()).toBe(true);
  const raceId=((await made.json()) as RaceFlowRead).race.id;
  const read=async()=>await (await request.get(`/api/races/${raceId}`,{headers:{authorization:`Bearer ${sam.token}`}})).json() as RaceFlowRead;
  for(const phone of [sam,priya,finish,timer]) await phone.page.goto(`/races/${raceId}`);
  const [one,two,line,clock]=[sam.page,priya.page,finish.page,timer.page];

  // Both start lines put teams in and mark children here; That's everyone marks Runners done.
  const stillToRun=(page:Page)=>page.getByRole('list',{name:'Still to run'});
  await stillToRun(one).getByRole('button',{name:'Add Team 1',exact:true}).click();
  await stillToRun(two).getByRole('button',{name:'Add Team 2',exact:true}).click();
  await expect(stillToRun(two).getByRole('button',{name:'Add Team 3',exact:true})).toBeVisible();
  await stillToRun(two).getByRole('button',{name:'Add Team 3',exact:true}).click();
  await one.getByRole('button',{name:`${w(14)}: Here`,exact:true}).click();
  await two.getByRole('button',{name:`${w(24)}: Here`,exact:true}).click();
  await expect(meta(one)).toHaveText('Heat 1 · 3 teams · 2 children here',live);
  await footer(one).getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(one.locator('.rz-toast')).toContainText('Runners saved');

  // The finish line: team tiles two to a row on a phone (wider screens add columns, race-flow.css), "Team 1" over its 4th leg's wristband, "–" with no 4th leg.
  await expect(tiles(line)).toHaveCount(3,live);
  await expect(meta(line)).toHaveText('Heat 1 · 3 teams · 3 to place');
  await expect(line.getByRole('heading',{level:2,name:'Which team came 1st?'})).toBeVisible();
  await expect(tiles(line)).toHaveText([`Team 1${w(14)}`,`Team 2${w(24)}`,'Team 3–']);
  await expect(line.getByRole('button',{name:`Team 1, 4th leg ${w(14)}, came 1st`,exact:true})).toBeVisible();
  await expect(line.getByRole('button',{name:'Team 3, no 4th leg, came 1st',exact:true})).toBeVisible();
  const [a,b,c]=await Promise.all([0,1,2].map(index=>tiles(line).nth(index).boundingBox()));
  const phone=line.viewportSize()!.width<700;
  expect(a!.y).toBe(b!.y);if(phone) expect(c!.y).toBeGreaterThan(a!.y);else expect(c!.y).toBe(a!.y);expect(a!.width).toBeGreaterThan(140);
  const [name1,number1]=await tiles(line).first().locator('span').evaluateAll(spans=>spans.map(span=>getComputedStyle(span).fontSize));
  expect(name1).toBe(number1);
  expect(await lookProblems(line)).toEqual([]);
  await line.screenshot({path:info.outputPath('relay-finish-line.png'),fullPage:true});
  await line.getByRole('button',{name:`Team 2, 4th leg ${w(24)}, came 1st`,exact:true}).click();
  // The places board names a placed team "T2"; a slip on it reads Changing, with Keep.
  await expect(places(line).getByRole('button',{name:'1st place: Team 2. Change',exact:true})).toHaveText('1stT2');
  await places(line).getByRole('button',{name:'1st place: Team 2. Change',exact:true}).click();
  await expect(line.getByText('Changing 1st: Team 2',{exact:true})).toBeVisible();
  await line.screenshot({path:info.outputPath('relay-finish-line-changing.png'),fullPage:true});
  await line.getByRole('button',{name:'Keep Team 2',exact:true}).click();
  await expect(line.getByRole('heading',{level:2,name:'Which team came 2nd?'})).toBeVisible();

  // + Team not on the list picks from the teams still to run, with no typing; the team takes the next place.
  await footer(line).getByRole('button',{name:'+ Team not on the list',exact:true}).click();
  const sheet=line.getByRole('dialog',{name:'Team not on the list'});
  await expect(sheet.getByRole('textbox')).toHaveCount(0);
  await expect(sheet.getByRole('listitem')).toHaveCount(1);
  await expect(sheet.getByRole('listitem')).toContainText(`${w(41)} · ${w(42)} · ${w(43)} · ${w(44)}`);
  expect(await lookProblems(line)).toEqual([]);
  await line.screenshot({path:info.outputPath('relay-team-not-on-the-list.png')});
  await sheet.getByRole('button',{name:'Add Team 4',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  await expect(places(line).getByRole('button',{name:'2nd place: Team 4. Change',exact:true})).toHaveText('2ndT4');
  await footer(line).getByRole('button',{name:'+ Team not on the list',exact:true}).click();
  await expect(sheet.getByText('Every team is in a heat already.',{exact:true})).toBeVisible();
  await sheet.getByRole('button',{name:'Close',exact:true}).click();

  // Check the order: rows read "Team 2 · 2024"; each team left needs Did not finish or Didn't run.
  await footer(line).getByRole('button',{name:'No other team crossed the line',exact:true}).click();
  await expect(line.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await expect(orderRows(line)).toHaveText([`1stTeam 2 · ${w(24)}`,`2ndTeam 4 · ${w(44)}`]);
  await expect(line.getByRole('button',{name:`Move Team 2 · ${w(24)}`,exact:true})).toBeVisible();
  await expect(line.getByRole('list',{name:'Not placed'}).getByRole('group')).toHaveText([`Team 1 · ${w(14)}Did not finishDidn't run`,"Team 3 · –Did not finishDidn't run"]);
  await footer(line).getByRole('button',{name:'Save the order',exact:true}).click();
  await expect(line.getByRole('alert')).toContainText('Say what happened to 2 teams first.');
  await notPlaced(line,1).getByRole('button',{name:'Did not finish',exact:true}).click();
  await notPlaced(line,3).getByRole('button',{name:"Didn't run",exact:true}).click();
  expect(await lookProblems(line)).toEqual([]);
  // Each part of a Not placed row stays on one line, even on a 360px phone.
  for(const team of [1,3]) for(const part of [notPlaced(line,team).locator('.rz-orderrow__num'),...['Did not finish',"Didn't run"].map(label=>notPlaced(line,team).getByRole('button',{name:label,exact:true}))])
    expect(await part.evaluate(lines)).toBe(1);
  await line.screenshot({path:info.outputPath('relay-check-the-order.png'),fullPage:true});
  await footer(line).getByRole('button',{name:'Save the order',exact:true}).click();
  await expect(line.locator('.rz-toast')).toContainText('Finishing order saved');

  // The timer: one time per team, to its 4th leg crossing; the last time saves the heat itself.
  await expect(meta(clock)).toHaveText("Heat 1 · time each team's 4th leg",live);
  await expect(clock.getByRole('list',{name:'Place times'}).getByRole('listitem')).toHaveCount(2);
  expect(await lookProblems(clock)).toEqual([]);
  await clock.screenshot({path:info.outputPath('relay-timer.png'),fullPage:true});
  await enterTime(clock,'1412');
  await enterTime(clock,'1530');
  await expect(clock.locator('.rz-toast')).toContainText('Times saved · Girl Cubs Heat 1');
  expect((await read()).race.state).toBe('saved');
  for(const page of [one,two,line,clock]) await expect(page.getByRole('button',{name:/Submit/})).toHaveCount(0);
  // The team that didn't run is back among those still to run.
  expect((await read()).teams!.find(team=>team.number===3)!.races).toEqual([]);
  // Undo on the toast un-saves it.
  await clock.locator('.rz-toast').getByRole('button',{name:'Undo',exact:true}).click();
  await expect.poll(async()=>(await read()).race.state).toBe('in progress');
});
