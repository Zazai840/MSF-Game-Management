import { back,expect,openDashboard,ownEvent,recordRace,test } from './fixtures.js';
test('a lead awards medals from heat times: a tie for 3rd settled for qualifying comes back, is settled, and a comment confirms it',async({page,openPhone},info)=>{
  const project=info.project.name,at=['iPhone','Android','desktop'].indexOf(project),code=`RWF-${project.toUpperCase()}`,name=`No final sprint ${project}`;
  await ownEvent(page.request,code,name);
  await page.request.post('/api/day/confirm-events',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{}});
  // Each project's heats use Girl Cubs wristbands no other test types: heat 1 is w(1)..w(3), heat 2 is w(11)..w(13).
  const w=(number:number)=>2900+at*20+number;
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(1),w(2),w(3)],[920,980,1040]);
  await recordRace(page.request,process.env.E2E_OWNER_TOKEN!,code,[w(11),w(12),w(13)],[935,980,1060]);
  const lead=(await openPhone(`No final lead ${project}`,{lead:true})).page;
  await openDashboard(lead,'Results');
  await lead.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)}).click();
  // The tie for 3rd and 4th only decides qualifying for now: both qualify, so No run-off needed.
  await lead.getByRole('button',{name:`TIE at 9.80 for ${w(2)}`,exact:true}).click();
  await lead.getByRole('button',{name:'No run-off needed',exact:true}).click();await lead.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  const stages=lead.locator('.stage-actions').getByRole('button');
  await expect(stages).toHaveText(['Heats complete','Results without a final']);
  await lead.screenshot({path:info.outputPath('a1-heats-run.png'),fullPage:true});
  // Without a final it decides the bronze, so it comes back.
  await lead.getByRole('button',{name:'Results without a final',exact:true}).click();
  const blocked=lead.getByRole('dialog',{name:'Results without a final',exact:true});
  await expect(blocked.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
  await expect(blocked).toContainText('No final will be run. Medals go to the 3 fastest heat times.');
  await lead.screenshot({path:info.outputPath('a2-tie-comes-back.png')});
  await blocked.getByRole('button',{name:`Tie: ${w(2)}, ${w(12)}`,exact:true}).click();
  const tie=lead.getByRole('dialog',{name:'Tie at 9.80',exact:true});
  await tie.getByRole('button',{name:'No run-off needed',exact:true}).click();await tie.getByRole('button',{name:'Save tie',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  await lead.getByRole('button',{name:'Results without a final',exact:true}).click();
  const sheet=lead.getByRole('dialog',{name:'Results without a final',exact:true});
  await expect(sheet).toContainText('Nothing to settle');await expect(sheet).toContainText('No open warnings');
  await expect(sheet.locator('.stage-creates li')).toHaveText([`1st: ${w(1)}`,`2nd: ${w(11)}`,`3rd: ${w(2)}`]);
  // The comment is required: Confirm without one stays on the sheet.
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(sheet.getByLabel('Comment',{exact:true})).toBeFocused();
  await sheet.getByLabel('Comment',{exact:true}).fill('Out of time');
  await lead.screenshot({path:info.outputPath('a3-ready.png')});
  await sheet.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(lead.getByRole('dialog')).toHaveCount(0);
  // Done: the medal line under 3rd, medal marks instead of Q, the podium for Input - Running and the audit note.
  await expect(lead.locator('.results-event-head .event-status')).toHaveText('Done · medals decided, no final');
  await expect(lead.getByText('Top 6 highlighted · Medal places: 1st, 2nd, 3rd',{exact:true})).toBeVisible();
  const board=lead.getByRole('list',{name:'Official leaderboard'});
  await expect(board.locator('.result-mark')).toHaveText(['1st','2nd','3rd']);
  await expect(board.locator('.result-line')).toHaveText('Medal line');
  await expect(board.locator('li').nth(3)).toHaveText('Medal line');
  await expect(lead.getByRole('table',{name:'Input - Running'}).getByRole('row').nth(1)).toHaveText(`${code}${w(1)}${w(11)}${w(2)}`);
  await expect(lead.getByRole('list',{name:'Audit notes'}).getByRole('listitem').first()).toContainText(`No final lead ${project} marked Results without a final - Out of time`);
  await expect(lead.getByRole('button',{name:'Heats complete',exact:true})).toHaveCount(0);
  await expect(lead.getByRole('button',{name:'Results without a final',exact:true})).toHaveCount(0);
  await lead.screenshot({path:info.outputPath('a4-done.png'),fullPage:true});
  await back(lead,'Results');
  await expect(lead.getByRole('button',{name:new RegExp(`^${code} · Girl Cubs`)})).toContainText('Done · medals decided, no final');
});
