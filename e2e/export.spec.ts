import {openLeadMenu,becomeLead,expect,join,test,back,ownRelay,signInThroughApi,writeTeam,tickTeam,writeTeamOrder,writeTimes,submitRace} from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`});
import readExcelFile from 'read-excel-file/node';
test('A lead downloads the whole day workbook and sees when its export needs refreshing',async({page},info)=>{
 // Other specs pick R6 by its seeded name, so put it back whatever happens here.
 const original=(await(await page.request.get('/api/day',{headers:headers()})).json()).events.find((event:{code:string})=>event.code==='R6').name as string;
 try {
 await page.goto('/');await join(page,`Export ${info.project.name}`,{job:'Start line'});await becomeLead(page,'e2e-owner-fixture');await openLeadMenu(page,'Day setup');
 await page.route('**/api/day/export',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Export unavailable - try again'})}));await page.getByRole('button',{name:'Download day export',exact:true}).click();await expect(page.getByRole('region',{name:'Day export'}).getByRole('alert')).toHaveText('Export unavailable - try again');await expect(page.getByText('Not downloaded - tap Download day export again',{exact:true})).toBeVisible();await page.unroute('**/api/day/export');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download day export',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^msf-running-.*\.xlsx$/);const path=info.outputPath('day-export.xlsx');await download.saveAs(path);
 const sheets=await readExcelFile(path);expect(sheets.map(sheet=>sheet.sheet)).toEqual(['Input - Running','Finals','All results','Audit notes']);const status=page.getByRole('region',{name:'Day export'});await expect(status).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
 await page.screenshot({path:info.outputPath('day-export-phone.png'),fullPage:false});
 await page.getByRole('button',{name:/^Events /}).click();await page.getByRole('button',{name:'Rename R6',exact:true}).click();await page.getByLabel('New name for R6',{exact:true}).fill(`60m export ${info.project.name}`);await page.getByRole('button',{name:'Save name for R6',exact:true}).click();await expect(page.locator('.dashboard-saved')).toHaveText('Saved');await back(page,'Day setup');await expect(status).toContainText(/Last downloaded \d\d:\d\d, with newer changes since\./);
 await page.reload();await openLeadMenu(page,'Day setup');await expect(status).toContainText(/Last downloaded \d\d:\d\d, with newer changes since\./);
 } finally {await page.request.post('/api/day/events/R6/rename',{headers:headers(),data:{name:original}});}
});
test('a lead from the lead code has the Day download and its direct export request is accepted',async({page,request},info)=>{
 await page.goto('/');await join(page,`Lead export ${info.project.name}`,{job:'Start line'});await becomeLead(page);await openLeadMenu(page,'Day setup');await expect(page.getByRole('button',{name:'Download day export',exact:true})).toBeVisible();
 const token=await page.evaluate(()=>localStorage.getItem('msf:token'));expect((await request.post('/api/day/export',{headers:{authorization:`Bearer ${token}`},data:{}})).status()).toBe(200);
});
test('a relay with a saved Final exports its medal teams in Input - Running and one row per child with Team and Leg in All results',async({page,request},info)=>{
 const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=`XR-${project.toUpperCase()}`;
 await ownRelay(code,`Relay export ${project}`,'Boy Scouts');
 // The test day is shared: each project's Boy Scouts teams use wristbands no other relay test types, and Team 1's 1st leg is a borrowed Girl Scout, kept.
 const legs=(team:number)=>[1,2,3,4].map(leg=>3600+at*20+(team-1)*4+leg),borrowed=4870+at,team1=[borrowed,...legs(1).slice(1)];
 const token=await signInThroughApi(request,`Relay export volunteer ${project}`),lead={headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`}};
 for(const team of [1,2,3]) await writeTeam(request,token,code,team===1?team1:legs(team),{keptWarnings:team===1?[borrowed]:[]});
 for(const team of [1,2,3]) await tickTeam(request,token,code,team);
 await writeTeamOrder(request,token,code,[1,2,3]);await writeTimes(request,token,code,[1400,1500,1600]);await submitRace(request,token,code);
 expect((await request.post(`/api/lead/events/${code}/complete-stage`,{...lead,data:{stage:'heats'}})).ok()).toBe(true);
 await writeTeamOrder(request,token,code,[1,2,3]);await submitRace(request,token,code);
 expect((await request.post(`/api/lead/events/${code}/complete-stage`,{...lead,data:{stage:'final'}})).ok()).toBe(true);
 await page.goto('/');await join(page,`Relay export ${project}`,{job:'Start line'});await becomeLead(page,'e2e-owner-fixture');await openLeadMenu(page,'Day setup');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download day export',exact:true}).click();const path=info.outputPath('relay-day-export.xlsx');await (await downloadPromise).saveAs(path);
 const sheets=await readExcelFile(path),input=sheets.find(sheet=>sheet.sheet==='Input - Running')!.data.find(row=>row[0]===code)!;
 // J, M and P: each medal team's first Boy Scout in leg order, so Team 1's 2nd leg; U-W, AA-AC and AG-AI: the other three.
 expect([9,12,15].map(column=>input[column])).toEqual([legs(1)[1],legs(2)[0],legs(3)[0]]);
 expect([20,21,22,26,27,28,32,33,34].map(column=>input[column])).toEqual([borrowed,legs(1)[2],legs(1)[3],...legs(2).slice(1),...legs(3).slice(1)]);
 const all=sheets.find(sheet=>sheet.sheet==='All results')!.data;expect(all[0].slice(4,7)).toEqual(['Wristband number','Team','Leg']);
 expect(all.filter(row=>row[0]===code&&row[3]==='Final 1').map(row=>[row[4],row[5],row[6],row[8],row[10]])).toEqual([
  ...team1.map((wristband,leg)=>[wristband,'Team 1',leg+1,1,'1st']),...legs(2).map((wristband,leg)=>[wristband,'Team 2',leg+1,2,'2nd']),...legs(3).map((wristband,leg)=>[wristband,'Team 3',leg+1,3,'3rd'])
 ]);
});
