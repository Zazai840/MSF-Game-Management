import {ownCode,ownWristbands,lookProblems,recordRace,openLeadMenu,becomeLead,expect,join,test,live,openRace,ownEvent,deleteCurrentRace,type Page} from './fixtures.js';
async function signInAs(page:Page,name:string,lead=false) {
 await page.goto('/');await join(page,name,{job:'Start line'});
 if(lead) {await becomeLead(page);}
}
const attendance=(page:Page)=>page.getByRole('list',{name:'Who is here'}).getByRole('listitem');
const here=(page:Page,wristband:number)=>page.getByRole('button',{name:new RegExp(`^${wristband}: (Here\\. Mark absent|Absent\\. Mark here)$`)});
const runnerButtons=(page:Page)=>page.getByRole('list',{name:'Runners not yet placed'}).getByRole('button');
/** Heats recorded through the API (the race flow's heats have their own tests), then the lead opens the event's results. */
async function heatsToFinal(page:Page,code:string,name:string,heats:Array<[number[],number[]]>,lead:string) {
 await ownEvent(page.request,code,name,'Boy Cubs');
 const races=[];for(const [runners,times] of heats) races.push(await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,runners,times));
 await signInAs(page,lead,true);await openLeadMenu(page,'Results');await page.getByRole('button',{name:new RegExp(`^${code} · Boy Cubs`)}).click();
 return races;
}
test('a final in the race flow: Absent takes a runner off the finish line live, a lead\'s call-up appears live, and the final has no times',async({page,openPhone},info)=>{
 test.setTimeout(60000);
 const project=info.project.name,code=await ownCode(),name=`Final here ${project}`;
 await heatsToFinal(page,code,name,[[[1011,1012,1013,1014,1015,1016],[900,1000,1100,1200,1300,1400]],[[1017,1018],[1150,1250]]],`Final lead ${project}`);
 await page.getByRole('button',{name:'Heats complete',exact:true}).click();let sheet=page.getByRole('dialog',{name:'Heats complete',exact:true});await expect(sheet).toContainText('Finals line-up');expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('heats-complete.png'),fullPage:true});await sheet.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByText('Heats done · final to run',{exact:true})).toBeVisible();
 const sam=(await openPhone(`Sam final ${project}`)).page,priya=(await openPhone(`Priya final ${project}`,{job:'finish'})).page;
 await openRace(sam,name,'Boy Cubs','Final');await openRace(priya,name,'Boy Cubs','Final');
 // Heats are complete, so no phone offers another heat, on the race or on its card.
 await expect(sam.getByRole('button',{name:/^Add heat/})).toHaveCount(0);
 await sam.getByRole('button',{name:'Back to Races',exact:true}).click();
 await expect(sam.getByRole('article',{name:`${name} · Boy Cubs`}).getByRole('button',{name:/^Add heat/})).toHaveCount(0);
 await openRace(sam,name,'Boy Cubs','Final');
 // A final has two steps: who is here, and the finishing order.
 await expect(sam.getByRole('tablist',{name:'Final progress'}).getByRole('tab')).toHaveCount(2);
 await expect(sam.getByRole('heading',{level:2,name:'Who is here?'})).toBeVisible();
 await expect(attendance(sam)).toHaveText([/1st seed\s*1011/,/2nd seed\s*1012/,/3rd seed\s*1013/,/4th seed\s*1017/,/5th seed\s*1014/,/6th seed\s*1018/]);
 await expect(runnerButtons(priya)).toHaveCount(6);
 await here(sam,1012).click();
 await expect(sam.getByRole('button',{name:'1012: Absent. Mark here',exact:true})).toHaveAttribute('aria-pressed','false');
 await expect(runnerButtons(priya).filter({hasText:'1012'})).toHaveCount(0,live);
 await expect(priya.locator('.rz-prompt__meta')).toContainText('5 runners',live);
 // A lead's call-up for the absent seed appears on both phones, live.
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:/Call up next-ranked runner: 1015/}).click();await expect(page.getByRole('list',{name:'Audit notes'})).toContainText('called up 1015');
 await expect(runnerButtons(priya).filter({hasText:'1015'})).toHaveCount(1,live);
 await expect(sam.getByRole('button',{name:'1015: Here. Mark absent',exact:true})).toBeVisible(live);
 await expect(attendance(sam).filter({hasText:'1015'})).toContainText('Called up');
 expect(await lookProblems(sam)).toEqual([]);await sam.screenshot({path:info.outputPath('final-here-absent.png'),fullPage:true});
 for(const [number,place] of [[1015,'1st'],[1011,'2nd'],[1017,'3rd'],[1013,'4th'],[1018,'5th'],[1014,'6th']] as const) await priya.getByRole('button',{name:`${number} came ${place}`,exact:true}).click();
 await expect(priya.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
 expect(await lookProblems(priya)).toEqual([]);await priya.screenshot({path:info.outputPath('final-finishing-order.png'),fullPage:true});
 // Both steps done: the final saves itself, with no times.
 await priya.getByRole('button',{name:'Save the order',exact:true}).click();
 await sam.getByRole('button',{name:"That's everyone",exact:true}).click();
 await expect(sam.locator('.rz-toast')).toContainText('Runners saved · Boy Cubs Final');
 await page.getByRole('button',{name:'Refresh',exact:true}).click();const final=page.getByRole('list',{name:'Final leaderboard'});await expect(final).toContainText('1015');await expect(final.locator('.result-time')).toHaveCount(0);await page.getByRole('button',{name:'Final complete',exact:true}).click();sheet=page.getByRole('dialog',{name:'Final complete',exact:true});await expect(sheet).toContainText('1st: 1015');await sheet.getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('table',{name:'Input - Running'})).toContainText('1015');await page.screenshot({path:info.outputPath('final-complete.png'),fullPage:true});
 await openRace(priya,name,'Boy Cubs','Final');
 await expect(priya.getByRole('status').filter({hasText:'Boy Cubs final is finished. Ask a lead to change this race.'})).toBeVisible();
 await page.getByRole('button',{name:'Reopen heats',exact:true}).click();sheet=page.getByRole('dialog',{name:'Reopen heats',exact:true});await expect(sheet).toContainText('Heats cannot be reopened');await sheet.getByLabel('Comment',{exact:true}).fill('Check heat correction');await sheet.getByRole('button',{name:'Reopen',exact:true}).click();await expect(sheet.getByRole('alert')).toHaveText('The final has started - heats cannot be reopened');await sheet.getByRole('button',{name:'Close check sheet',exact:true}).click();await expect(final).toContainText('1015');
});
test('only a lead\'s + Final makes the final from the fastest, after a confirm, and an unstarted final rebuilt after a heat correction shows its new line-up live',async({page,openPhone},info)=>{
 const project=info.project.name,code=await ownCode(),name=`Short sprint ${project}`;
 const [heat]=await heatsToFinal(page,code,name,[[[1041,1042],[900,1000]]],`Short final lead ${project}`);
 await expect(page.getByRole('list',{name:'Provisional leaderboard'}).getByText('Qualifying line',{exact:true})).toBeVisible();
 // A volunteer is not offered the final: the card says who makes it.
 const sam=await openPhone(`Short final phone ${project}`);
 const card=sam.page.getByRole('article',{name:`${name} · Boy Cubs`});
 await expect(card.locator('.rz-racecard__status')).toHaveText('Heat 1 done');
 await expect(card.getByText('A lead makes the final once every heat has run.',{exact:true})).toBeVisible();
 await expect(card.getByRole('button',{name:/final/i})).toHaveCount(0);
 // A lead makes it from the card, after a confirm with the heat count; Not yet changes nothing.
 const lena=(await openPhone(`Short final card lead ${project}`,{lead:true})).page;
 const leadCard=lena.getByRole('article',{name:`${name} · Boy Cubs`});
 await expect(leadCard.locator('.rz-racecard__status')).toHaveText('Heat 1 saved · make the final once every heat has run');
 const plusFinal=leadCard.getByRole('button',{name:'Create the final from the fastest 6',exact:true});
 await plusFinal.click();
 const confirm=lena.getByRole('dialog',{name:'Have all Boy Cubs heats run?',exact:true});
 await expect(confirm.locator('.rz-sheet__text')).toHaveText('1 heat saved. The final takes the fastest 6, and no more heats can be added.');
 expect(await lookProblems(lena)).toEqual([]);await lena.screenshot({path:info.outputPath('make-the-final.png'),fullPage:true});
 await confirm.getByRole('button',{name:'Not yet',exact:true}).click();
 await expect(confirm).toHaveCount(0);
 await expect(leadCard.getByRole('button',{name:'Add heat 2',exact:true})).toBeVisible();
 await expect(leadCard.getByRole('button',{name:/^Final[, ]/})).toHaveCount(0);
 await plusFinal.click();await confirm.getByRole('button',{name:'Make the final',exact:true}).click();
 await expect(lena.getByRole('heading',{level:1,name:`${name} · Boy Cubs`,exact:true})).toBeVisible();
 await expect(lena.getByRole('tablist',{name:'Final steps'})).toBeVisible();
 // Once the final is made nobody is offered another heat, and the volunteer opens the final from the card.
 await expect(card.getByRole('button',{name:/^Add heat/})).toHaveCount(0,live);
 await expect(card.getByText('A lead makes the final once every heat has run.',{exact:true})).toHaveCount(0);
 await openRace(sam.page,name,'Boy Cubs','Final');
 await expect(sam.page.getByRole('heading',{level:2,name:'Who is here?'})).toBeVisible();
 await expect(attendance(sam.page)).toHaveText([/1st seed\s*1041\s*Here/,/2nd seed\s*1042\s*Here/]);
 const headers={authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`};
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByRole('button',{name:'Reopen heats',exact:true}).click();await page.getByRole('dialog').getByLabel('Comment',{exact:true}).fill('Corrected heat timer');await page.getByRole('dialog').getByRole('button',{name:'Reopen',exact:true}).click();await page.request.post(`/api/lead/races/${heat.id}/times`,{headers,data:{baseVersion:1,places:[1000,900],acceptOutOfOrder:true}});await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Heats complete',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
 // The rebuilt final is a new line-up: 1042 is now the top seed, and everyone is Here.
 await expect(attendance(sam.page)).toHaveText([/1st seed\s*1042\s*Here/,/2nd seed\s*1041\s*Here/],live);
 expect(await lookProblems(sam.page)).toEqual([]);await sam.page.screenshot({path:info.outputPath('final-rebuilt.png'),fullPage:true});
});
test('a lead\'s + Final is greyed with why the final cannot be made yet, the reason opens that heat\'s Times tab, and accepting the time frees it',async({openPhone,request},info)=>{
 const project=info.project.name,code=await ownCode(),name=`Final reason ${project}`,n=await ownWristbands('Boy Cubs',2);
 await ownEvent(request,code,name,'Boy Cubs');
 // Heat 1 is saved with a wrong time kept: 2nd place faster than 1st.
 await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[n(1),n(2)],[1000,900]);
 const lena=(await openPhone(`Final reason lead ${project}`,{lead:true})).page;
 const card=lena.getByRole('article',{name:`${name} · Boy Cubs`});
 const plusFinal=card.getByRole('button',{name:'Create the final from the fastest 6',exact:true});
 await expect(plusFinal).toHaveAttribute('aria-disabled','true');
 // Tapping the greyed chip anyway opens nothing.
 await plusFinal.click({force:true});
 await expect(lena.getByRole('dialog')).toHaveCount(0);
 const reason=card.getByRole('button',{name:'Heat 1 has a time to check first',exact:true});
 await expect(reason).toBeVisible();
 expect(await lookProblems(lena)).toEqual([]);await lena.screenshot({path:info.outputPath('final-reason-card.png'),fullPage:true});
 // New race never offers the final the server would refuse: Final is greyed, with the reason in the hint.
 await lena.getByRole('button',{name:'New race',exact:true}).click();
 const sheet=lena.getByRole('dialog',{name:'New race'});
 await sheet.getByRole('button',{name,exact:true}).click();await sheet.getByRole('button',{name:`Boy Cubs ${code}`,exact:true}).click();
 await expect(sheet.getByRole('button',{name:'Final',exact:true})).toBeDisabled();
 await expect(sheet.getByText('Boy Cubs already has heat 1. Heat 1 has a time to check first.',{exact:true})).toBeVisible();
 await lena.keyboard.press('Escape');
 await reason.click();
 await expect(lena.getByRole('heading',{level:1,name:`${name} · Boy Cubs`,exact:true})).toBeVisible();
 await expect(lena.getByRole('tab',{name:/^Times/})).toHaveAttribute('aria-selected','true');
 const onRace=lena.getByRole('navigation',{name:'Heats'});
 await expect(onRace.getByRole('button',{name:'Create the final from the fastest 6',exact:true})).toHaveAttribute('aria-disabled','true');
 await expect(onRace.getByRole('button',{name:'Heat 1 has a time to check first',exact:true})).toBeVisible();
 expect(await lookProblems(lena)).toEqual([]);await lena.screenshot({path:info.outputPath('final-reason-race.png'),fullPage:true});
 // The lead accepts the time: "+ Final" is tappable again, and opens the confirm.
 await lena.getByRole('button',{name:"It's right",exact:true}).click();
 await expect(onRace.getByRole('button',{name:'Heat 1 has a time to check first',exact:true})).toHaveCount(0,live);
 const freed=onRace.getByRole('button',{name:'Create the final from the fastest 6',exact:true});
 await expect(freed).not.toHaveAttribute('aria-disabled','true');
 await freed.click();
 await expect(lena.getByRole('dialog',{name:'Have all Boy Cubs heats run?',exact:true})).toBeVisible();
});
test('two start line phones mark Here / Absent on one final, each seeing the other\'s marks live',async({openPhone,request},info)=>{
 const project=info.project.name,code=await ownCode(),name=`Final read ${project}`;
 await ownEvent(request,code,name,'Boy Cubs');
 await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,[1051,1052],[900,1000]);
 expect((await request.post(`/api/lead/events/${code}/complete-stage`,{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{stage:'heats'}})).ok()).toBe(true);
 const sam=(await openPhone(`Sam read ${project}`)).page,jo=(await openPhone(`Jo read ${project}`)).page;
 await openRace(sam,name,'Boy Cubs','Final');await openRace(jo,name,'Boy Cubs','Final');
 await here(sam,1052).click();
 await expect(attendance(jo)).toHaveText([/1051\s*Here/,/1052\s*Absent/],live);
 await expect(jo.locator('.rz-prompt__meta')).toHaveText('Final · 1 of 2 here');
 await here(jo,1052).click();
 await expect(attendance(sam)).toHaveText([/1051\s*Here/,/1052\s*Here/],live);
 expect(await lookProblems(jo)).toEqual([]);await jo.screenshot({path:info.outputPath('final-attendance.png'),fullPage:true});
 await deleteCurrentRace(request,code);
});
