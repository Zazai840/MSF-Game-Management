import { back,toCheckItem,openDashboard,dashboardMenuButton,jobButton,becomeLead,expect,createProfile,test,type Page } from './fixtures.js';

const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
const row=(page:Page)=>page.getByRole('navigation',{name:'Back',exact:true});
/** The back arrow shows bare at the left of the row under the header, names where it goes and is at least 44px to tap. */
async function arrowGoesBackTo(page:Page,to:string) {
  const arrow=row(page).getByRole('button',{name:`Back to ${to}`,exact:true});
  await expect(arrow).toBeVisible();
  await expect(arrow).toHaveText('');
  const box=(await arrow.boundingBox())!,header=(await page.locator('.app-header').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeLessThan(page.viewportSize()!.width/4);expect(box.y).toBeGreaterThanOrEqual(header.y+header.height);expect(box.y).toBeLessThan(header.y+header.height+40);
  await expect(page.getByRole('navigation',{name:'Steps'})).toHaveCount(0);
}
async function onHome(page:Page) {
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  await expect(row(page)).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Steps'})).toHaveCount(0);
}

test("Home has no back arrow and keeps I'm a zone lead on the right; every volunteer screen goes back to Home",async({page},info)=>{
  await page.goto('/');await createProfile(page,`Back arrow volunteer ${info.project.name}`);
  await onHome(page);
  const zoneLead=page.getByRole('button',{name:"I'm a zone lead",exact:true}),box=(await zoneLead.boundingBox())!;
  expect(box.x+box.width).toBeGreaterThan(page.viewportSize()!.width/2);
  await page.screenshot({path:info.outputPath('home.png'),fullPage:true});

  await zoneLead.click();
  await arrowGoesBackTo(page,'Home');
  await page.screenshot({path:info.outputPath('become-lead.png'),fullPage:true});
  await back(page,'Home');await onHome(page);

  for(const job of ['Start line','Finish order','Times'] as const) {
    await jobButton(page,job).click();
    await arrowGoesBackTo(page,'Home');
    await page.screenshot({path:info.outputPath(`${job}.png`),fullPage:true});
    await back(page,'Home');await onHome(page);
  }
});

test('on lead screens the back arrow goes up one level: event results to Results, Results and a To check race to the Dashboard, the Dashboard to Home',async({page},info)=>{
  const code=`BA-${info.project.name.toUpperCase()}`,event='Back arrow sprint Girl Cubs';
  await page.request.post('/api/day/events',{headers:headers(),data:{code,name:'Back arrow sprint',section:'Girl Cubs',format:'timed'}});await page.request.post('/api/day/confirm-events',{headers:headers(),data:{}});
  // A 2nd place faster than 1st puts the race on To check.
  const race=(await(await page.request.post('/api/races/check-in',{headers:headers(),data:{eventCode:code,runners:[2021,2022]}})).json()).race;
  await page.request.post(`/api/races/${race.id}/finish`,{headers:headers(),data:{baseVersion:0,runnersVersion:1,order:[2021,2022],didNotFinish:[],didNotRun:[],added:[]}});
  await page.request.post(`/api/races/${race.id}/times`,{headers:headers(),data:{baseVersion:0,places:[1600,1305]}});
  try {
    await page.goto('/');await createProfile(page,`Back arrow lead ${info.project.name}`);await becomeLead(page,'e2e-owner-fixture');
    await openDashboard(page);
    await arrowGoesBackTo(page,'Home');
    await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true});

    await dashboardMenuButton(page,'Results').click();
    await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
    await arrowGoesBackTo(page,'Dashboard');
    await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
    await expect(page.getByRole('heading',{level:1,name:event,exact:true})).toBeVisible();
    await arrowGoesBackTo(page,'Results');
    await page.screenshot({path:info.outputPath('event-results.png'),fullPage:true});
    await page.getByRole('button',{name:'Open Race 1',exact:true}).click();
    await arrowGoesBackTo(page,event);
    await page.screenshot({path:info.outputPath('race.png'),fullPage:true});
    await back(page,event);await expect(page.getByRole('button',{name:'Open Race 1',exact:true})).toBeVisible();
    await back(page,'Results');await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
    await back(page,'Dashboard');await expect(page.getByRole('heading',{level:1,name:'Dashboard',exact:true})).toBeVisible();

    await toCheckItem(page,new RegExp(code)).click();
    await expect(page.getByRole('button',{name:'Correct times',exact:true})).toBeVisible();
    await arrowGoesBackTo(page,'Dashboard');
    await back(page,'Dashboard');await expect(toCheckItem(page,new RegExp(code))).toBeVisible();

    await dashboardMenuButton(page,'Day setup').click();
    await arrowGoesBackTo(page,'Dashboard');
    await page.getByRole('button',{name:/^Events /}).click();
    await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
    await arrowGoesBackTo(page,'Day setup');
    await back(page,'Day setup');await back(page,'Dashboard');
    await back(page,'Home');await onHome(page);
  } finally {await page.request.post(`/api/lead/races/${race.id}/delete`,{headers:headers(),data:{permanent:true}});}
});
