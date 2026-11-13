import {expect,flowPost,live,lookProblems,ownCode,ownName,ownRelay,ownWristbands,press,runHeat,test,writeTeam,type Page} from './fixtures.js';
/** A team's card on the final's start line, by its name ("Team 1"). */
const card=(page:Page,team:number)=>page.getByRole('region',{name:`Team ${team}`,exact:true});
const prompt=(page:Page)=>page.getByRole('heading',{level:2});
const box=(page:Page)=>page.locator('main .rz-field__input');
const footer=(page:Page)=>page.locator('footer.rz-footer');

test('"+ Team" at a relay final: one child\'s number finds the team, shown before it is added with a reason, Here as Added; a wrong add marked Absent frees the place',async({openPhone,request},info)=>{
  const name=ownName('Relay final plus team'),code=await ownCode();
  await ownRelay(code,name,'Girl Scouts');
  const n=await ownWristbands('Girl Scouts',32),legs=(number:number)=>[1,2,3,4].map(leg=>n((number-1)*4+leg));
  const sam=await openPhone(ownName('Sam Patel plus team')),lead=await openPhone(ownName('Jo Evans plus team'),{lead:true});
  // Seven teams run the heat (Teams 1 to 6 the fastest); Team 8 is typed after it.
  for(let number=1;number<=7;number++) await writeTeam(request,sam.token,code,legs(number),{keptWarnings:legs(number)});
  await runHeat(request,sam.token,code,7);
  await writeTeam(request,sam.token,code,legs(8),{keptWarnings:legs(8)});
  const final=await flowPost(request,lead.token,'/api/races',{eventCode:code,kind:'final'}),finalId=final.race.id;
  const page=sam.page,plus=page.getByRole('button',{name:'+ Team',exact:true});
  await page.goto(`/races/${finalId}`);
  await expect(prompt(page)).toHaveText('Which teams are here?');
  // No finalist Absent: no place is free.
  await expect(plus).toHaveCount(0);
  for(const number of [1,2,3,4,6]) await press(card(page,number).getByRole('button',{name:`Team ${number}: Here`,exact:true}));
  await press(card(page,5).getByRole('button',{name:'Team 5: Absent',exact:true}));
  await expect(plus).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);

  await press(plus);
  await expect(prompt(page)).toHaveText("Team to add: one child's wristband number?");
  // A team already in the final, and a number in no team, are refused.
  await box(page).fill(String(legs(3)[1]));
  await press(footer(page).getByRole('button',{name:'Find team',exact:true}));
  await expect(page.getByRole('alert')).toContainText('Team 3 is already in the Final');
  await press(page.getByRole('alert').getByRole('button',{name:'Fix number',exact:true}));
  await box(page).fill('6999');
  await press(footer(page).getByRole('button',{name:'Find team',exact:true}));
  await expect(page.getByRole('alert')).toContainText('6999 is in no team');
  await press(page.getByRole('alert').getByRole('button',{name:'Fix number',exact:true}));
  // One child's number finds Team 8, shown with its four children before it is added.
  await box(page).fill(String(legs(8)[2]));
  await press(footer(page).getByRole('button',{name:'Find team',exact:true}));
  const found=page.getByRole('list',{name:'Team to add',exact:true}).getByRole('listitem');
  await expect(found).toHaveText(`Team 8${legs(8).join(' · ')}Add`);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-final-plus-team-found.png'),fullPage:true});
  // Add asks "Why the change?", with no Wrong number on an add; Cancel adds nothing and keeps the team shown.
  await press(found.getByRole('button',{name:'Add Team 8',exact:true}));
  const why=page.getByRole('dialog',{name:'Why the change?',exact:true});
  await expect(why.locator('.rz-choice')).toHaveText(['Did not want to run','Hurt','Not found','Other']);
  expect(await lookProblems(page)).toEqual([]);
  await why.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(why).toHaveCount(0);
  await expect(found).toHaveText(`Team 8${legs(8).join(' · ')}Add`);
  await press(found.getByRole('button',{name:'Add Team 8',exact:true}));
  await why.getByRole('button',{name:'Not found',exact:true}).click();
  await why.getByRole('button',{name:'Save',exact:true}).click();

  // Back at check-in: Team 8 is Added and Here; six are Here, so no place is free.
  await expect(page.locator('p.rz-note[role=status]')).toHaveText('Team 8 added');
  await expect(prompt(page)).toHaveText('Which teams are here?');
  await expect(card(page,8).getByRole('heading',{level:3})).toHaveText('Added · Team 8');
  await expect(card(page,8).getByRole('button',{name:'Team 8: Here',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(card(page,8).locator('.rz-legchip')).toHaveText(legs(8).map((wristband,index)=>`${['1st','2nd','3rd','4th'][index]}${wristband}`));
  await expect(plus).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('relay-final-plus-team-added.png'),fullPage:true});
  // A wrong add is undone by marking the team Absent: the place is free again.
  await press(card(page,8).getByRole('button',{name:'Team 8: Absent',exact:true}));
  await expect(plus).toBeVisible();

  // The lead's Final tab lists the added team, with no "+ Team"; the Notes tab has the note.
  await lead.page.goto(`/results/${code}/final`);
  await lead.page.getByText('Line-up, fastest first',{exact:true}).click();
  await expect(lead.page.getByRole('list',{name:'Line-up, fastest first'}).getByRole('listitem').last()).toHaveText(`Added · Team 8 · ${legs(8).join(' · ')} · Absent · no final place`,live);
  await expect(lead.page.getByRole('button',{name:'+ Team',exact:true})).toHaveCount(0);
  await lead.page.goto(`/results/${code}/notes`);
  await expect(lead.page.getByRole('list',{name:'Audit notes'})).toContainText(`added Team 8 to the Final - Not found`);
});
