import { test as base,expect,type Locator,type Page } from '@playwright/test';
// A real reset changes both codes. The original scoring phone is retained by
// every reset journey, so each test reads the current codes rather than a seed.
export const test=base.extend<{freshDayCodes:void}>({
  freshDayCodes:[async({request},use)=>{
    const response=await request.get('/api/day',{headers:{authorization:`Bearer ${process.env.E2E_SCORING_TOKEN}`}});
    expect(response.ok()).toBe(true);
    const {dayCode,leadCode}=await response.json();
    process.env.E2E_DAY_CODE=dayCode;process.env.E2E_LEAD_CODE=leadCode;
    await use();
  },{auto:true}]
});
/** Fills the Join form already on screen and taps Join. Names must be unique per day. */
export async function joinDay(page:Page,name:string,code=process.env.E2E_DAY_CODE!) {
  await page.getByLabel('Day code or owner password').fill(code);
  await page.getByLabel('Full name').fill(name);
  await page.getByRole('button',{name:'Join',exact:true}).click();
}
/** The breadcrumb trail below the header on every job screen. */
export function steps(page:Page) {return page.getByRole('navigation',{name:'Steps',exact:true});}
/** Types one wristband into the phone number input and taps Next, as a volunteer would. */
export async function enterWristband(page:Page,number:number|string,label='Wristband number') {
  await page.getByLabel(label,{exact:true}).fill(String(number));
  await page.getByRole('button',{name:'Next',exact:true}).click();
}
/**
 * Goes to Home the way a person would: the Home button when one shows (app bar, saved screen),
 * otherwise back along the trail until its Home step appears. Wait for the screen to settle first.
 */
export async function goHome(page:Page) {
  const home=page.getByRole('button',{name:'Home',exact:true}).first();
  await expect(home.or(steps(page).getByRole('button').first()).first()).toBeVisible();
  if(await home.isVisible()) await home.click();
  else await trailBack(page,'Home');
}
/** Taps back along the trail to the named step; on a narrow phone the earliest steps show only after going back. */
export async function trailBack(page:Page,label:string) {
  const target=steps(page).getByRole('button',{name:label,exact:true});
  for(let tries=0;tries<6;tries++) {
    await expect(steps(page).getByRole('button').first()).toBeVisible();
    if(await target.isVisible()) {await target.click();return;}
    if(await steps(page).locator('[aria-current=step]').innerText()===label) return;
    const before=await steps(page).innerText();
    await steps(page).getByRole('button').first().click();
    await expect(steps(page)).not.toHaveText(before);
  }
  throw new Error(`No ${label} step on the trail`);
}
/**
 * Opens a race from a job's race picker (v1's Other race list), reached through the trail's job step,
 * for example pickRace(page,'Finishing order',/R4.*Heat 2$/). Waits for the job to settle first,
 * because a job opens the first waiting race by itself.
 */
