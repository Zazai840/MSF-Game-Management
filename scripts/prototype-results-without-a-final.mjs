// PROTOTYPE, throw away: runs the "Results without a final" look prototype (issue #159) on a scratch database.
//   npm run prototype:no-final               starts the dev server with seeded heats and prints how to open it
//   npm run prototype:no-final -- --shots D  also saves phone screenshots of every variant into folder D, then stops
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
const port=3456,base=`http://127.0.0.1:${port}`,owner='prototype-owner';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
const database='msf_prototype_wipe_me',admin=new pg.Client({connectionString:`postgresql://${process.env.USER}@localhost:5432/postgres`});
await admin.connect();await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.query(`CREATE DATABASE ${database}`);await admin.end();
const server=spawn('npx',['tsx','src/server/main.ts'],{stdio:'inherit',env:{...process.env,PORT:String(port),DATABASE_URL:`postgresql://${process.env.USER}@localhost:5432/${database}`,OWNER_PASSWORD:owner}});
process.on('exit',()=>server.kill());
for(let tries=0;;tries++) {try {if((await fetch(`${base}/api/health`)).ok) break;} catch {} if(tries>120) throw new Error('Server did not start');await new Promise(done=>setTimeout(done,500));}

let token;
async function call(path,data) {
  const response=await fetch(`${base}/api/${path}`,{method:data===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  if(!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
({token}=await call('owner-sign-in',{password:owner,name:'Prototype Owner',profiles:[]}));
const day=await call('day');
/** One saved heat as one phone doing every job, as e2e/fixtures.ts recordRace does. */
async function heat(code,runners,times) {
  const write=(what,data)=>call(`race-screen/${code}/${what}`,data);
  let {race}=await write('hold',{job:'check-in'});
  ({race}=await write('check-in',{raceId:race.id,version:race.parts.runners.version,runners:runners.map(wristband=>({wristband}))}));
  ({race}=await write('hold',{job:'order'}));
  ({race}=await write('order',{raceId:race.id,version:race.parts.finish.version,order:race.parts.runners.value.map(runner=>runner.id),didNotFinish:[],didNotRun:[],added:[]}));
  ({race}=await write('hold',{job:'times'}));
  await write('times',{raceId:race.id,version:race.parts.times.version,places:times,keptWrong:[]});
  await write('submit',{raceId:race.id});
}
// 60m Girl Cubs: three heats, a tie for 3rd between heat 1 and heat 2 settled "No run-off needed" (both qualify).
await heat('R4',[2001,2002,2003,2004],[920,980,1040,1100]);
await heat('R4',[2011,2012,2013,2014],[935,980,1060,1120]);
await heat('R4',[2021,2022,2023,2024],[990,1000,1075,1130]);
const tie=(await call('lead/events/R4/results')).results.ties[0];
await call('lead/events/R4/settle-tie',{tieId:tie.id,outcome:'no-run-off',comment:'Both qualify for the final'});
// 60m Boy Cubs: two heats, Heats complete, so its final is built but not run.
await heat('R3',[1001,1002,1003,1004],[900,950,1000,1050]);
await heat('R3',[1011,1012,1013,1014],[910,960,1010,1060]);
await call('lead/events/R3/complete-stage',{stage:'heats'});
// 60m Hurdles Girl Cubs (timed): one race, to compare with how medal marks look on a timed event today.
await heat('R10',[2031,2032,2033,2034],[1150,1200,1260,1300]);

console.log(`\nPrototype ready: ${base}/?variant=A  (B and C too, or the arrows on the bottom bar)`);
console.log(`Olympics password: ${day.olympicsPassword} · lead code: ${day.leadCode}`);
console.log('Sign in as a lead, then Dashboard > Results > R4 · Girl Cubs (heats run) or R3 · Boy Cubs (final built, not run).\n');
if(!shots) await new Promise(()=>{});

const { chromium }=await import('@playwright/test');
await mkdir(shots,{recursive:true});
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await context.newPage();
await page.goto(base);
await page.getByLabel('Olympics password',{exact:true}).fill(day.olympicsPassword);
await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('button',{name:'Lead today? Sign in'}).click();
await page.getByLabel('Full name',{exact:true}).fill('Prototype Lead');
await page.getByLabel("Today's lead code",{exact:true}).fill(day.leadCode);
await page.getByRole('button',{name:'Sign in as lead',exact:true}).click();
await page.getByRole('button',{name:/^Dashboard/}).waitFor();
async function open(variant,card) {
  await page.goto(`${base}/?variant=${variant}`);
  await page.getByRole('button',{name:/^Dashboard/}).click();
  await page.getByRole('main').getByRole('button',{name:/^Results /}).click();
  await page.getByRole('button',{name:new RegExp(`^${card}`)}).click();
  await page.locator('.results-event-head').waitFor();
}
const shot=async(name,fullPage=true)=>{await page.addStyleTag({content:'.prototype-switcher{display:none!important}'});await page.waitForTimeout(150);await page.screenshot({path:`${shots}/${name}.png`,fullPage});console.log('saved',name);};
const sheet=()=>page.getByRole('dialog');
async function confirmFromSheet(name) {
  await sheet().getByRole('button',{name:/now decides a medal/}).click();
  await sheet().getByLabel('Comment').fill('Out of time');
  await shot(`${name}-sheet-ready`,false);
  await sheet().getByRole('button',{name:'Confirm'}).click();
}

await open('A','R4 · Girl Cubs');await shot('A1-heats-run');
await page.getByRole('button',{name:'Results without a final'}).click();await shot('A2-sheet-tie-blocks',false);
await confirmFromSheet('A3');await shot('A4-decided');
await page.getByRole('button',{name:'Reopen results'}).click();await shot('A5-reopen-sheet',false);
await open('A','R3 · Boy Cubs');await shot('A6-final-built');

await open('B','R4 · Girl Cubs');await shot('B1-heats-run');
await page.getByRole('button',{name:'Finish heats'}).click();await shot('B2-choose-how-it-ends',false);
await sheet().getByRole('button',{name:/^Results without a final/}).click();await shot('B3-sheet',false);
await open('B','R3 · Boy Cubs');await shot('B4-final-built');

await open('C','R4 · Girl Cubs');await shot('C1-with-a-final');
await page.getByRole('button',{name:'Without a final'}).click();await shot('C2-without-a-final-preview');
await page.getByRole('button',{name:/now decides a medal/}).click();
await page.locator('.no-final-inline').getByLabel('Comment').fill('Out of time');
await page.locator('.no-final-inline').getByRole('button',{name:'Confirm'}).click();await shot('C3-decided');
await open('C','R3 · Boy Cubs');await page.getByRole('button',{name:'Without a final'}).click();await shot('C4-final-built-preview');
await open('A','R10 · Girl Cubs');await shot('Z-timed-event-today');
await browser.close();process.exit(0);
