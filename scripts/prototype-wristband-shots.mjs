// PROTOTYPE - throwaway (map ticket #183). Screenshots each Start line variant against `npm run prototype`.
// Run: PORT=4391 npm run prototype, then node scripts/prototype-wristband-shots.mjs <out-dir>
import { chromium } from '@playwright/test';
const base=process.env.BASE||'http://127.0.0.1:4391',out=process.argv[2]||'prototype-shots';
const post=async(path,data,token)=>{
  const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...token?{authorization:`Bearer ${token}`}:{}},body:JSON.stringify(data)});
  if(!response.ok) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
};
const get=async(path,token)=>(await fetch(base+path,{headers:{authorization:`Bearer ${token}`}})).json();
const owner=(await post('/api/owner-sign-in',{password:'prototype',name:'Prototype Owner',profiles:[]})).token;
const day=await get('/api/day',owner);
const {pass}=await post('/api/password',{password:day.olympicsPassword});
const browser=await chromium.launch();
const run=Date.now()%100000;
for(const [index,variant] of ['Today','A','B','C'].entries()) {
  // Fresh Girl Cubs numbers per variant and run, so none "already ran in this event".
  const first=2000+((run+index*97)%300)*3,numbers=[first,first+1,first+2].map(String);
  const token=(await post('/api/profiles',{pass,name:`Start ${variant} ${run}`})).token;
  const me=await get('/api/me',token);
  const races=await get('/api/races',token);
  const group=races.groups.find(item=>item.heatsOpen && item.event.section==='Girl Cubs' && item.event.name.includes('60')),event=group.event;
  const made=await post('/api/races',{eventCode:event.code,kind:'heat',number:group.nextHeat},token);
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  await page.goto(base+'/');
  await page.evaluate(([token,role])=>{localStorage.setItem('msf:token',token);localStorage.setItem('msf:role',role);},[token,JSON.stringify({day:me.dayId,role:'start'})]);
  await page.goto(`${base}/races/${made.race.id}?variant=${variant}`);
  const field=page.locator('#wristband');
  await field.waitFor();
  for(const number of numbers) {await field.fill(number);await field.press('Enter');await page.waitForTimeout(500);}
  // A half-typed next runner, to see whether it survives a change.
  await field.fill('20');
  const shot=name=>page.screenshot({path:`${out}/${variant}-${name}.png`});
  await shot('1-typed');
  if(variant==='Today') {await context.close();continue;}
  const tapSecond=()=>variant==='C'?page.getByLabel('Runner 2',{exact:true}).tap():page.getByRole('button',{name:`Change ${numbers[1]}`}).tap();
  const retype=async digits=>{await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(digits);await page.keyboard.press('Enter');await page.waitForTimeout(600);};
  await tapSecond();await page.waitForTimeout(200);
  await shot('2-tapped');
  await retype(numbers[2]);
  await shot('3-duplicate');
  await page.getByRole('button',{name:'Fix number'}).tap();
  await retype('1500');
  await shot('4-wrong-section');
  await page.getByRole('button',{name:'Fix number'}).tap();
  await retype(String(first+50));
  await shot('5-changed');
  if(variant==='C') await page.getByRole('button',{name:/^Remove runner 3/}).tap();
  else {await page.getByRole('button',{name:`Change ${numbers[2]}`}).tap();await page.waitForTimeout(200);await shot('6-tapped-again');await page.getByRole('button',{name:'Remove'}).tap();}
  await page.waitForTimeout(600);
  await shot('7-removed');
  await context.close();
}
await browser.close();
