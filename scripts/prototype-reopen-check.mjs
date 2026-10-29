// PROTOTYPE - throwaway (map ticket #183). Tapping a held wristband box opens the number to edit, no Fix number.
// Run against `npm run prototype`: node scripts/prototype-reopen-check.mjs <out-dir>
import { chromium } from '@playwright/test';
const base=process.env.BASE||'http://127.0.0.1:3000',out=process.argv[2]||'prototype-shots';
const post=async(path,data,token)=>{
  const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...token?{authorization:`Bearer ${token}`}:{}},body:JSON.stringify(data)});
  if(!response.ok) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
};
const get=async(path,token)=>(await fetch(base+path,{headers:{authorization:`Bearer ${token}`}})).json();
const assert=(ok,what)=>{if(!ok) throw new Error(`FAILED: ${what}`);console.log(`ok - ${what}`);};
const owner=(await post('/api/owner-sign-in',{password:'prototype',name:'Prototype Owner',profiles:[]})).token;
const {pass}=await post('/api/password',{password:(await get('/api/day',owner)).olympicsPassword});
const browser=await chromium.launch();
const run=Date.now()%100000;
for(const [index,variant] of ['Today','A'].entries()) {
  const good=String(2000+((run+index*131)%900));
  const token=(await post('/api/profiles',{pass,name:`Reopen ${variant} ${run}`})).token;
  const me=await get('/api/me',token);
  const group=(await get('/api/races',token)).groups.find(item=>item.heatsOpen && item.event.section==='Girl Cubs' && item.event.name.includes('60'));
  const made=await post('/api/races',{eventCode:group.event.code,kind:'heat',number:group.nextHeat},token);
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  await page.goto(base+'/');
  await page.evaluate(([token,role])=>{localStorage.setItem('msf:token',token);localStorage.setItem('msf:role',role);},[token,JSON.stringify({day:me.dayId,role:'start'})]);
  await page.goto(`${base}/races/${made.race.id}?variant=${variant}`);
  const field=page.locator('#wristband');
  await field.waitFor();
  await field.fill('433');await field.press('Enter');
  await page.getByRole('button',{name:'Fix number'}).waitFor();
  await page.screenshot({path:`${out}/reopen-${variant}-1-warning.png`});
  assert(!(await field.evaluate(element=>element===document.activeElement)),`${variant}: keyboard down while the warning waits`);
  await field.tap();
  await page.waitForTimeout(300);
  assert(await page.getByRole('button',{name:'Fix number'}).count()===0,`${variant}: one tap on the box drops the warning`);
  assert(await field.inputValue()==='433',`${variant}: the number stays in the box`);
  assert(await field.evaluate(element=>element===document.activeElement && element.selectionStart===0 && element.selectionEnd===3),`${variant}: box focused with the number selected`);
  await page.screenshot({path:`${out}/reopen-${variant}-2-tapped.png`});
  await page.keyboard.type(good);await page.keyboard.press('Enter');
  await page.getByRole('list',{name:'Wristbands entered'}).getByRole('button',{name:new RegExp(good)}).waitFor();
  // The chip shows while the save is on its way; the box clears once the server has it.
  await page.waitForFunction(()=>document.querySelector('#wristband')?.value==='',null,{timeout:5000}).catch(()=>{});
  assert(await field.inputValue()==='',`${variant}: ${good} saved and the box is ready for the next runner`);
  await page.screenshot({path:`${out}/reopen-${variant}-3-saved.png`});
  await context.close();
}
await browser.close();
