import {eventTab,expect,flowPost,live,lookProblems,ownCode,ownEvent,ownName,ownWristbands,press,pullToRefresh,recordRace,test,type Page} from './fixtures.js';
const attendance=(page:Page)=>page.getByRole('list',{name:'Who is here'}).getByRole('listitem');
const mark=(page:Page,wristband:number,which:'Here'|'Absent')=>page.getByRole('button',{name:`${wristband}: ${which}`,exact:true});
const plusRunner=(page:Page)=>page.getByRole('button',{name:'+ Runner',exact:true});

test('"+ Runner" at an individual final\'s start line: shown while a place is free, any wristband with its warning, a reason, then Here as Added; the lead reads it on the Final and Notes tabs',async({openPhone,request},info)=>{
 const code=await ownCode(),name=ownName('Plus runner'),n=await ownWristbands('Boy Cubs',8);
 await ownEvent(request,code,name,'Boy Cubs');
 // 11 to 16 are the six fastest; 17 is 7th.
 for(const [runners,times] of [[[n(11),n(12),n(13),n(14),n(15),n(16)],[900,1000,1100,1200,1300,1400]],[[n(17)],[1500]]]) await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,runners,times);
 const sam=await openPhone(ownName('Sam plus runner')),lead=await openPhone(ownName('Lena plus runner'),{lead:true}),page=sam.page;
 const finalId=(await flowPost(request,lead.token,'/api/races',{eventCode:code,kind:'final'})).race.id;
 await page.goto(`/races/${finalId}`);
 await expect(page.getByRole('heading',{level:2,name:'Who is here?'})).toBeVisible();
 // Nobody is Absent: no place is free.
 await expect(plusRunner(page)).toHaveCount(0);
 for(const wristband of [n(11),n(13),n(14),n(15),n(16)]) await press(mark(page,wristband,'Here'));
 await press(mark(page,n(12),'Absent'));
 // A place is free: "+ Runner" sits below "Call up next fastest", which works as today.
 await expect(page.locator('main').getByRole('button',{name:/^(Call up next fastest|\+ Runner)/})).toHaveText([`Call up next fastest: ${n(17)} (7th)`,'+ Runner']);
 await plusRunner(page).scrollIntoViewIfNeeded();
 expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('final-plus-runner.png'),fullPage:true});
 await press(plusRunner(page));
 await expect(page.getByRole('heading',{level:2,name:'Runner to add: wristband number?'})).toBeVisible();
 // An unknown number: its warning first (Keep), then "Why the change?", which has no "Wrong number" on an add.
 await page.getByLabel('Wristband number',{exact:true}).fill('7050');
 await press(page.getByRole('button',{name:'Add runner',exact:true}));
 const why=page.getByRole('dialog',{name:'Why the change?',exact:true}),save=why.getByRole('button',{name:'Save',exact:true});
 await expect(why).toHaveCount(0);
 await press(page.getByRole('alert').getByRole('button',{name:'Keep',exact:true}));
 await expect(why.locator('.rz-choice')).toHaveText(['Did not want to run','Hurt','Not found','Other']);
 expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('final-plus-runner-reason.png'),fullPage:true});
 // Cancel saves nothing: the box keeps the number typed.
 await press(why.getByRole('button',{name:'Cancel',exact:true}));
 await expect(why).toHaveCount(0);
 await expect(page.getByLabel('Wristband number',{exact:true})).toHaveValue('7050');
 await press(page.getByRole('button',{name:'Add runner',exact:true}));
 await press(page.getByRole('alert').getByRole('button',{name:'Keep',exact:true}));
 await press(why.getByRole('button',{name:'Not found',exact:true}));
 await press(save);
 // Back on the list: the runner is Here, Added, in the last row, and 6 are Here so no place is free.
 await expect(page.getByRole('heading',{level:2,name:'Who is here?'})).toBeVisible();
 await expect(attendance(page).last()).toContainText('Added');
 await expect(attendance(page).last()).toContainText('7050');
 await expect(mark(page,7050,'Here')).toHaveAttribute('aria-pressed','true');
 await expect(plusRunner(page)).toHaveCount(0);
 expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('final-plus-runner-added.png'),fullPage:true});
 // A wrong add: marked Absent, the place is free again.
 await press(mark(page,7050,'Absent'));
 await expect(plusRunner(page)).toBeVisible();
 // The lead's Final tab shows the added runner, with no new button; the Notes tab has the note.
 await lead.page.goto(`/results/${code}`);
 await eventTab(lead.page,'Final');
 await lead.page.getByText('Line-up, fastest first',{exact:true}).click();
 await expect(lead.page.getByRole('list',{name:'Line-up, fastest first'}).getByRole('listitem').last()).toHaveText('Added · 7050 · Absent · no final place',live);
 await expect(lead.page.locator('main').getByRole('button',{name:/\+ Runner|Add a runner/})).toHaveCount(0);
 await eventTab(lead.page,'Notes');
 await expect(lead.page.getByRole('list',{name:'Audit notes'})).toContainText('added 7050 to the Final - Not found');
});

test('"Call up next fastest" hides once "+ Runner" fills the free place, the other finalists not marked: at the start line and on the lead\'s Final tab',async({openPhone,request},info)=>{
 const code=await ownCode(),name=ownName('Call up hides'),n=await ownWristbands('Boy Cubs',8);
 await ownEvent(request,code,name,'Boy Cubs');
 // 11 to 16 are the six fastest; 17 is 7th.
 for(const [runners,times] of [[[n(11),n(12),n(13),n(14),n(15),n(16)],[900,1000,1100,1200,1300,1400]],[[n(17)],[1500]]]) await recordRace(request,process.env.E2E_OWNER_TOKEN!,code,runners,times);
 const sam=await openPhone(ownName('Sam call up hides')),lead=await openPhone(ownName('Lena call up hides'),{lead:true}),page=sam.page;
 const callUp=(page:Page)=>page.getByRole('button',{name:/^Call up next fastest/});
 const finalId=(await flowPost(request,lead.token,'/api/races',{eventCode:code,kind:'final'})).race.id;
 await page.goto(`/races/${finalId}`);
 // One Absent, the rest not marked: a place is free.
 await press(mark(page,n(12),'Absent'));
 await expect(callUp(page)).toHaveText(`Call up next fastest: ${n(17)} (7th)`);
 await lead.page.goto(`/results/${code}`);await eventTab(lead.page,'Final');
 await expect(callUp(lead.page)).toBeVisible();
 // "+ Runner" fills it: neither the call-up nor "+ Runner" shows, here or on the lead's Final tab.
 await press(plusRunner(page));
 await page.getByLabel('Wristband number',{exact:true}).fill(String(n(18)));
 await press(page.getByRole('button',{name:'Add runner',exact:true}));
 const why=page.getByRole('dialog',{name:'Why the change?',exact:true});
 await press(why.getByRole('button',{name:'Not found',exact:true}));await press(why.getByRole('button',{name:'Save',exact:true}));
 await expect(mark(page,n(18),'Here')).toHaveAttribute('aria-pressed','true');
 await expect(callUp(page)).toHaveCount(0);await expect(plusRunner(page)).toHaveCount(0);
 expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('final-call-up-hidden.png'),fullPage:true});
 await pullToRefresh(lead.page);await expect(callUp(lead.page)).toHaveCount(0);
 expect(await lookProblems(lead.page)).toEqual([]);
});
