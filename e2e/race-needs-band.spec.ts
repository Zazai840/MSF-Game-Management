import {expect,flowPost,jobBand,lookProblems,openRace,ownCode,ownEvent,ownName,ownWristbands,test,writeCheckIn,writeOrder,writeTimes,type Page} from './fixtures.js';

/** The band says that sentence, edge to edge directly below the job band. */
async function bandSays(page:Page,sentence:string) {
  const band=page.locator('.rz-needsband');
  await expect(band).toHaveText(sentence);
  const box=(await band.boundingBox())!,above=(await jobBand(page).boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(await page.evaluate(()=>document.documentElement.clientWidth));
  expect(Math.abs(box.y-(above.y+above.height))).toBeLessThan(1);
}

test('one band on a race tells every role and the lead what the race still needs and who taps it, and that it is in Results once it saves, with no reload',async({openPhone,request},info)=>{
  const name=ownName('Needs band sprint'),code=await ownCode(),w=await ownWristbands('Girl Cubs',2),first=w(1),second=w(2);
  await ownEvent(request,code,name);
  const start=await openPhone(ownName('Needs band start'),{job:'start'}),finish=await openPhone(ownName('Needs band finish'),{job:'finish'});
  const timer=await openPhone(ownName('Needs band timer'),{job:'timer'}),lead=await openPhone(ownName('Needs band lead'),{lead:true});
  const {race}=await writeCheckIn(request,start.token,code,[first,second]);
  const pages=[start.page,finish.page,timer.page,lead.page];
  for(const page of pages) await openRace(page,name);
  /** Every phone shows the sentence, the race open all along. */
  const everyone=async(sentence:string)=>{for(const page of pages) await bandSays(page,sentence);};
  // A missing detail comes first: nobody has a place, then a place has no time.
  await everyone('Not in Results yet: 2 runners have no place.');
  for(const page of pages) expect(await lookProblems(page)).toEqual([]);
  await timer.page.screenshot({path:info.outputPath('needs-band-detail.png')});
  await writeOrder(request,finish.token,code,[first,second]);
  await everyone('Not in Results yet: 1st place has no time.');
  // Nothing but done buttons missing: the band names the first one and its role.
  await writeTimes(request,timer.token,code,[1100,1200]);
  await everyone("Not in Results yet. Start line: tap That's everyone.");
  await flowPost(request,start.token,`/api/races/${race.id}/steps/runners/done`,{});
  await flowPost(request,timer.token,`/api/races/${race.id}/steps/times/done`,{});
  await everyone('Not in Results yet. Finish line: tap Save the order.');
  await lead.page.screenshot({path:info.outputPath('needs-band-button-lead.png')});
  // The everyday sentence stays on one line, at 360px too: the band takes as little of the screen as it can.
  for(const page of pages) expect((await page.locator('.rz-needsband').boundingBox())!.height).toBeLessThan(32);
  // The words are never "not saved": every tap is saved.
  for(const page of pages) await expect(page.getByText(/not saved/i)).toHaveCount(0);
  // The last done button saves the race: the band changes on every phone.
  await flowPost(request,finish.token,`/api/races/${race.id}/steps/positions/done`,{});
  await everyone('In Results.');
  for(const page of pages) expect(await lookProblems(page)).toEqual([]);
  await timer.page.screenshot({path:info.outputPath('needs-band-in-results.png')});
  // How much of the screen the band takes, for the report.
  console.log(`needs band height ${info.project.name}: ${(await timer.page.locator('.rz-needsband').boundingBox())!.height}px at ${timer.page.viewportSize()!.width}px`);
});
