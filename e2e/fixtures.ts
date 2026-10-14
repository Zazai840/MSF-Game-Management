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
export { expect };
export type { Page };
