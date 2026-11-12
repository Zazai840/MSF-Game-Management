import {ownName,ownCode,back,press,expect,leadMenuButton,lookProblems,openLeadMenu,openRace,ownEvent,recordRace,submitRace,test,writeCheckIn,writeOrder,writeTimes,type Page} from './fixtures.js';
/**
 * A zone lead in the race flow: no To check screen. Issues live on races: a lead's Action required is the groups with
 * open issues, each card names them, and a saved race opens as its race page with them on top (lead-race-page.spec,
 * saved-race-page.spec). Results and Day setup are on the lead's bar.
 */
const card=(page:Page,name:string,section='Girl Cubs')=>page.getByRole('article',{name:`${name} · ${section}`,exact:true});
const status=(page:Page,name:string)=>card(page,name).locator('.rz-racecard__status');
const actionRequired=(page:Page)=>page.locator('h2:text-is("Action required") ~ article');
const owner=()=>process.env.E2E_OWNER_TOKEN!;

test('a lead\'s Action required is the groups with open issues or medals to confirm, each card naming them, and the lead\'s bar opens Results and Day setup',async({openPhone,request},info)=>{
  const name=ownName('Lead issues'),calm=ownName('Lead calm'),code=await ownCode(),calmCode=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');await ownEvent(request,calmCode,calm,'Girl Cubs','timed');
  // A kept time faster than the place before, and a calm race.
  await recordRace(request,owner(),code,[2001,2002],[1600,1305]);
  await recordRace(request,owner(),calmCode,[2011],[1400]);
  const {page}=await openPhone(ownName('Lead issues'),{lead:true});
  await expect(page.getByRole('button',{name:'Your role is Zone lead. Change job',exact:true})).toBeVisible();
  // The problem is a button on the card, in place of the status line.
  await expect(card(page,name).getByRole('button',{name:'Check Heat 1 · 1 time',exact:true})).toBeVisible();
  await expect(status(page,name)).toHaveCount(0);
  await expect(actionRequired(page).filter({hasText:name})).toHaveCount(1);
  // A lead's first section is Action required; Ready for you is a volunteer's.
  await expect(page.getByRole('heading',{level:2,name:'Ready for you'})).toHaveCount(0);
  // A calm event, every race saved, is ready for the lead too: its medals wait on the lead's Confirm.
  await expect(actionRequired(page).filter({hasText:calm})).toHaveCount(1);
  await expect(status(page,calm)).toHaveText('Every race saved · confirm the medals after the last race');
  await expect(card(page,name).getByRole('button',{name:/^Heat 1/})).toHaveAccessibleName('Heat 1, saved');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-races.png'),fullPage:true});
  // The lead's bar: Races, Results and Day setup.
  await expect(leadMenuButton(page).getByRole('button')).toHaveText(['Races','Results','Day setup']);
  await openLeadMenu(page,'Results');
  await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await back(page,'Races');
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expect(page.getByText(process.env.E2E_OLYMPICS_PASSWORD!,{exact:true})).toBeVisible();
  await expect(page.getByText(process.env.E2E_LEAD_CODE!,{exact:true})).toBeVisible();
});

test('a lead\'s card counts issues by race and kind, the race page marks the wrong time amber, and its button offers the corrections',async({openPhone,request},info)=>{
  const name=ownName('Lead counts'),code=await ownCode();
  await ownEvent(request,code,name,'Girl Cubs','timed');
  // Two kept wrong-section numbers, a runner who did not finish checked in first, and a kept wrong time in 3rd place.
  await writeCheckIn(request,owner(),code,[2003,3045,4046,2001,2002],[3045,4046]);
  await writeOrder(request,owner(),code,[2002,3045,2001,4046],{didNotFinish:[2003]});
  await writeTimes(request,owner(),code,[1300,1400,1350,1500],[2]);
  await submitRace(request,owner(),code);
  const {page}=await openPhone(ownName('Lead counts'),{lead:true});
  // Groups come newest first; both of these date from the same saved race, so either may lead.
  await expect(card(page,name).getByRole('button',{name:/^Check /})).toHaveText([/^Check Heat 1 · (2 wristbands|1 time)$/,/^Check Heat 1 · (2 wristbands|1 time)$/]);
  // The chip opens the race page: the wrong time's row is amber, and its button opens the corrections.
  await openRace(page,name);
  const record=page.getByRole('list',{name:'Current record',exact:true});
  await expect(record.locator('.rz-lead-row--warn').filter({hasText:'13.50'})).toHaveCount(1);
  await page.screenshot({path:info.outputPath('lead-times-one-amber.png'),fullPage:true});
  await press(page.getByRole('main').getByRole('button',{name:'Correct or delete Heat 1',exact:true}));
  await expect(page.getByRole('dialog',{name:'Heat 1 · actions',exact:true}).getByRole('button')).toHaveText(['','Correct times','Correct finishing order','Correct runner list','Re-run race','Delete Heat 1']);
  expect(await lookProblems(page)).toEqual([]);
});