export async function pickRace(page:Page,jobStep:string,race:string|RegExp) {
  await expect(page.getByText('Opening…',{exact:true})).toHaveCount(0);
  await expect(steps(page).getByRole('button').first()).toBeVisible();
  await trailBack(page,jobStep);
  await page.getByRole('main').getByRole('button',typeof race==='string'?{name:race,exact:true}:{name:race}).first().click();
}
/** The race named on the saved confirmation, for example "Heat 2". */
export async function savedRaceLabel(page:Page) {
  await expect(page.getByRole('heading',{name:'Thank you. Your responses have been saved.',exact:true})).toBeVisible();
  return (await page.getByTestId('saved-race').innerText()).match(/(Heat|Race|Final) \d+/)![0];
}
/** From Home: taps I'm a zone lead and gives the lead code (or the owner password). */
export async function becomeLead(page:Page,code=process.env.E2E_LEAD_CODE!) {
  await page.getByRole('button',{name:"I'm a zone lead",exact:true}).click();
  await page.getByLabel('Lead code or owner password').fill(code);
  await page.locator('form').getByRole('button',{name:'Become lead',exact:true}).click();
}
/** The lead's Dashboard button, whatever its "N to check" badge says. */
export function dashboardButton(page:Page) {
  return page.getByRole('button',{name:/^Dashboard( \d+ to check)?$/});
}
const dashboardTitles={'To check':'To check',Results:'Results','Day setup':'Day setup'} as const;
/** One of the Dashboard's three menu buttons, whatever its explanation or badge says. */
export function dashboardMenuButton(page:Page,section:keyof typeof dashboardTitles) {
  return page.getByRole('button',{name:new RegExp(`^${dashboardTitles[section]} `)});
}
/** From Home: opens the Dashboard and, when named, one of its three screens. */
export async function openDashboard(page:Page,section?:keyof typeof dashboardTitles) {
  await dashboardButton(page).click();
  await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
  if(section) await dashboardMenuButton(page,section).click();
}
/** A To check item, found by any text on it (event code, wristband, title); tapping it opens the race. */
export function toCheckItem(page:Page,text:RegExp) {
  return page.getByRole('list',{name:'To check'}).getByRole('button',{name:text});
}
const jobTitles={'Start line':'Check in runners','Finish order':'Record the finishing order',Times:'Enter times'} as const;
/** The Home button for a job, by its internal name (Start line, Finish order, Times). */
export function jobButton(page:Page,job:keyof typeof jobTitles) {
  return page.getByRole('button',{name:new RegExp(`^${jobTitles[job]}`)});
}
/**
 * Starts dragging from `from` the way a person would: a real finger on the phone projects
 * (touch events through the browser's touch emulation), the mouse on desktop.
 * Move with `over` / `toPoint`, then `drop`.
 */
export async function startDrag(page:Page,from:Locator) {
  const touch=!!test.info().project.use.hasTouch;
  const box=(await from.boundingBox())!;
  let x=box.x+box.width/2,y=box.y+box.height/2;
  const cdp=touch?await page.context().newCDPSession(page):null;
  const finger=(type:'touchStart'|'touchMove'|'touchEnd',px=x,py=y)=>cdp!.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:px,y:py}]});
  if(touch) await finger('touchStart');else {await page.mouse.move(x,y);await page.mouse.down();}
  async function toPoint(targetX:number,targetY:number,moves=12) {
    for(let index=1;index<=moves;index++) {
      const px=x+(targetX-x)*index/moves,py=y+(targetY-y)*index/moves;
      if(touch) await finger('touchMove',px,py);else await page.mouse.move(px,py);
    }
    x=targetX;y=targetY;
  }
  return {
    toPoint,
    /** Moves so the dragged point sits on the middle of `target` (same column as the start). */
    async over(target:Locator) {const to=(await target.boundingBox())!;await toPoint(x,to.y+to.height/2);},
    async drop() {
      if(touch) {await finger('touchEnd');await cdp!.detach();} else await page.mouse.up();
      // The drag helper ignores clicks for 50 ms after a drop so the drop never counts as a tap; no person taps that fast.
      await page.waitForTimeout(100);
    },
  };
}
/** Drags `from` onto `to` and lets go. */
export async function dragTo(page:Page,from:Locator,to:Locator) {
  const drag=await startDrag(page,from);await drag.over(to);await drag.drop();
}
/**
 * On the Times job: opens the race picker from the trail when a race is already open,
 * then picks the race by its button name, for example "60m Girl Cubs (R4) · Heat 2".
 */
export async function pickTimesRace(page:Page,name:string|RegExp) {
  await timesOpened(page);
  if(!await page.getByRole('heading',{name:'Which race is it?',exact:true}).isVisible()) await trailBack(page,'Times');
  await page.getByRole('button',{name,exact:typeof name==='string'}).click();
}
/** Waits until the Times job has loaded: the race picker, a place to type, or the check screen. */
export async function timesOpened(page:Page) {
  await expect(page.getByRole('heading',{name:/^Which race is it\?$|place time\?$|^Check the times$/})).toBeVisible();
}
/** Types one place's time (digits only, as a timer would) into the phone number input and taps Next. */
export async function enterTime(page:Page,digits:number|string) {
  await page.getByLabel('Place time',{exact:true}).fill(String(digits));
  await page.getByRole('button',{name:'Next',exact:true}).click();
}
export { expect };
export type { Locator,Page };
