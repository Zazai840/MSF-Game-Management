import { openDashboard,dashboardMenuButton,becomeLead,expect,joinDay,test,trailBack } from './fixtures.js';
const headers=()=>({authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`});
import readExcelFile from 'read-excel-file/node';
test('Scoring downloads the whole day workbook and sees when its export needs refreshing',async({page},info)=>{
 // Other specs pick R6 by its seeded name, so put it back whatever happens here.
 const original=(await(await page.request.get('/api/day',{headers:headers()})).json()).events.find((event:{code:string})=>event.code==='R6').name as string;
 try {
 await page.goto('/');await joinDay(page,`Export ${info.project.name}`);await becomeLead(page,'e2e-owner-fixture');await openDashboard(page,'Day setup');
 await page.route('**/api/day/export',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Export unavailable — try again'})}));await page.getByRole('button',{name:'Download day export',exact:true}).click();await expect(page.getByRole('region',{name:'Day export'}).getByRole('alert')).toHaveText('Export unavailable — try again');await expect(page.getByText('Not downloaded - tap Download day export again',{exact:true})).toBeVisible();await page.unroute('**/api/day/export');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download day export',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^msf-running-.*\.xlsx$/);const path=info.outputPath('day-export.xlsx');await download.saveAs(path);
 const sheets=await readExcelFile(path);expect(sheets.map(sheet=>sheet.sheet)).toEqual(['Input - Running','Finals','All results','Audit notes']);const status=page.getByRole('region',{name:'Day export'});await expect(status).toContainText(/Last downloaded \d\d:\d\d, includes every change so far\./);
 await page.screenshot({path:info.outputPath('day-export-phone.png'),fullPage:false});
 await page.getByRole('button',{name:/^Events /}).click();await page.getByRole('button',{name:'Rename R6',exact:true}).click();await page.getByLabel('New name for R6',{exact:true}).fill(`60m export ${info.project.name}`);await page.getByRole('button',{name:'Save name for R6',exact:true}).click();await expect(page.locator('.dashboard-saved')).toHaveText('Saved');await trailBack(page,'Day setup');await expect(status).toContainText(/Last downloaded \d\d:\d\d, with newer changes since\./);
 await page.reload();await openDashboard(page,'Day setup');await expect(status).toContainText(/Last downloaded \d\d:\d\d, with newer changes since\./);
 } finally {await page.request.post('/api/day/events/R6/rename',{headers:headers(),data:{name:original}});}
});
test('ordinary Lead has no Day download and its direct export request is refused',async({page,request},info)=>{
 await page.goto('/');await joinDay(page,`No export ${info.project.name}`);await becomeLead(page);await openDashboard(page);await expect(dashboardMenuButton(page,'Day setup')).toHaveCount(0);await expect(page.getByRole('button',{name:'Download day export',exact:true})).toHaveCount(0);
 const token=await page.evaluate(()=>localStorage.getItem('msf:token'));expect((await request.post('/api/day/export',{headers:{authorization:`Bearer ${token}`},data:{}})).status()).toBe(403);
});
