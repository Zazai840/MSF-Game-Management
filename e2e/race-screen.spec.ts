import { expect,live,lookProblems,signInThroughApi,test } from './fixtures.js';

test('a phone on the race screen shows the check-in, order and times another phone makes, live and without a reload',async({openPhone,request},info)=>{
  const project=info.project.name,code=`LS-${project.toUpperCase()}`,name=`Live sprint ${project}`,scoring={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  expect((await request.post('/api/day/events',{headers:scoring,data:{code,name,section:'Girl Cubs',format:'heats'}})).ok()).toBe(true);
  const sam=await openPhone(`Sam live ${project}`),jo={authorization:`Bearer ${await signInThroughApi(request,`Jo live ${project}`)}`};
  const page=sam.page;
  await page.getByRole('region',{name,exact:true}).getByRole('button',{name:`${name} Girl Cubs · Heat 1`,exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} Girl Cubs`,exact:true})).toBeVisible();
  await expect(page.getByText('Heat 1 · 0 runners',{exact:true})).toBeVisible();
  const checkIn=page.getByRole('button',{name:/^Check-in Wristbands/}),orderAndTimes=page.getByRole('button',{name:/^Order and Times/});
  await checkIn.click();await orderAndTimes.click();
  await expect(checkIn).toHaveAttribute('aria-expanded','true');await expect(orderAndTimes).toHaveAttribute('aria-expanded','true');
  await expect(page.getByText('No runners checked in yet',{exact:true})).toBeVisible();
  let loads=0;page.on('load',()=>loads++);

  const race=(await (await request.post('/api/races/check-in',{headers:jo,data:{eventCode:code,runners:[2041,2042]}})).json()).race;
  await expect(page.getByText('Heat 1 · 2 runners',{exact:true})).toBeVisible(live);
  await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText(['2041','2042'],live);
  await request.post(`/api/races/${race.id}/finish`,{headers:jo,data:{baseVersion:0,runnersVersion:1,order:[2042,2041],didNotFinish:[],didNotRun:[],added:[]}});
  const table=page.getByRole('table',{name:'Order and times'});
  await expect(table.getByRole('row')).toHaveText([/^Place\s*Wristband\s*Time$/,/^1st\s*2042\s*$/,/^2nd\s*2041\s*$/],live);
  // One time for two finishers does not count yet, so Heat 1 stays on the screen.
  await request.post(`/api/races/${race.id}/times`,{headers:jo,data:{baseVersion:0,places:[1234]}});
  await expect(table.getByRole('row')).toHaveText([/^Place/,/^1st\s*2042\s*12\.34$/,/^2nd\s*2041\s*$/],live);
  await page.screenshot({path:info.outputPath('race-screen-live.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  // Once Heat 1 counts the event moves on: Heat 2 with empty cards.
  await request.post(`/api/races/${race.id}/times`,{headers:jo,data:{baseVersion:1,places:[1234,1301]}});
  await expect(page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible(live);
  await expect(page.getByText('No runners checked in yet',{exact:true})).toBeVisible();
  await expect(page.getByText('Places appear here once runners are checked in',{exact:true})).toBeVisible();
  expect(loads).toBe(0);
  await page.getByRole('button',{name:'Back to Home',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Which event are you at?'})).toBeVisible();
});
