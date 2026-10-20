import { deleteCurrentRace,enterWristband,enterTime,expect,live,lookProblems,nextBeside,openRaceScreen,ownEvent,test,type Page } from './fixtures.js';
const orderCard=(page:Page)=>page.getByRole('button',{name:/^Order and Times/});
const rows=(page:Page)=>page.getByRole('table',{name:'Order and times'}).getByRole('row');
test('three phones: check-in, the order and the times, each seeing the others\' columns live, with a wrong time kept',async({openPhone,request},info)=>{
  const project=info.project.name,code=`T3-${project.toUpperCase()}`,name=`Times sprint ${project}`,priya=`Priya times ${project}`;
  await ownEvent(request,code,name);
  const sam=(await openPhone(`Sam times ${project}`)).page,orderer=(await openPhone(priya)).page,timer=(await openPhone(`Jo times ${project}`)).page;
  await openRaceScreen(sam,name);await sam.getByRole('button',{name:/^Check-in Wristbands/}).click();
  for(const number of [2201,2202,2203,2204]) await enterWristband(sam,number);
  await openRaceScreen(orderer,name);await orderCard(orderer).click();await orderer.getByRole('button',{name:'Do the order',exact:true}).click();
  // The times are the one free column, so opening the card takes them.
  await openRaceScreen(timer,name);await orderCard(timer).click();
  await expect(orderCard(timer)).toHaveAccessibleName(`Order and Times Order: ${priya} · Times: You`);
  // No place has a wristband yet, so there is nothing to time.
  await expect(timer.getByText('The next time goes in once 1st place has a wristband.',{exact:true})).toBeVisible();
  await expect(timer.getByLabel('Place time',{exact:true})).toHaveCount(0);
  await orderer.getByRole('button',{name:'2202',exact:true}).click();
  await expect(timer.getByRole('heading',{name:'1st place time?',exact:true})).toBeVisible(live);
  await expect(rows(timer)).toHaveText([/^Place/,/^1st\s*2202\s*Next$/,/^2nd\s*$/,/^3rd\s*$/,/^4th\s*$/]);
  await orderer.getByRole('button',{name:'2201',exact:true}).click();await orderer.getByRole('button',{name:'2203',exact:true}).click();
  await expect(rows(timer)).toHaveText([/^Place/,/^1st\s*2202\s*Next$/,/^2nd\s*2201\s*$/,/^3rd\s*2203\s*$/,/^4th\s*$/],live);
  await timer.getByLabel('Place time',{exact:true}).fill('1234');await expect(timer.getByText('Shows as 12.34',{exact:true})).toBeVisible();
  expect(await lookProblems(timer)).toEqual([]);await timer.screenshot({path:info.outputPath('times-entry.png'),fullPage:true});
  await nextBeside(timer,'Place time').click();
  await expect(rows(orderer)).toHaveText([/^Place/,/^1st\s*2202\s*12\.34$/,/^2nd\s*2201\s*$/,/^3rd\s*2203\s*$/,/^4th\s*Next\s*$/],live);
  await expect(timer.getByRole('heading',{name:'2nd place time?',exact:true})).toBeVisible();
  await enterTime(timer,'1301');
  // The 3rd place time is faster than 2nd: amber on every phone, and Fix time or Keep on the timer's.
  await enterTime(timer,'1290');
  const warning=timer.getByRole('alert').filter({hasText:'The 3rd place time is faster than 2nd.'});
  await expect(warning).toBeVisible();
  await orderCard(sam).click();
  await expect(rows(sam)).toHaveText([/^Place/,/^1st\s*2202\s*12\.34$/,/^2nd\s*2201\s*13\.01$/,/^3rd\s*2203\s*12\.90Faster than 2nd place$/,/^4th\s*$/],live);
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(sam.getByText('Kept as typed. A zone lead will check it.',{exact:true})).toBeVisible(live);
  await expect(timer.getByText('The next time goes in once 4th place has a wristband.',{exact:true})).toBeVisible();
  expect(await lookProblems(timer)).toEqual([]);await timer.screenshot({path:info.outputPath('times-review.png'),fullPage:true});
  await sam.screenshot({path:info.outputPath('times-watching.png'),fullPage:true});
  // Every placed wristband needs a time: Submit Race waits for the 4th.
  await orderer.getByRole('button',{name:'2204',exact:true}).click();
  for(const page of [sam,orderer,timer]) await expect(page.getByText('Place 4 has no time',{exact:true})).toBeVisible(live);
  await expect(sam.getByRole('button',{name:'Submit Race',exact:true})).toBeDisabled();
  await enterTime(timer,'1350');
  for(const page of [sam,orderer,timer]) await expect(page.getByRole('button',{name:'Submit Race',exact:true})).toBeEnabled(live);
  await deleteCurrentRace(request,code);
});
