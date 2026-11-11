import {becomeLead,expect,jobBand,lookProblems,openRace,ownCode,ownEvent,ownName,press,switchJob,test,type Page} from './fixtures.js';

/** The band says the job in words, spans the screen directly below the top bar, and the bar holds no job control. */
async function bandShows(page:Page,job:string) {
  const band=jobBand(page,job),bar=page.getByRole('banner');
  await expect(band).toHaveText(`You are: ${job}`);
  await expect(bar.getByRole('button',{name:/Change job$/})).toHaveCount(0);
  const box=(await band.boundingBox())!,above=(await bar.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(await page.evaluate(()=>document.documentElement.clientWidth));
  expect(Math.abs(box.y-(above.y+above.height))).toBeLessThan(1);
  expect(await lookProblems(page)).toEqual([]);
  return band.evaluate(element=>getComputedStyle(element).backgroundColor);
}

test('a full-width job band below the top bar says "You are: Finish line" on Races and on a race, one colour per job, and a tap changes job',async({openPhone,request},info)=>{
  const name=ownName('Job band sprint'),code=await ownCode();
  await ownEvent(request,code,name);
  expect((await request.post('/api/races',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{eventCode:code,kind:'heat',number:1}})).ok()).toBe(true);
  const {page}=await openPhone(ownName('Job band volunteer'),{job:'start'});
  const colours=[await bandShows(page,'Start line')];
  await page.screenshot({path:info.outputPath('races-start-line.png')});
  // A tap on the band opens the job sheet, and the switch shows on the band at once.
  await press(jobBand(page,'Start line'));
  await press(page.getByRole('radiogroup',{name:'What\'s your job today?',exact:true}).getByRole('radio',{name:/^Finish line/}));
  colours.push(await bandShows(page,'Finish line'));
  await page.screenshot({path:info.outputPath('races-finish-line.png')});
  // The same band on a race, for every job.
  await openRace(page,name);
  expect(await bandShows(page,'Finish line')).toBe(colours[1]);
  await switchJob(page,'Timer');
  colours.push(await bandShows(page,'Timer'));
  await page.screenshot({path:info.outputPath('race-timer.png')});
  // A step that is not yours keeps its read-only sentence.
  await press(page.getByRole('tablist',{name:'Heat 1 progress'}).getByRole('tab',{name:/^Runners/}));
  await expect(page.getByText('Viewing Runners · read-only. It\'s the Start line\'s step; you\'re the Timer.',{exact:true})).toBeVisible();
  // Zone lead needs the lead code, from the band too.
  await becomeLead(page);
  colours.push(await bandShows(page,'Zone lead'));
  await page.screenshot({path:info.outputPath('race-zone-lead.png')});
  expect(new Set(colours).size).toBe(4);
});
