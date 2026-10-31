// PROTOTYPE - throwaway (map #231, ticket #248). Screenshots every screen of each look against `npm run prototype:lead-screens`.
// Run: npm run prototype:lead-screens, then node scripts/prototype-lead-screens-shots.mjs <out-dir>
import { chromium } from '@playwright/test';
const base=process.env.BASE||'http://127.0.0.1:5189',out=process.argv[2]||'prototype-shots';
const browser=await chromium.launch();
const errors=[];
for(const variant of ['A','B','C']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(`${variant}: ${error.message}`));
  await page.goto(`${base}/prototype/lead-screens?variant=${variant}`);
  const jump=page.getByLabel('Jump to screen');
  await jump.waitFor();
  const labels=(await jump.locator('option').allTextContents()).slice(1);
  for(const [index,label] of labels.entries()) {
    await jump.selectOption(label);await page.waitForTimeout(250);
    const name=`${variant}-${String(index+1).padStart(2,'0')}-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}.png`;
    await page.screenshot({path:`${out}/${name}`,fullPage:true});
  }
  await context.close();
}
await browser.close();
if(errors.length) {console.error(errors.join('\n'));process.exit(1);}
