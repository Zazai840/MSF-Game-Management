import { openDashboard,dashboardMenuButton,dashboardButton,becomeLead,expect,joinDay,test } from './fixtures.js';
import readExcelFile from 'read-excel-file/node';
test('Scoring downloads the whole day workbook and sees when its export needs refreshing',async({page},info)=>{
 await page.goto('/');await joinDay(page,`Export ${info.project.name}`);await becomeLead(page,'e2e-owner-fixture');await openDashboard(page,'Day setup');
 await page.route('**/api/day/export',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Export unavailable — try again'})}));await page.getByRole('button',{name:'Download day export',exact:true}).click();await expect(page.getByRole('region',{name:'Day export'}).getByRole('alert')).toHaveText('Export unavailable — try again');await expect(page.getByText('Not downloaded — tap Download day export again',{exact:true})).toBeVisible();await page.unroute('**/api/day/export');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download day export',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^msf-running-.*\.xlsx$/);const path=info.outputPath('day-export.xlsx');await download.saveAs(path);
 const sheets=await readExcelFile(path);expect(sheets.map(sheet=>sheet.sheet)).toEqual(['Input - Running','Finals','All results','Audit notes']);await expect(page.getByText('Includes all changes so far',{exact:true})).toBeVisible();await expect(page.getByText(/^Last export:/)).toBeVisible();
 await page.screenshot({path:info.outputPath('day-export-phone.png'),fullPage:false});
 await page.getByRole('button',{name:'Rename R6',exact:true}).click();await page.getByLabel('New name for R6',{exact:true}).fill(`60m export ${info.project.name}`);await page.getByRole('button',{name:'Save name for R6',exact:true}).click();await expect(page.getByText('Changes since the last export — download again before starting a new day',{exact:true})).toBeVisible();
 await page.reload();await openDashboard(page,'Day setup');await expect(page.getByText(/^Last export:/)).toBeVisible();
});
test('ordinary Lead has no Day download and its direct export request is refused',async({page,request},info)=>{
 await page.goto('/');await joinDay(page,`No export ${info.project.name}`);await becomeLead(page);await openDashboard(page);await expect(dashboardMenuButton(page,'Day setup')).toHaveCount(0);await expect(page.getByRole('button',{name:'Download day export',exact:true})).toHaveCount(0);
 const token=await page.evaluate(()=>localStorage.getItem('msf:token'));expect((await request.post('/api/day/export',{headers:{authorization:`Bearer ${token}`},data:{}})).status()).toBe(403);
});
