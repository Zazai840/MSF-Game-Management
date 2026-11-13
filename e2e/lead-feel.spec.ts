import {expect,lookProblems,ownCode,ownEvent,ownName,ownWristbands,recordRace,resultsCard,signInThroughApi,test} from './fixtures.js';

test('Results on a phone lists one event per line in the Races card\'s type; a laptop keeps the grid',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('Phone cards a long event name');
  await ownEvent(request,code,name,'Girl Cubs','timed');
  await recordRace(request,await signInThroughApi(request,ownName('Phone cards timer')),code,[(await ownWristbands('Girl Cubs',1))(1)],[1000]);
  const {page}=await openPhone(ownName('Phone cards lead'),{lead:true});
  await page.getByRole('navigation',{name:'Lead screens'}).getByRole('button',{name:'Results',exact:true}).click();
  const card=resultsCard(page,code),list=page.locator('.rz-events').filter({has:card});
  await expect(card).toBeVisible();
  const cardBox=(await card.boundingBox())!,listBox=(await list.boundingBox())!;
  const type=await card.evaluate(element=>[getComputedStyle(element.querySelector('.rz-event__name')!).fontSize,getComputedStyle(element.querySelector('.rz-event__status')!).fontSize]);
  if(info.project.name==='desktop') {
    expect(cardBox.width).toBeLessThan(listBox.width*0.6);
    expect(type).toEqual(['14px','12px']);
  } else {
    expect(Math.abs(cardBox.width-listBox.width)).toBeLessThan(1);
    expect(type).toEqual(['22px','14px']);
  }
  expect(await lookProblems(page)).toEqual([]);
});

test('an event shows one callout for the problems of one heat, with one line each and one button; a heat with one problem keeps its own callout',async({openPhone,request},info)=>{
  const code=await ownCode(),name=ownName('One callout'),girls=await ownWristbands('Girl Cubs',2),scouts=await ownWristbands('Boy Scouts',3);
  await ownEvent(request,code,name,'Girl Cubs','timed');
  const timer=await signInThroughApi(request,ownName('One callout timer'));
  // Heat 1: three wristbands of another section, kept. Heat 2: one.
  await recordRace(request,timer,code,[girls(1),scouts(1),scouts(2)],[1000,1100,1200],[scouts(1),scouts(2)]);
  await recordRace(request,timer,code,[girls(2),scouts(3)],[1300,1400],[scouts(3)]);
  const {page}=await openPhone(ownName('One callout lead'),{lead:true});
  await page.getByRole('navigation',{name:'Lead screens'}).getByRole('button',{name:'Results',exact:true}).click();
  await resultsCard(page,code).click();
  const problems=page.getByRole('main').getByRole('alert');
  await expect(problems).toHaveCount(2);
  const shared=problems.filter({hasText:'Heat 1 · 2 things to check'});
  await expect(shared).toContainText(`${scouts(1)} is not a Girl Cubs number.`);
  await expect(shared).toContainText(`${scouts(2)} is not a Girl Cubs number.`);
  await expect(shared).not.toContainText('Correct it or mark it checked');
  await expect(shared.getByRole('button')).toHaveText(['Check Heat 1']);
  const alone=problems.filter({hasText:'A wristband number needs checking'});
  await expect(alone).toContainText(`${scouts(3)} is not a Girl Cubs number.`);
  await expect(alone.getByRole('button')).toHaveText(['Check Heat 2']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('one-callout.png'),fullPage:true});
  // The shared callout's button opens the heat's race page, where each problem has its own callout.
  await shared.getByRole('button',{name:'Check Heat 1',exact:true}).click();
  await expect(page.getByRole('main').getByRole('alert').filter({hasText:'A wristband number needs checking'})).toHaveCount(2);
});
