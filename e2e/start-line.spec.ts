import { savedRaceLabel,jobButton,expect,createProfile,openRaceScreen,ownEvent,recordRace,test,type Page } from './fixtures.js';
async function typeNumber(page:Page,number:number) {await page.getByLabel('Wristband number',{exact:true}).fill(String(number));}
test('a volunteer checks in a race, keeps a failed save and corrects the saved runners',async({page},info)=>{
  await page.request.post('/api/day/events/R4/rename',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{name:'60m'}});
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{}});
  await page.goto('/');
  await createProfile(page,`Start ${info.project.name}`);
  await jobButton(page,'Start line').click();
  await page.getByRole('button',{name:'60m',exact:true}).click();
  await page.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();
  await typeNumber(page,2001);await page.getByRole('button',{name:'Next',exact:true}).click();
  await typeNumber(page,2001);await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('2001 is already in this race');await page.getByRole('button',{name:'Fix number',exact:true}).click();
  for(const number of [2002,2003,2004,2005,2006]) {await typeNumber(page,number);await page.getByRole('button',{name:'Next',exact:true}).click();}
  await page.screenshot({path:info.outputPath('start-line-entry.png'),fullPage:true});
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check the runners',exact:true})).toBeVisible();await expect(page.getByText('6 runners lined up',{exact:true})).toBeVisible();
  await page.route('**/api/races/check-in',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary connection problem'})}));
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText('Not saved - tap Save again',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Thank you. Your responses have been saved.',exact:true})).toHaveCount(0);
  await expect(page.getByText('2006',{exact:true})).toBeVisible();
  await page.reload();
  await jobButton(page,'Start line').click();
  await expect(page.getByText('6 runners lined up',{exact:true})).toBeVisible();
  await page.unroute('**/api/races/check-in');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await savedRaceLabel(page);
  await page.getByRole('button',{name:'Edit runners',exact:true}).click();
  await page.getByRole('button',{name:'Remove runner 2006',exact:true}).click();
  await page.getByRole('button',{name:"That's everyone",exact:true}).click();
  await expect(page.getByText('5 runners lined up',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByTestId('saved-race')).toContainText('5 runners');
  await page.getByRole('button',{name:'Delete this race',exact:true}).click();
  await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Which race is it?',exact:true})).toBeVisible();
});
test('a volunteer fixes an unknown number and keeps wrong-section and already-ran warnings on the race screen',async({openPhone,request},info)=>{
  const project=info.project.name,code=`WN-${project.toUpperCase()}`,name=`Warning sprint ${project}`;
  await ownEvent(request,code,name);
  // 2008 ran in Heat 1, which is saved, so Heat 2 is the current race.
  await recordRace(request,process.env.E2E_SCORING_TOKEN!,code,[2008],[1234]);
  const {page}=await openPhone(`Warnings ${project}`);
  await openRaceScreen(page,name);
  await expect(page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Check-in Wristbands/}).click();
  await typeNumber(page,0);await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('0 is not a wristband number. Wristbands are 1 to 4999.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(page.getByLabel('Wristband number',{exact:true})).toHaveValue('');
  await typeNumber(page,2009);await page.getByRole('button',{name:'Next',exact:true}).click();
  await typeNumber(page,3045);await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('wristband-warning.png'),fullPage:true});
  await page.getByRole('button',{name:'Keep',exact:true}).click();
  await typeNumber(page,2008);await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('2008 already ran in another race of this event.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(page.getByText('Heat 2 · 3 runners',{exact:true})).toBeVisible();
  // The kept warnings are on the server's list: they show on every phone, and go to To check.
  for(const [number,dot] of [[2009,0],[3045,1],[2008,1]] as const) await expect(page.getByRole('button',{name:`Remove runner ${number}`,exact:true}).locator('.kept-dot')).toHaveCount(dot);
  const lead={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  const items=(await (await request.get('/api/lead/results',{headers:lead})).json()).needsYou.filter((item:{event:{code:string}})=>item.event.code===code);
  expect(items.map((item:{wristband?:number})=>item.wristband)).toEqual(expect.arrayContaining([3045,2008]));
});
