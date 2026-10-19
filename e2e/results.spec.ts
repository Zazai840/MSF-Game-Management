import { pickRace,enterTime,openDashboard,savedRaceLabel,goHome,enterWristband,jobButton,becomeLead,expect,createProfile,test,type Page } from './fixtures.js';
async function signInAs(page:Page,name:string) {await page.goto('/');await createProfile(page,name);}
test('a lead sees a phone-recorded race appear within one Results poll',async({page,browser},info)=>{
  const offset=['iPhone','Android','desktop'].indexOf(info.project.name)*10;
  const number=2401+offset;
  const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
  await page.request.post('/api/day/events/R4/rename',{headers,data:{name:'60m'}});await page.request.post('/api/day/confirm-events',{headers,data:{}});
  await signInAs(page,`Results lead ${info.project.name}`);await becomeLead(page);await openDashboard(page,'Results');
  await page.getByRole('button',{name:/^R4 · Girl Cubs/}).click();
  const context=await browser.newContext({...info.project.use,viewport:{width:390,height:844},isMobile:true,hasTouch:true});const phone=await context.newPage();
  await signInAs(phone,`Results phone ${info.project.name}`);await jobButton(phone,'Start line').click();await phone.getByRole('button',{name:'60m',exact:true}).click();await phone.getByRole('button',{name:'Girl Cubs · R4',exact:true}).click();await enterWristband(phone,number);await enterWristband(phone,3045);await phone.getByRole('button',{name:'Keep',exact:true}).click();await phone.getByRole('button',{name:"That's everyone",exact:true}).click();await phone.getByRole('button',{name:'Save',exact:true}).click();
  const label=await savedRaceLabel(phone);
  await expect(page.getByText(`${label} · checked in`,{exact:true})).toBeVisible({timeout:6500});
  await goHome(phone);await jobButton(phone,'Finish order').click();await phone.getByRole('button',{name:String(number),exact:true}).click();await phone.getByRole('button',{name:'3045',exact:true}).click();await phone.getByRole('button',{name:'Check the order',exact:true}).click();await phone.getByRole('button',{name:'Save',exact:true}).click();expect(await savedRaceLabel(phone)).toBe(label);
  await goHome(phone);await jobButton(phone,'Times').click();await pickRace(phone,'Times',`60m Girl Cubs (R4) · ${label}`);await enterTime(phone,1234);await enterTime(phone,1334);await phone.getByRole('button',{name:'Save',exact:true}).click();await savedRaceLabel(phone);
  const row=page.getByRole('listitem').filter({has:page.getByText(String(number),{exact:true})});
  await expect(row).toContainText('12.34',{timeout:6500});await expect(row).toContainText('Q');
  await expect(page.getByText('3045 belongs to Boy Scouts - this race is Girl Cubs',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:info.outputPath('live-leaderboard.png'),fullPage:true});
  await context.close();
});
