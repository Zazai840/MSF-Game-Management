import {expect,ownName,test} from './fixtures.js';

test('pulling down from the top of a screen with the Updated at line refreshes it: the pull says when to let go, and a short pull or an open sheet does nothing',async({openPhone},info)=>{
  test.skip(!info.project.use.hasTouch,'a pull is a touch gesture');
  const {page}=await openPhone(ownName('Pull refresh'));
  await expect(page.locator('.rz-refresh')).toHaveText(/Updated at \d/);
  let reads=0;
  await page.route('**/api/races',route=>{if(route.request().method()==='GET') reads++;return route.continue();});
  const touch=await page.context().newCDPSession(page),x=180;
  const send=(type:'touchStart'|'touchMove'|'touchEnd',y?:number)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:y===undefined?[]:[{x,y}]});
  const pull=async(by:number)=>{await send('touchStart',200);for(let y=200;y<=200+by;y+=20) await send('touchMove',y);};
  const hint=page.locator('.rz-pull');
  // A short pull: the hint comes down with the finger and goes back, and nothing is read.
  await pull(60);
  await expect(hint).toHaveText('Pull down to refresh');
  await send('touchEnd');
  await expect(hint).toBeHidden();
  expect(reads).toBe(0);
  // A long pull: it says to let go, and letting go reads Races again.
  await pull(320);
  await expect(hint).toHaveText('Let go to refresh');
  await page.screenshot({path:info.outputPath('pull-ready.png')});
  await send('touchEnd');
  await expect(hint).toHaveText('Refreshing…');
  await expect.poll(()=>reads).toBe(1);
  await expect(hint).toBeHidden();
  // With a sheet open the pull belongs to the sheet.
  await page.getByRole('button',{name:/New race/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await pull(320);await send('touchEnd');
  await expect(hint).toBeHidden();
  expect(reads).toBe(1);
});
