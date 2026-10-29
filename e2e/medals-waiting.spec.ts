import {expect,flowRace,live,lookProblems,ownCode,ownEvent,ownWristbands,recordRace,submitRace,test,writeCheckIn,writeOrder,type APIRequestContext,type Page} from './fixtures.js';
/**
 * Medals waiting on the lead: once an event's medals wait on the lead's Confirm in Results (Final complete, or Event
 * complete on a timed event), the lead's Races home lists it in Ready for you saying so, with Confirm the medals, which
 * opens Results on that check sheet. After the Confirm the card is in Done as "Medals decided". Volunteers see no change.
 */
const card=(page:Page,name:string)=>page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
const status=(page:Page,name:string)=>card(page,name).locator('.rz-racecard__status');
const section=(page:Page,heading:string)=>page.locator(`h2:text-is("${heading}") ~ article`);
const owner=()=>process.env.E2E_OWNER_TOKEN!;
const headers=()=>({authorization:`Bearer ${owner()}`});

/** Confirms the open check sheet, goes back to Races and finds the card in Done as Medals decided. */
async function confirmAndFindDone(page:Page,name:string,sheetName:string) {
  const sheet=page.getByRole('dialog',{name:sheetName,exact:true});
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  const done=page.locator('details',{hasText:/^Done \(\d+\)/});
  await done.locator('summary').click();
  await expect(done.getByRole('article',{name:`${name} · Girl Cubs`,exact:true})).toBeVisible();
  await expect(status(page,name)).toHaveText('Medals decided');
  await expect(card(page,name).getByRole('button',{name:'Confirm the medals',exact:true})).toHaveCount(0);
}
/** The final made by a lead, everyone marked Here, placed in this order and saved. */
async function saveFinal(request:APIRequestContext,code:string,order:number[]) {
  expect((await request.post('/api/races',{headers:headers(),data:{eventCode:code,kind:'final'}})).ok()).toBe(true);
  const {race}=(await flowRace(request,owner(),code));
  const here=race.final!.entries.map(entry=>entry.finalEntryId);
  expect((await request.post(`/api/races/${race.id}/absent`,{headers:headers(),data:{raceId:race.id,version:race.parts.runners.version,here,absent:[]}})).ok()).toBe(true);
  await writeOrder(request,owner(),code,order);
  await submitRace(request,owner(),code);
}

test('a saved 60m final waits in the lead\'s Ready for you; Confirm the medals opens Final complete, and the card moves to Done',async({openPhone,request},info)=>{
  const name=`Medals final ${info.project.name}`,code=await ownCode(),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name);
  await recordRace(request,owner(),code,[w(1),w(2)],[1100,1200]);
  await saveFinal(request,code,[w(2),w(1)]);
  const volunteer=(await openPhone(`Medals final start ${info.project.name}`)).page;
  const {page}=await openPhone(`Medals final lead ${info.project.name}`,{lead:true});
  await expect(section(page,'Ready for you').filter({hasText:name})).toHaveCount(1);
  await expect(status(page,name)).toHaveText('Final saved · confirm the medals');
  await expect(card(page,name).getByRole('button',{name:/^Final/})).toHaveAccessibleName('Final, saved');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-waiting.png'),fullPage:true});
  // A volunteer's card is as before: done, under In progress, with no confirm.
  await expect(section(volunteer,'In progress').filter({hasText:name})).toHaveCount(1);
  await expect(status(volunteer,name)).toHaveText('Heat 1 and the final done');
  await expect(card(volunteer,name).getByRole('button',{name:'Confirm the medals',exact:true})).toHaveCount(0);
  await card(page,name).getByRole('button',{name:'Confirm the medals',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:`${name} Girl Cubs`,exact:true})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Final complete',exact:true})).toContainText(`1st: ${w(2)}`);
  await page.screenshot({path:info.outputPath('final-complete-sheet.png'),fullPage:true});
  await confirmAndFindDone(page,name,'Final complete');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('final-done.png'),fullPage:true});
});

test('a timed event waits on Event complete only while every race so far is saved, and moves to Done once confirmed',async({openPhone,request},info)=>{
  const name=`Medals timed ${info.project.name}`,code=await ownCode(),w=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,owner(),code,[w(1)],[1200]);
  const {page}=await openPhone(`Medals timed lead ${info.project.name}`,{lead:true});
  await expect(section(page,'Ready for you').filter({hasText:name})).toHaveCount(1);
  await expect(status(page,name)).toHaveText('Every race saved · confirm the medals after the last race');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('timed-waiting.png'),fullPage:true});
  // Another heat is running: the card waits on it, not on the lead.
  await writeCheckIn(request,owner(),code,[w(2)]);
  await expect(section(page,'In progress').filter({hasText:name})).toHaveCount(1,live);
  await expect(card(page,name).getByRole('button',{name:'Confirm the medals',exact:true})).toHaveCount(0);
  await recordRace(request,owner(),code,[w(2)],[1300]);
  await expect(status(page,name)).toHaveText('Every race saved · confirm the medals after the last race',live);
  await card(page,name).getByRole('button',{name:'Confirm the medals',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Event complete',exact:true})).toBeVisible();
  await confirmAndFindDone(page,name,'Event complete');
});
