// PROTOTYPE - throwaway (map #231, ticket #243). Screenshots each look of the tie sheet and Confirm the medals against `npm run prototype:lead-sheets`.
// Run: npm run prototype:lead-sheets, then node scripts/prototype-lead-sheets-shots.mjs <out-dir>
import { chromium } from '@playwright/test';
const base=process.env.BASE||'http://127.0.0.1:5188',out=process.argv[2]||'prototype-shots';
const browser=await chromium.launch();
const errors=[];
for(const variant of ['A','B','C']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(`${variant}: ${error.message}`));
  const shot=(name,fullPage=false)=>page.screenshot({path:`${out}/${variant}-${name}.png`,fullPage});
  const settle=()=>page.waitForTimeout(300);
  await page.goto(`${base}/prototype/lead-sheets?variant=${variant}`);
  await page.getByRole('button',{name:'Confirm the medals'}).waitFor();
  await page.getByRole('button',{name:'Confirm the medals'}).tap();await settle();
  await shot('01-confirm-medals');
  // The tie: Run-off held, then 1011 dragged above 1009 with the keyboard on its handle.
  if(variant!=='C') {await page.getByRole('button',{name:'Settle tie'}).tap();await settle();await shot('02-tie');}
  await page.getByRole('button',{name:'Run-off held'}).tap();await settle();
  const handle=page.getByRole('button',{name:'Move 1011'});
  await handle.focus();await page.keyboard.press('ArrowUp');await settle();
  await shot('03-tie-order');
  await page.getByRole('button',{name:'Save tie'}).tap();await settle();
  // Heat 3: the real app would open it; the prototype lets it be pretended saved.
  await page.getByRole('button',{name:'Open Heat 3'}).tap();await page.getByRole('button',{name:'Pretend saved'}).tap();await settle();
  await shot('04-ready',variant!=='A');
  await page.getByRole('button',{name:'Confirm the medals'}).last().tap();await settle();
  await shot('05-confirmed');
  await context.close();
}
await browser.close();
if(errors.length) {console.error(errors.join('\n'));process.exit(1);}
