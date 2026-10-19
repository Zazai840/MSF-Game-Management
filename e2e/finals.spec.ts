import { lookProblems,recordRace,openDashboard,becomeLead,expect,createProfile,test,live,openRaceScreen,ownEvent,writeOrder,deleteCurrentRace,type Page } from './fixtures.js';
async function signInAs(page:Page,name:string,lead=false) {
 await page.goto('/');await createProfile(page,name);
 if(lead) {await becomeLead(page);}
}
const checkInCard=(page:Page)=>page.getByRole('button',{name:/^Check-in Wristbands/});
const orderCard=(page:Page)=>page.getByRole('button',{name:/^Finishing order/});
const attendance=(page:Page)=>page.getByRole('list',{name:'Who is here'}).getByRole('listitem');
/** Heats recorded through the API (the race screen's heats have their own tests), then the lead completes them on Results. */
async function heatsToFinal(page:Page,code:string,name:string,heats:Array<[number[],number[]]>,lead:string) {
 await ownEvent(page.request,code,name,'Boy Cubs');
 const races=[];for(const [runners,times] of heats) races.push(await recordRace(page.request,process.env.E2E_SCORING_TOKEN!,code,runners,times));
 await signInAs(page,lead,true);await openDashboard(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Boy Cubs`)}).click();
 return races;
}
test('a final on the race screen: Absent hides a runner from the order holder live, a lead\'s call-up appears live, and Finishing order has no times',async({page,openPhone},info)=>{
 test.setTimeout(60000);
 const project=info.project.name,code=`FH-${project.toUpperCase()}`,name=`Final here ${project}`;
 await heatsToFinal(page,code,name,[[[1011,1012,1013,1014,1015,1016],[900,1000,1100,1200,1300,1400]],[[1017,1018],[1150,1250]]],`Final lead ${project}`);
 await page.getByRole('button',{name:'Heats complete',exact:true}).click();let sheet=page.getByRole('dialog',{name:'Heats complete',exact:true});await expect(sheet).toContainText('Finals line-up');expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('heats-complete.png'),fullPage:true});await sheet.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByText('Heats done · final to run',{exact:true})).toBeVisible();
 const sam=(await openPhone(`Sam final ${project}`)).page,priya=(await openPhone(`Priya final ${project}`)).page;
 await openRaceScreen(sam,name,'Boy Cubs');await openRaceScreen(priya,name,'Boy Cubs');
 await expect(sam.getByText('Final · 6 runners',{exact:true})).toBeVisible();
 // The final starts with nobody holding anything; opening each card takes its job.
 await checkInCard(sam).click();
 await expect(checkInCard(sam)).toHaveAccessibleName(/You are checking who is here · 6 here$/);
 await expect(attendance(sam)).toHaveText([/1st seed\s*1011/,/2nd seed\s*1012/,/3rd seed\s*1013/,/4th seed\s*1017/,/5th seed\s*1014/,/6th seed\s*1018/]);
 await orderCard(priya).click();
 await expect(orderCard(priya)).toHaveAccessibleName('Finishing order Order: You');
 await expect(priya.getByRole('table',{name:'Finishing order'}).getByRole('columnheader')).toHaveText(['Place','Wristband']);
 await expect(priya.getByRole('button',{name:'1012',exact:true})).toBeVisible();
 await sam.getByRole('button',{name:'1012 Absent',exact:true}).click();
 await expect(sam.getByRole('button',{name:'1012 Absent',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(priya.getByRole('button',{name:'1012',exact:true})).toHaveCount(0,live);
 await expect(priya.getByText('Final · 5 runners',{exact:true})).toBeVisible(live);
 await checkInCard(priya).click();
 await expect(attendance(priya).filter({hasText:'1012'})).toContainText('Absent',live);
 await expect(priya.getByRole('button',{name:'1012 Here',exact:true})).toHaveCount(0);
 // A lead's call-up for the absent seed appears on both phones, live.
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:/Call up next-ranked runner: 1015/}).click();await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('called up 1015');
 await expect(priya.getByRole('button',{name:'1015',exact:true})).toBeVisible(live);
 await expect(sam.getByRole('button',{name:'1015 Here',exact:true})).toHaveAttribute('aria-pressed','true',live);
 await expect(attendance(sam).filter({hasText:'1015'})).toContainText('Called up');
 expect(await lookProblems(sam)).toEqual([]);await sam.screenshot({path:info.outputPath('final-here-absent.png'),fullPage:true});
 for(const number of [1015,1011,1017,1013,1018,1014]) await priya.getByRole('button',{name:String(number),exact:true}).click();
 await expect(priya.getByText('Everyone has a place',{exact:true})).toBeVisible();
 expect(await lookProblems(priya)).toEqual([]);await priya.screenshot({path:info.outputPath('final-finishing-order.png'),fullPage:true});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();const final=page.getByRole('list',{name:'Final leaderboard'});await expect(final).toContainText('1015');await expect(final.locator('.result-time')).toHaveCount(0);await page.getByRole('button',{name:'Final complete',exact:true}).click();sheet=page.getByRole('dialog',{name:'Final complete',exact:true});await expect(sheet).toContainText('1st: 1015');await sheet.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('table',{name:'Input - Running'})).toContainText('1015');await page.screenshot({path:info.outputPath('final-complete.png'),fullPage:true});
 await expect(priya.getByText('Stage complete - ask a lead',{exact:true})).toBeVisible(live);
 await page.getByRole('button',{name:'Reopen heats',exact:true}).click();sheet=page.getByRole('dialog',{name:'Reopen heats',exact:true});await expect(sheet).toContainText('already run');await sheet.getByLabel('Comment',{exact:true}).fill('Check heat correction');await sheet.getByRole('button',{name:'Reopen',exact:true}).click();await expect(final).toContainText('1015');
 // The run final counts, so it waits on no picker; with heats reopened the current race is an empty heat, never stored, so there is nothing to delete.
});
test('short fields show lines, and an unrun final rebuilt after a heat correction shows its new line-up live, everyone Here and nobody holding check-in',async({page,openPhone},info)=>{
 const project=info.project.name,code=`S37${project.toUpperCase()}`,name=`Short sprint ${project}`;
 const [heat]=await heatsToFinal(page,code,name,[[[1041,1042],[900,1000]]],`Short final lead ${project}`);
 await expect(page.getByRole('list',{name:'Provisional leaderboard'}).getByText('Qualifying line',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Heats complete',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
 const sam=await openPhone(`Short final phone ${project}`);await openRaceScreen(sam.page,name,'Boy Cubs');
 await checkInCard(sam.page).click();await sam.page.getByRole('button',{name:'1041 Absent',exact:true}).click();
 await expect(sam.page.getByRole('button',{name:'1041 Absent',exact:true})).toHaveAttribute('aria-pressed','true');await expect(sam.page.getByRole('button',{name:'1042 Here',exact:true})).toHaveAttribute('aria-pressed','true');
 const headers={authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`};
 await page.getByRole('button',{name:'Reopen heats',exact:true}).click();await page.getByRole('dialog').getByLabel('Comment',{exact:true}).fill('Corrected heat timer');await page.getByRole('dialog').getByRole('button',{name:'Reopen',exact:true}).click();await page.request.post(`/api/lead/races/${heat.id}/times`,{headers,data:{baseVersion:1,places:[1000,900],acceptOutOfOrder:true}});await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Heats complete',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
 // The rebuilt final is a new line-up: 1042 is now the top seed, everyone is Here, and its holds were cleared.
 await expect(attendance(sam.page)).toHaveText([/1st seed\s*1042\s*Here/,/2nd seed\s*1041\s*Here/],live);
 await expect(checkInCard(sam.page)).toHaveAccessibleName(/Nobody yet · open to start$/,live);
 await writeOrder(page.request,sam.token,code,[1041,1042]);
 const finalId=(await (await page.request.get(`/api/lead/events/${code}/results`,{headers})).json()).results.finalResults.raceId;
 const finalRace=(await (await page.request.get(`/api/lead/races/${finalId}`,{headers})).json()).race;
 const disqualified=finalRace.parts.runners.value.find((r:any)=>r.wristband===1041);await page.request.post(`/api/lead/races/${finalId}/runners/${disqualified.id}/disqualify`,{headers,data:{reason:'Two false starts'}});await page.getByRole('button',{name:'Refresh',exact:true}).click();const finalList=page.getByRole('list',{name:'Final leaderboard'});await expect(finalList.locator('li').first()).toContainText('1042');await expect(finalList.locator('li').first()).toContainText('Medal line');await expect(finalList.locator('li').last()).toContainText('Disqualified');await page.screenshot({path:info.outputPath('short-final-medal-line.png'),fullPage:true});
 // The final counts once every runner is placed, so it waits on no picker and stays the current race: nothing is left to delete.
});
test('Here / Absent on one phone is read-only on another, which can take over check-in',async({openPhone,request},info)=>{
 const project=info.project.name,code=`FR-${project.toUpperCase()}`,name=`Final read ${project}`;
 await ownEvent(request,code,name,'Boy Cubs');
 await recordRace(request,process.env.E2E_SCORING_TOKEN!,code,[1051,1052],[900,1000]);
 expect((await request.post(`/api/lead/events/${code}/complete-stage`,{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`},data:{stage:'heats'}})).ok()).toBe(true);
 const sam=(await openPhone(`Sam read ${project}`)).page,jo=(await openPhone(`Jo read ${project}`)).page;
 await openRaceScreen(sam,name,'Boy Cubs');await openRaceScreen(jo,name,'Boy Cubs');
 await checkInCard(sam).click();await checkInCard(jo).click();
 await expect(checkInCard(jo)).toHaveAccessibleName(new RegExp(`Sam read ${project} is checking who is here · 2 here$`),live);
 await sam.getByRole('button',{name:'1052 Absent',exact:true}).click();
 await expect(attendance(jo)).toHaveText([/1051\s*Here/,/1052\s*Absent/],live);
 await expect(jo.getByRole('button',{name:/ (Here|Absent)$/})).toHaveCount(0);
 await jo.getByRole('button',{name:'Take over check-in',exact:true}).click();await jo.getByRole('button',{name:'Take over',exact:true}).click();
 await jo.getByRole('button',{name:'1052 Here',exact:true}).click();
 await expect(attendance(sam)).toHaveText([/1051\s*Here/,/1052\s*Here/],live);
 await expect(sam.getByRole('button',{name:/ (Here|Absent)$/})).toHaveCount(0);
 expect(await lookProblems(jo)).toEqual([]);await jo.screenshot({path:info.outputPath('final-attendance-taken-over.png'),fullPage:true});
 await deleteCurrentRace(request,code);
});
