// PROTOTYPE - throwaway (map #231, ticket #237). Screenshots each start-line variant against `npm run prototype:relay-teams`.
// Run: npm run prototype:relay-teams, then node scripts/prototype-relay-teams-shots.mjs <out-dir>
import { chromium } from '@playwright/test';
const base=process.env.BASE||'http://127.0.0.1:5187',out=process.argv[2]||'prototype-shots';
const browser=await chromium.launch();
const errors=[];
for(const variant of ['A','B','C']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(`${variant}: ${error.message}`));
  const shot=(name,fullPage=false)=>page.screenshot({path:`${out}/${variant}-${name}.png`,fullPage});
  const settle=()=>page.waitForTimeout(250);
  await page.goto(`${base}/prototype/relay-teams?variant=${variant}`);
  await page.getByText('Heat 2 ·').first().waitFor();
  await settle();
  await shot('01-heat-2');
  // Type Team 5: 2051, 2052, then 2041 (already in Team 4 in this heat: refused), fixed to 2022 (ran in Heat 1: warning).
  if(variant==='A') {
    const box=page.locator('#leg');
    for(const number of ['2051','2052']) {await box.fill(number);await box.press('Enter');}
    await settle();await shot('02-typing');
    await box.fill('2041');await box.press('Enter');await settle();await shot('03-refused');
    await page.getByRole('button',{name:'Fix number'}).tap();
    await box.fill('2022');await box.press('Enter');await settle();await shot('04-warning');
    await page.getByRole('button',{name:'Keep'}).tap();
    await box.fill('2054');await box.press('Enter');await settle();await shot('05-saved');
  } else {
    await page.getByRole('button',{name:/^(Add team 5|Team 5)$/}).tap();await settle();
    const boxes=page.locator('.proto-four input');
    await boxes.nth(0).fill('2051');await boxes.nth(1).fill('2052');await settle();await shot('02-typing');
    await boxes.nth(2).fill('2041');await boxes.nth(3).focus();await settle();await shot('03-refused');
    await page.getByRole('button',{name:'Fix number'}).tap();
    await boxes.nth(2).fill('2022');await boxes.nth(3).focus();await settle();await shot('04-warning');
    await page.getByRole('button',{name:'Keep'}).tap();
    await boxes.nth(3).fill('2054');await page.getByRole('button',{name:'Save team 5'}).tap();await settle();await shot('05-saved',true);
  }
  // A new, empty heat from "+".
  await page.getByRole('button',{name:'Add heat 3'}).tap();await settle();await shot('06-new-heat');
  await context.close();
}
await browser.close();
if(errors.length) {console.error(errors.join('\n'));process.exit(1);}
