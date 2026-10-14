import { test as base,expect,type Page } from '@playwright/test';
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
const jobTitles={'Start line':'Check in runners','Finish order':'Record the finishing order',Times:'Enter times'} as const;
/** The Home button for a job, by its internal name (Start line, Finish order, Times). */
export function jobButton(page:Page,job:keyof typeof jobTitles) {
  return page.getByRole('button',{name:new RegExp(`^${jobTitles[job]}`)});
}
export { expect };
export type { Page };
