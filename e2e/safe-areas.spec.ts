import {boxOf,expect,flowRace,jobBand,lookProblems,openRace,ownCode,ownEvent,ownName,press,test,type Locator,type Page} from './fixtures.js';

/** An iPhone's safe areas in portrait: the status bar with the Dynamic Island, and the home bar. */
const portrait={top:59,bottom:34,left:0,right:0};
/** The same phone on its side: the island at the left, the home bar below. */
const onItsSide={top:0,bottom:21,left:59,right:59};
/** Gives the page the safe areas of an installed iPhone; the emulated phones have none of their own. */
async function safeAreas(page:Page,insets:typeof portrait) {
  const session=await page.context().newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride',{insets});
}
const bottom=async(target:Locator)=>{const {y,height}=await boxOf(target);return y+height;};
const screenHeight=(page:Page)=>page.evaluate(()=>innerHeight);
const screenWidth=(page:Page)=>page.evaluate(()=>innerWidth);
/** The room above a bar's words: its top padding. */
const topPadding=(bar:Locator)=>bar.evaluate(element=>getComputedStyle(element).paddingTop);

test('the page goes under the notch and the home bar, an installed iPhone shows the page behind its status bar, and zoom stays on',async({page})=>{
  await page.goto('/');
  const viewport=page.locator('meta[name=viewport]');
  await expect(viewport).toHaveAttribute('content',/(^|[ ,])viewport-fit=cover($|,)/);
  await expect(viewport).not.toHaveAttribute('content',/user-scalable|maximum-scale/);
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content','black-translucent');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content','#1e2b51');
});

test('with no safe areas (the browser, Android, desktop) the app bars and the footer are where they were',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Safe still');
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(ownName('Safe still start'));
  await flowRace(request,token,code);
  // The Races bar: edge to edge from the top, 10px above its words; New race sits 24px above the bottom edge.
  const races=page.getByRole('banner');
  expect(await boxOf(races)).toMatchObject({x:0,y:0,width:await screenWidth(page)});
  expect(await topPadding(races)).toBe('10px');
  expect(await screenHeight(page)-await bottom(page.getByRole('button',{name:'New race'}))).toBe(24);
  await page.reload();await openRace(page,name);
  // The compact race bar: 52px tall from the top edge.
  expect(await boxOf(page.getByRole('banner'))).toMatchObject({x:0,y:0,height:52});
  const lead=(await openPhone(ownName('Safe still lead'),{lead:true})).page;
  await lead.goto('/results');
  const header=lead.getByRole('banner');
  await expect(header.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  // The lead header: from the top edge, 8px above its words; the lead's bar is 56px tall on the bottom edge.
  expect(await boxOf(header)).toMatchObject({x:0,y:0});
  expect(await topPadding(header)).toBe('8px');
  const bar=await boxOf(lead.getByRole('navigation',{name:'Lead screens'}));
  expect(bar.height).toBe(56);expect(bar.y+bar.height).toBe(await screenHeight(lead));
});

test('on a phone with a notch and a home bar, each app bar\'s navy goes to the top edge and its words start below the notch',async({openPhone,request})=>{
  const code=await ownCode(),name=ownName('Safe top');
  await ownEvent(request,code,name);
  const {page,token}=await openPhone(ownName('Safe top start'));
  await flowRace(request,token,code);
  /** The bar keeps its top edge and grows by the notch's height, so all it holds starts below the notch. */
  const grows=async(bar:Locator,within:Page)=>{
    const flat=(await boxOf(bar)).height;
    await safeAreas(within,portrait);
    await expect.poll(async()=>(await boxOf(bar)).height).toBe(flat+portrait.top);
    expect((await boxOf(bar)).y).toBe(0);
    for(const control of await bar.getByRole('button').or(bar.getByRole('heading',{level:1})).all()) expect((await boxOf(control)).y).toBeGreaterThanOrEqual(portrait.top);
    expect(await lookProblems(within)).toEqual([]);
    await safeAreas(within,{top:0,bottom:0,left:0,right:0});
    await expect.poll(async()=>(await boxOf(bar)).height).toBe(flat);
  };
  await grows(page.getByRole('banner'),page);
  await page.reload();await openRace(page,name);
  await grows(page.getByRole('banner'),page);
  const lead=(await openPhone(ownName('Safe top lead'),{lead:true})).page;
  await lead.goto('/results');
  await expect(lead.getByRole('banner').getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await grows(lead.getByRole('banner'),lead);
});

test('footers, a sheet and the lead\'s bar keep clear of the home bar with one inset',async({openPhone})=>{
  const {page}=await openPhone(ownName('Safe foot start'));
  await safeAreas(page,portrait);
  // A volunteer's Races footer: its 24px foot plus the home bar.
  const height=await screenHeight(page);
  expect(height-await bottom(page.getByRole('button',{name:'New race'}))).toBe(24+portrait.bottom);
  // A sheet: the same foot plus the home bar under its last control.
  await press(jobBand(page));
  const sheet=page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  // (Over a phone's width a sheet is a centred dialog, away from the bottom edge.)
  if(test.info().project.use.hasTouch) await expect.poll(async()=>height-await bottom(sheet.getByRole('button').last())).toBe(24+portrait.bottom);
  const lead=(await openPhone(ownName('Safe foot lead'),{lead:true})).page;
  await safeAreas(lead,portrait);
  // A lead's Races: the lead's bar takes the home bar's room below its 56px tabs; the footer above it keeps only its own 24px foot.
  const bar=lead.getByRole('navigation',{name:'Lead screens'}),tab=bar.getByRole('button').first();
  expect(await bottom(bar)).toBe(height);
  expect(await bottom(tab)).toBeLessThanOrEqual(height-portrait.bottom);
  expect((await boxOf(bar)).y-await bottom(lead.getByRole('button',{name:'New race'}))).toBe(24);
  expect(await lookProblems(lead)).toEqual([]);
});

test('with the phone on its side, nothing on the screen or in a sheet sits under the notch at the left or right',async({openPhone})=>{
  const {page}=await openPhone(ownName('Safe side start'));
  await page.setViewportSize({width:844,height:390});
  await safeAreas(page,onItsSide);
  const width=await screenWidth(page);
  const clear=async(target:Locator)=>{
    const {x,width:wide}=await boxOf(target);
    expect(x).toBeGreaterThanOrEqual(onItsSide.left);expect(x+wide).toBeLessThanOrEqual(width-onItsSide.right);
  };
  for(const part of [page.getByRole('banner'),page.getByRole('main'),page.getByRole('button',{name:'New race'})]) await clear(part);
  await press(jobBand(page));
  await expect(page.getByRole('dialog')).toBeVisible();
  await clear(page.getByRole('dialog'));
  expect(await lookProblems(page)).toEqual([]);
});
