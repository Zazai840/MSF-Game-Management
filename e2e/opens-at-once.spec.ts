import {expect,join,lookProblems,ownCode,ownEvent,ownName,test,writeCheckIn,racesListStream} from './fixtures.js';

test('a lead screen seen before opens at once with what it showed last, and a first open shows the spinner over Opening',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('At once');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const {page,token}=await openPhone(ownName('At once lead'),{lead:true});
  await writeCheckIn(request,token,code,[2941]);
  const bar=page.getByRole('navigation',{name:'Lead screens'}),tab=(label:string)=>bar.getByRole('button',{name:label,exact:true});
  const card=page.getByRole('button').filter({has:page.locator('.rz-code-tag',{hasText:new RegExp(`^${code}$`)})});
  const opening=page.getByRole('status').filter({hasText:'Opening…'});
  // The first open of Results, its read held back: the spinner over "Opening…", in the middle of the screen.
  let release!:()=>void;let held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/lead/results',async route=>{await held;await route.continue();});
  await tab('Results').click();
  await expect(opening).toBeVisible();
  await expect(opening.locator('.rz-spinner')).toBeVisible();
  const line=(await opening.boundingBox())!,screen=page.viewportSize()!;
  expect(Math.abs(line.x+line.width/2-screen.width/2)).toBeLessThan(2);
  expect(line.y).toBeGreaterThan(screen.height/4);
  expect(await lookProblems(page)).toEqual([]);
  release();
  await expect(card).toBeVisible();
  const updated=await page.locator('.rz-refresh').textContent();
  // Seen once: from Races it opens at once with the same cards and the time they arrived, while the new read is held.
  await tab('Races').click();
  // Races has shown the race before it is left, so that is what it remembers.
  const raceCard=page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
  await expect(raceCard).toBeVisible();
  held=new Promise<void>(resolve=>{release=resolve;});
  await tab('Results').click();
  await expect(card).toBeVisible();
  await expect(opening).toHaveCount(0);
  await expect(page.locator('.rz-refresh')).toHaveText(updated!);
  // Races too, with its stream held.
  await page.route(racesListStream,()=>{});
  await tab('Races').click();
  await expect(raceCard).toBeVisible();
  release();
});

test('what a phone showed last goes with Log out: the next person sees Opening, not the last person\'s races',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('At once gone');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const person=ownName('At once first'),{page,token}=await openPhone(person);
  await writeCheckIn(request,token,code,[2942]);
  const card=page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
  await expect(card).toBeVisible();
  await page.getByRole('button',{name:`${person}: Log out`,exact:true}).click();
  await page.getByRole('menuitem',{name:'Log out',exact:true}).click();
  await expect(page.getByLabel('Full name',{exact:true})).toBeVisible();
  await page.route(racesListStream,()=>{});
  await join(page,ownName('At once second'),{job:'Timer'});
  await expect(page.getByRole('status').filter({hasText:'Opening…'})).toBeVisible();
  await expect(card).toHaveCount(0);
});
