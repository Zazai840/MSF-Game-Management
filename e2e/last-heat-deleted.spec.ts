import {eventTab,expect,expectToast,flowRace,live,lookProblems,openLeadsBarTab,ownCode,ownEvent,ownName,ownWristbands,press,raceAction,recordRace,resultsCard,test,type APIRequestContext,type Page} from './fixtures.js';
const owner=()=>process.env.E2E_OWNER_TOKEN!;
/** An event of its own with Heat 1 saved and its final made, both by the owner through the API. */
async function heatAndFinal(request:APIRequestContext,name:string) {
  const code=await ownCode(),child=await ownWristbands('Girl Cubs',2);
  await ownEvent(request,code,name);
  await recordRace(request,owner(),code,[child(1),child(2)],[900,1000]);
  expect((await request.post('/api/races',{headers:{authorization:`Bearer ${owner()}`},data:{eventCode:code,kind:'final'}})).ok()).toBe(true);
  return code;
}
/** From Races: the lead opens the event's Heat 1 page under Results and its Delete screen. */
async function openDeleteHeat1(page:Page,code:string) {
  await openLeadsBarTab(page,'Results');await press(resultsCard(page,code));await eventTab(page,'Heats');
  await press(page.getByRole('listitem').getByRole('button',{name:'Open Heat 1',exact:true}));await raceAction(page,'Delete Heat 1');
}
const card=(page:Page,name:string)=>page.getByRole('article',{name:`${name} · Girl Cubs`});
test('the last heat is deleted after the final was made: the final goes, New race offers Heat 1, and Restore brings "+ Final" back',async({openPhone,request},info)=>{
  test.setTimeout(60000);
  const name=ownName('Starts again'),code=await heatAndFinal(request,name);
  const lead=(await openPhone(ownName('Starts again lead'),{lead:true})).page,other=(await openPhone(ownName('Starts again other lead'),{lead:true})).page;
  await expect(card(other,name).getByRole('button',{name:/^(Heat \d|Final)/})).toHaveText(['H1','F']);
  await openDeleteHeat1(lead,code);
  await press(lead.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 1',exact:true}));await expectToast(lead,'Heat 1 moved to Deleted races');
  // The event has no race left on Races: the final went with the heat, and the heats are open again.
  await expect(card(other,name).getByRole('button',{name:/^(Heat \d|Final)/})).toHaveCount(0,live);
  await other.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=other.getByRole('dialog',{name:'New race'});
  await sheet.getByRole('button',{name,exact:true}).click();await sheet.getByRole('button',{name:/^Girl Cubs/}).click();
  await expect(sheet.getByRole('button',{name:'Heat 1',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(sheet.getByRole('button',{name:'Create heat 1',exact:true})).toBeEnabled();
  expect(await lookProblems(other)).toEqual([]);await other.screenshot({path:info.outputPath('starts-again-new-race.png'),fullPage:true});
  // Only the heat is in Deleted races. Restore puts the heats back, and the lead makes the final again.
  await expect(lead.getByRole('button',{name:/^Open deleted/})).toHaveCount(1);
  expect(await lookProblems(lead)).toEqual([]);await lead.screenshot({path:info.outputPath('starts-again-heats-tab.png'),fullPage:true});
  await press(lead.getByRole('button',{name:/^Open deleted Heat 1/}));await raceAction(lead,'Restore Heat 1');
  await press(lead.getByRole('contentinfo').getByRole('button',{name:'Restore Heat 1',exact:true}));await expectToast(lead,'Heat 1 restored');
  await other.goto('/');
  await expect(card(other,name).getByRole('button',{name:'Create the final from the fastest 6',exact:true})).toBeVisible();
  await expect(card(other,name).getByRole('button',{name:'Add heat 2',exact:true})).toBeVisible();
  expect(await lookProblems(other)).toEqual([]);await other.screenshot({path:info.outputPath('starts-again-restored.png'),fullPage:true});
});
test('with a started final the last heat is not deleted: the Delete screen stays and says "Delete the Final first"',async({openPhone,request},info)=>{
  const name=ownName('Final first'),code=await heatAndFinal(request,name);
  const {race}=await flowRace(request,owner(),code);
  expect((await request.post(`/api/races/${race.id}/absent`,{headers:{authorization:`Bearer ${owner()}`},data:{raceId:race.id,version:race.parts.runners.version,here:race.final!.entries.map(entry=>entry.finalEntryId),absent:[]}})).ok()).toBe(true);
  const lead=(await openPhone(ownName('Final first lead'),{lead:true})).page;
  await openDeleteHeat1(lead,code);
  await press(lead.getByRole('contentinfo').getByRole('button',{name:'Delete Heat 1',exact:true}));
  await expect(lead.getByRole('alert')).toContainText('Delete the Final first');
  await expect(lead.getByRole('heading',{level:2,name:'Delete Heat 1?',exact:true})).toBeVisible();
  expect(await lookProblems(lead)).toEqual([]);await lead.screenshot({path:info.outputPath('delete-the-final-first.png'),fullPage:true});
  await lead.goto('/');
  await expect(card(lead,name).getByRole('button',{name:/^(Heat \d|Final)/})).toHaveText(['H1','F']);
});
