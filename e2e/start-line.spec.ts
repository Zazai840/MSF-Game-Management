import { deleteCurrentRace,expect,openRaceScreen,ownEvent,recordRace,submitRace,test,writeOrder,writeTimes,type Page } from './fixtures.js';
async function typeNumber(page:Page,number:number) {await page.getByLabel('Wristband number',{exact:true}).fill(String(number));}
test('a volunteer fixes an unknown number and keeps wrong-section and already-ran warnings on the race screen',async({openPhone,request},info)=>{
  const project=info.project.name,code=`WN-${project.toUpperCase()}`,name=`Warning sprint ${project}`;
  await ownEvent(request,code,name);
  // 2008 ran in Heat 1, which is saved, so Heat 2 is the current race.
  await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[2008],[1234]);
  const {page}=await openPhone(`Warnings ${project}`);
  await openRaceScreen(page,name);
  await expect(page.getByText('Heat 2 · 0 runners',{exact:true})).toBeVisible();
  // The owner checked Heat 1 in, so this volunteer takes check-in over.
  await page.getByRole('button',{name:/^Check-in Wristbands/}).click();await page.getByRole('button',{name:'Take over check-in',exact:true}).click();await page.getByRole('button',{name:'Take over',exact:true}).click();
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
  // The kept warnings are on the server's list: they show on every phone, and go to To check once the heat is saved.
  for(const [number,dot] of [[2009,0],[3045,1],[2008,1]] as const) await expect(page.getByRole('button',{name:`Change runner ${number}`,exact:true}).locator('.kept-dot')).toHaveCount(dot);
  const lead={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},token=process.env.E2E_OWNER_TOKEN!;
  const toCheck=async()=>(await (await request.get('/api/lead/results',{headers:lead})).json()).needsYou.filter((item:{event:{code:string}})=>item.event.code===code).map((item:{wristband?:number})=>item.wristband);
  expect(await toCheck()).not.toContain(3045);
  await writeOrder(request,token,code,[2009,3045,2008]);await writeTimes(request,token,code,[1200,1300,1400]);
  // The volunteer still holds check-in, so both phones press.
  await submitRace(request,token,code);await page.getByRole('button',{name:'Submit Race',exact:true}).click();
  await expect(page.getByText('Heat 2 saved',{exact:true})).toBeVisible();
  expect(await toCheck()).toEqual(expect.arrayContaining([3045,2008]));
  await deleteCurrentRace(request,code);
});
