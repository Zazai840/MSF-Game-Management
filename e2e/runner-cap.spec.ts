import {confirmTheMedals,medalPlaces,eventTab,ownName,ownCode,ownEvent,openRace,recordRace,back,openLeadsBarTab,switchJob,becomeLead,expect,join,test,pullToRefresh,type Page,enterTime,flowPost,raceAction,press,expectToast,resultsCard} from './fixtures.js';
async function signInAs(page:Page,name:string,lead=false) {
  await page.goto('/');await join(page,name,{job:'Start line'});
  if(lead) {await becomeLead(page);}
}
async function openResults(page:Page,code:string,name:string) {
  await signInAs(page,name,true);await openLeadsBarTab(page,'Results');await press(resultsCard(page,code));
}

test('a phone checks in 8 runners and carries them through each job in turn, the race saving itself, and Results',async({page,openPhone},info)=>{
  test.setTimeout(60000);
  const code=await ownCode(),name=ownName('Eight'),numbers=[2801,2802,2803,2804,2805,2806,2807,2808];
  await ownEvent(page.request,code,name);
  const {page:phone}=await openPhone(ownName('Eight phone'));
  await phone.getByRole('button',{name:'New race',exact:true}).click();
  const newRace=phone.getByRole('dialog',{name:'New race'});
  await newRace.getByRole('button',{name,exact:true}).click();await newRace.getByRole('button',{name:'Girl Cubs',exact:true}).click();
  await newRace.getByRole('button',{name:'Create heat 1',exact:true}).click();
  const input=phone.getByLabel('Wristband number',{exact:true});
  for(const number of numbers) {await expect(input).toBeEditable();await input.fill(String(number));await input.press('Enter');}
  await expect(phone.getByRole('list',{name:'Wristbands entered'}).getByRole('button')).toHaveCount(8);
  await expect(phone.locator('.rz-prompt__meta')).toHaveText('Heat 1 · 8 runners so far · more than usual');
  await phone.screenshot({path:info.outputPath('start-line-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:"That's everyone",exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Finish line');
  for(const [index,number] of numbers.entries()) await phone.getByRole('button',{name:new RegExp(`^${number} came ${index+1}(st|nd|rd|th)$`)}).click();
  await expect(phone.getByRole('heading',{level:2,name:'Check the order'})).toBeVisible();
  await phone.screenshot({path:info.outputPath('finish-order-eight.png'),fullPage:true});
  await phone.getByRole('button',{name:'Save the order',exact:true}).click();
  await openRace(phone,name);await switchJob(phone,'Timer');
  for(const [index] of numbers.entries()) {await expect(phone.getByRole('heading',{level:2,name:/place time\?$/})).toBeVisible();await enterTime(phone,1200+index*15);}
  await expect(phone.locator('.rz-toast')).toContainText('Times saved');
  await openResults(page,code,ownName('Eight lead'));
  const board=page.getByRole('list',{name:'Provisional leaderboard'});
  await expect(board.getByRole('button',{name:/^Runner /})).toHaveCount(8);await expect(board.getByText('Q',{exact:true})).toHaveCount(6);
  await expect(board.getByRole('button',{name:'Runner 2808 · Heat 1',exact:true})).toContainText('13.05');
  await page.screenshot({path:info.outputPath('results-eight.png'),fullPage:true});
});

test('a lead adds a 7th runner to a saved final and the final is recorded end to end',async({page,openPhone},info)=>{
  test.setTimeout(60000);
  const code=await ownCode(),name=ownName('Seven');
  await ownEvent(page.request,code,name,'Boy Cubs','heats');
  for(const [runners,times] of [[[1801,1802,1803,1804,1805,1806],[900,910,920,930,940,950]],[[1807,1808],[945,1000]]]) {
    await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,runners,times);
  }
  await flowPost(page.request,process.env.E2E_OWNER_TOKEN!,'/api/races',{eventCode:code,kind:'final'});
  // The final of six runs in the race flow: everyone marked Here at the start line, then the finishing order, and it saves itself.
  const {page:phone}=await openPhone(ownName('Seven phone'));await openRace(phone,name,'Boy Cubs','Final');
  await expect(phone.locator('.rz-prompt__meta')).toHaveText('Final · 0 of 6 here · 6 not marked');
  for(const number of [1801,1802,1803,1804,1805,1807]) await phone.getByRole('button',{name:`${number}: Here`,exact:true}).click();
  await expect(phone.locator('.rz-prompt__meta')).toHaveText('Final · 6 of 6 here');
  await phone.getByRole('button',{name:"That's everyone",exact:true}).click();
  await openRace(phone,name,'Boy Cubs','Final');await switchJob(phone,'Finish line');
  for(const [number,place] of [[1801,'1st'],[1807,'2nd'],[1802,'3rd'],[1803,'4th'],[1804,'5th'],[1805,'6th']] as const) await phone.getByRole('button',{name:`${number} came ${place}`,exact:true}).click();
  await phone.getByRole('button',{name:'Save the order',exact:true}).click();
  await expect(phone.locator('.rz-toast')).toContainText('Finishing order saved');
  // A tie for 6th: the lead adds 1806 to the saved final, then gives them their place.
  await openResults(page,code,ownName('Seven lead'));
  await eventTab(page,'Final');await press(page.getByRole('button',{name:'Open final',exact:true}));await raceAction(page,'Correct runner list');
  const docked=page.getByRole('contentinfo');
  await page.getByRole('button',{name:'Add runner',exact:true}).click();await page.getByLabel('Wristband for runner 7',{exact:true}).fill('1806');await press(docked.getByRole('button',{name:'Done',exact:true}));
  await page.screenshot({path:info.outputPath('lead-add-seventh.png'),fullPage:true});
  await press(docked.getByRole('button',{name:'Review runner list',exact:true}));await expect(page.getByRole('heading',{level:2,name:'7 runners. Is that right?',exact:true})).toBeVisible();
  await press(page.getByRole('button',{name:'New runners did not finish',exact:true}));
  // A runner added to a final needs the lead's comment.
  await expect(docked.getByText('Write a comment first.',{exact:true})).toBeVisible();
  await page.getByLabel('Comment',{exact:true}).fill('Tie for 6th');await press(docked.getByRole('button',{name:'Save runner list',exact:true}));await expectToast(page,'Runner list saved');
  await raceAction(page,'Correct finishing order');
  await press(page.getByRole('button',{name:'Give a place to 1806',exact:true}));
  const rows=page.getByRole('list',{name:'Finishing order',exact:true}).getByRole('listitem');
  await expect(rows).toHaveCount(7);await expect(rows.last()).toContainText('7th1806');
  await page.screenshot({path:info.outputPath('lead-order-seventh.png'),fullPage:true});
  await press(page.getByRole('contentinfo').getByRole('button',{name:'Save finishing order',exact:true}));await expectToast(page,'Finishing order saved');
  await back(page,`${name} · Boy Cubs`);await eventTab(page,'Final');await pullToRefresh(page);
  const final=page.getByRole('list',{name:'Final leaderboard'});await expect(final.getByRole('button')).toHaveCount(7);
  await expect(final.getByRole('button').first()).toContainText('1801');await expect(final.getByRole('button').last()).toContainText('1806');
  await page.getByRole('button',{name:'Confirm the medals',exact:true}).click();await expect(medalPlaces(page).first()).toContainText('1801');await confirmTheMedals(page);
  await expect(page.getByText('Day export 1st 1801 · 2nd 1807 · 3rd 1802',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('final-complete-seven.png'),fullPage:true});
});
