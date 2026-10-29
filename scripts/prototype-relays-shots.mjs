// PROTOTYPE - throwaway (map ticket #186). Screenshots each Relays variant against `npm run prototype:relays`.
// Run: npm run prototype:relays, then node scripts/prototype-relays-shots.mjs <out-dir>
import { chromium } from '@playwright/test';
const base=process.env.BASE||'http://127.0.0.1:5186',out=process.argv[2]||'prototype-shots';
const browser=await chromium.launch();
for(const variant of ['A','B','C']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  const shot=name=>page.screenshot({path:`${out}/${variant}-${name}.png`});
  const tap=(role,name)=>page.getByRole(role,{name,exact:true}).first().tap();
  const job=async label=>{await page.getByRole('button',{name:/^Your job/}).tap();await tap('button',label);};
  await page.goto(`${base}/prototype/relays?variant=${variant}`);
  await page.getByText('Teams ready, no heats yet').waitFor();
  await shot('01-relays-tab');
  // The team list, the variant's way.
  if(variant==='A') await page.getByRole('button',{name:/^Teams 8/}).first().tap();
  if(variant==='B') await page.getByRole('tab',{name:/^Teams/}).tap();
  if(variant==='C') await page.locator('summary').first().tap();
  await page.waitForTimeout(200);
  await shot('02-team-list');
  // Edit team on a team Aisha Noor set: the centred popup.
  const rows=variant==='A'?page.locator('.rz-listrow'):page.locator('.proto-teamrow');
  await rows.filter({hasText:/^7|Team 7/}).getByRole('button',{name:'Edit'}).tap();
  await shot('03-change-anyway');
  await tap('button','Change anyway');await page.waitForTimeout(200);
  await shot('04-edit-team');
  // New team from the foot of the Relays tab.
  await page.goto(`${base}/prototype/relays?variant=${variant}`);
  await page.locator('.rz-footer').getByRole('button',{name:'New team'}).tap();
  await tap('button','4x50m Relay · Girl Cubs');await page.waitForTimeout(200);
  if(variant==='A') {
    for(const number of ['2091','2092']) {await page.locator('#leg').fill(number);await page.locator('#leg').press('Enter');}
    await page.locator('#leg').fill('433');await page.locator('#leg').press('Enter');
  } else {
    const boxes=page.locator('.proto-box input');
    await boxes.nth(0).fill('2091');await boxes.nth(1).fill('2092');await boxes.nth(2).fill('433');
  }
  await page.waitForTimeout(200);
  await shot('05-new-team-warning');
  // Start line, Heat 2 (teams 5 and 6 in, 2 of team 5's children here).
  await page.goto(`${base}/prototype/relays?variant=${variant}&race=r22-h2&role=start`);
  await page.waitForTimeout(300);
  await shot('06-start-line');
  if(variant==='B') {await tap('button','Teams');await page.waitForTimeout(200);await shot('06b-start-line-teams');}
  // Tick team 7 in, then a missed team.
  if(variant==='A') await page.locator('.rz-listrow').filter({hasText:'Team 7'}).getByRole('button',{name:'Add'}).tap();
  if(variant==='B') await page.locator('.proto-teamtiles button').filter({hasText:'7'}).tap();
  if(variant==='C') await page.getByRole('button',{name:'Team 7'}).tap();
  await page.waitForTimeout(200);
  await shot('07-team-ticked');
  if(variant==='B') {await page.locator('.rz-footer').getByRole('button',{name:'New team'}).tap();}
  else await page.locator('main').getByRole('button',{name:'New team'}).tap();
  await page.waitForTimeout(300);
  await shot('08-new-team-at-check-in');
  // Finish line on the same heat.
  await page.goto(`${base}/prototype/relays?variant=${variant}&race=r22-h2&role=start`);
  if(variant==='B') {await tap('button','Teams');await page.waitForTimeout(200);}
  if(variant==='A') for(const team of ['Team 7']) await page.locator('.rz-listrow').filter({hasText:team}).getByRole('button',{name:'Add'}).tap();
  if(variant==='B') for(const team of ['7']) await page.locator('.proto-teamtiles button').filter({hasText:team}).tap();
  if(variant==='C') for(const team of ['Team 7']) await page.getByRole('button',{name:team}).tap();
  await job('Finish line');await page.waitForTimeout(200);
  await shot('09-finish-line');
  await page.locator('.proto-teamtiles button').nth(1).tap();await page.waitForTimeout(150);
  await shot('10-finish-one-placed');
  await page.locator('.rz-footer').getByRole('button',{name:'+ Team not on the list'}).tap();await page.waitForTimeout(200);
  await shot('11-team-not-on-list');
  await page.getByRole('button',{name:'Close'}).tap();
  await tap('button','No other team crossed the line');await page.waitForTimeout(200);
  await shot('12-check-the-order');
  await job('Timer');await page.waitForTimeout(200);
  await page.locator('#place-time').fill('5312');
  await shot('13-timer');
  // A relay final: Here / Absent by team, then the finish.
  await page.goto(`${base}/prototype/relays?variant=${variant}&race=r27-f&role=start`);
  await page.waitForTimeout(300);
  await shot('14-final-start-line');
  await job('Finish line');await page.waitForTimeout(200);
  await shot('15-final-finish-line');
  await context.close();
}
// Variant D, the owner's pick: teams in a bottom sheet from the card.
{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  const shot=name=>page.screenshot({path:`${out}/D-${name}.png`});
  const scrollList=()=>page.locator('.proto-sheetlist').evaluate(list=>list.scrollTo(0,list.scrollHeight));
  await page.goto(`${base}/prototype/relays?variant=D`);
  await page.getByText('Teams ready, no heats yet').waitFor();
  await shot('01-relays-tab');
  await page.getByRole('button',{name:/^Teams 8/}).tap();await page.waitForTimeout(250);
  await shot('02-teams-sheet');
  await scrollList();await page.waitForTimeout(150);
  await shot('03-teams-sheet-scrolled');
  await page.getByRole('button',{name:/^Team 7/}).tap();await page.waitForTimeout(200);
  await shot('04-change-anyway');
  await page.getByRole('button',{name:'Change anyway',exact:true}).tap();await page.waitForTimeout(200);
  await shot('05-edit-team');
  await page.getByRole('button',{name:'Cancel',exact:true}).tap();await page.waitForTimeout(200);
  await page.getByRole('dialog').getByRole('button',{name:'New team'}).tap();await page.waitForTimeout(200);
  const boxes=page.locator('.proto-box input');
  await boxes.nth(0).fill('2091');await boxes.nth(1).fill('2092');await boxes.nth(2).fill('433');await page.waitForTimeout(150);
  await shot('06-new-team-warning');
  await page.getByRole('button',{name:'Fix number',exact:true}).tap();
  await boxes.nth(2).fill('2093');await boxes.nth(3).fill('2094');
  await page.getByRole('button',{name:'Save team 9',exact:true}).tap();await page.waitForTimeout(200);
  await scrollList();await page.waitForTimeout(150);
  await shot('07-team-saved');
  await page.goto(`${base}/prototype/relays?variant=D`);
  await page.locator('.rz-footer').getByRole('button',{name:'New team'}).tap();
  await page.getByRole('button',{name:'4x50m Relay · Girl Cubs',exact:true}).tap();await page.waitForTimeout(200);
  await shot('08-new-team-from-footer');
  await page.goto(`${base}/prototype/relays?variant=D&race=r22-h2&role=start`);
  await page.locator('main').getByRole('button',{name:'New team'}).tap();await page.waitForTimeout(250);
  await shot('09-new-team-at-check-in');
  await context.close();
}
await browser.close();
