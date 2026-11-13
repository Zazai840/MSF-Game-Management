import {chipTexts,expect,expectToast,join,becomeLead,live,lookProblems,makeFinal,openRace,ownCode,ownEvent,ownName,ownWristbands,press,raceAction,recordRace,test,type Page} from './fixtures.js';
/** From Races: opens the unrun final and deletes it on the Delete screen, which goes back to Races. */
async function deleteFinal(page:Page,name:string,forGood:boolean) {
  await openRace(page,name,'Boy Cubs','Final');await raceAction(page,'Delete Final');
  if(forGood) await press(page.getByRole('button',{name:/^Delete for good/}));
  await press(page.getByRole('contentinfo').getByRole('button',{name:forGood?'Delete Final for good':'Delete Final',exact:true}));
  await expectToast(page,forGood?'Final deleted for good':'Final moved to Deleted races');
}
test('a deleted final with no times brings "+ Final" back on Races and in New race, with no new heat; the new final takes the fastest 6 with nobody Here',async({page},info)=>{
  const code=await ownCode(),name=ownName('Final comes back'),n=await ownWristbands('Boy Cubs',2);
  await ownEvent(page.request,code,name,'Boy Cubs');
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[n(1),n(2)],[900,1000]);
  await page.goto('/');await join(page,ownName('Final back lead'),{job:'Start line'});await becomeLead(page);
  await makeFinal(page,name,'Boy Cubs');
  const card=page.getByRole('article',{name:`${name} · Boy Cubs`}),plusFinal=card.getByRole('button',{name:'Create the final from the fastest 6',exact:true});
  // Moved to Deleted races: the card offers "+ Final" at once and no "+" for a heat, because the heats stay complete.
  await deleteFinal(page,name,false);
  await expect(plusFinal).toBeVisible(live);
  expect(await chipTexts(card)).toEqual(['H1','+ Final']);
  await expect(card.getByRole('button',{name:/^Add heat/})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('plus-final-is-back.png'),fullPage:true});
  // New race offers Final, already chosen, with no heat and no hint about heats that still need times.
  await press(page.getByRole('button',{name:'New race',exact:true}));
  const sheet=page.getByRole('dialog',{name:'New race'});
  await press(sheet.getByRole('button',{name,exact:true}));await press(sheet.getByRole('button',{name:`Boy Cubs ${code}`,exact:true}));
  await expect(sheet.getByRole('button',{name:'Final',exact:true})).toBeEnabled();
  await expect(sheet.getByRole('button',{name:'Final',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(sheet.getByRole('button',{name:/^Heat \d/})).toHaveCount(0);
  await expect(sheet.locator('.rz-field__hint')).toHaveText('Boy Cubs already has heat 1.');
  await expect(sheet.getByText(/The final opens when every heat has times/)).toHaveCount(0);
  await expect(sheet.getByText(/heats are finished/)).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);await page.screenshot({path:info.outputPath('new-race-final-is-back.png'),fullPage:true});
  await press(sheet.getByRole('button',{name:'Create the final',exact:true}));
  await press(page.getByRole('dialog',{name:'Have all Boy Cubs heats run?',exact:true}).getByRole('button',{name:'Make the final',exact:true}));
  // The new final: the fastest from the heats, nobody marked.
  const rows=page.getByRole('list',{name:'Who is here'}).getByRole('listitem');
  await expect(rows).toHaveText([new RegExp(`1st fastest\\s*${n(1)}`),new RegExp(`2nd fastest\\s*${n(2)}`)]);
  await expect(rows.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await press(page.getByRole('button',{name:'Back to Races',exact:true}));
  await expect(card).toBeVisible();expect(await chipTexts(card)).toEqual(['H1','F']);
  // Deleted for good: the same, and "+ Final" on the card makes it again.
  await deleteFinal(page,name,true);
  await expect(plusFinal).toBeVisible(live);
  expect(await chipTexts(card)).toEqual(['H1','+ Final']);
  await makeFinal(page,name,'Boy Cubs');
  expect(await chipTexts(card)).toEqual(['H1','F']);
});
