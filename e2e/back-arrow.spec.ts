import { back,becomeLead,expect,join,openLeadMenu,openRace,openTeams,ownEvent,recordRace,test,type Page } from './fixtures.js';

const row=(page:Page)=>page.getByRole('navigation',{name:'Back',exact:true});
/** The back arrow shows bare at the left of the row under the header, names where it goes and is at least 44px to tap. */
async function arrowGoesBackTo(page:Page,to:string) {
  const arrow=row(page).getByRole('button',{name:`Back to ${to}`,exact:true});
  await expect(arrow).toBeVisible();
  await expect(arrow).toHaveText('');
  const box=(await arrow.boundingBox())!,header=(await page.locator('.app-header').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeLessThan(page.viewportSize()!.width/4);expect(box.y).toBeGreaterThanOrEqual(header.y+header.height);expect(box.y).toBeLessThan(header.y+header.height+40);
}
async function onRaces(page:Page) {
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await expect(row(page)).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^Back to /})).toHaveCount(0);
}

test('Races has no back arrow; a race, your profile and the Teams screen each go back to Races',async({page,request},info)=>{
  const project=info.project.name,name=`Back arrow heat ${project}`;
  await ownEvent(request,`BH-${project.toUpperCase()}`,name);
  await page.goto('/');await join(page,`Back arrow volunteer ${project}`,{job:'Start line'});
  await onRaces(page);
  await request.post('/api/races',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{eventCode:`BH-${project.toUpperCase()}`,kind:'heat',number:1}});
  // A race's back link sits at the left of its app bar, 44px to tap.
  await openRace(page,name);
  const link=page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true}),box=(await link.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeLessThan(page.viewportSize()!.width/4);
  await page.screenshot({path:info.outputPath('race.png')});
  await link.click();await onRaces(page);
  await page.getByRole('button',{name:`Back arrow volunteer ${project}, your details`,exact:true}).click();
  await arrowGoesBackTo(page,'Races');
  await back(page,'Races');await onRaces(page);
  await openTeams(page);
  await arrowGoesBackTo(page,'Races');
  await back(page,'Races');await onRaces(page);
  await expect(page.getByRole('navigation',{name:'Event type'}).getByRole('button',{name:/^Relays/})).toHaveAttribute('aria-current','page');
});

test('on lead screens the back arrow goes up one level: a race to its event, event results to Results, Results and Day setup to Races',async({page,request},info)=>{
  const project=info.project.name,code=`BA-${project.toUpperCase()}`,name=`Back arrow sprint ${project}`,event=`${name} Girl Cubs`;
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2021,2022],[1600,1305]);
  await page.goto('/');await join(page,`Back arrow lead ${project}`,{job:'Start line'});await becomeLead(page,'e2e-owner-fixture');
  await openLeadMenu(page,'Results');
  await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await arrowGoesBackTo(page,'Races');
  await page.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  await expect(page.getByRole('heading',{level:1,name:event,exact:true})).toBeVisible();
  await arrowGoesBackTo(page,'Results');
  await page.screenshot({path:info.outputPath('event-results.png'),fullPage:true});
  await page.getByRole('button',{name:'Open Heat 1',exact:true}).click();
  await arrowGoesBackTo(page,event);
  await page.screenshot({path:info.outputPath('race.png'),fullPage:true});
  await back(page,event);await expect(page.getByRole('button',{name:'Open Heat 1',exact:true})).toBeVisible();
  await back(page,'Results');await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await back(page,'Races');await onRaces(page);
  await openLeadMenu(page,'Day setup');
  await arrowGoesBackTo(page,'Races');
  await page.getByRole('button',{name:/^Events /}).click();
  await expect(page.getByRole('heading',{level:1,name:'Events',exact:true})).toBeVisible();
  await arrowGoesBackTo(page,'Day setup');
  await back(page,'Day setup');await back(page,'Races');await onRaces(page);
  // A race opened from Races goes back there too.
  await openRace(page,name);
  await page.getByRole('banner').getByRole('button',{name:'Back to Races',exact:true}).click();await onRaces(page);
});
