import { deleteCurrentRace,lookProblems,expect,nextBeside,openRaceScreen,ownEvent,test } from './fixtures.js';
test('wristband numbers go in through the phone keyboard on the race screen and the input keeps focus between runners',async({openPhone,request},info)=>{
  const project=info.project.name,code=`KB-${project.toUpperCase()}`,name=`Keyboard sprint ${project}`;
  await ownEvent(request,code,name);
  const {page,context}=await openPhone(`Keyboard ${project}`);
  await openRaceScreen(page,name);
  await page.getByRole('button',{name:/^Check-in Wristbands/}).click();
  const input=page.getByLabel('Wristband number',{exact:true});
  await expect(input).toHaveAttribute('inputmode','numeric');
  await expect(input).toHaveAttribute('pattern','[0-9]*');
  await expect(input).toHaveAttribute('enterkeyhint','next');
  await expect(input).toHaveAttribute('autocomplete','off');
  await input.click();
  // Android keyboards let through . , - and space: only the digits stay.
  await input.pressSequentially('20.0-1');
  await expect(input).toHaveValue('2001');
  await input.press('Enter');
  await expect(page.getByRole('button',{name:'Change runner 2001',exact:true})).toBeVisible();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await input.pressSequentially('2002');
  const next=nextBeside(page,'Wristband number');
  await expect(next).toBeInViewport();
  await next.click();
  await expect(page.getByRole('button',{name:'Change runner 2002',exact:true})).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  // Pasted text keeps only its digits.
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText(' 2 0-03 x'));
  await input.press('ControlOrMeta+V');
  await expect(input).toHaveValue('2003');
  await input.press('Backspace');await input.pressSequentially('4');
  await expect(input).toHaveValue('2004');
  await input.press('Enter');
  await expect(page.getByRole('button',{name:'Change runner 2004',exact:true})).toBeVisible();
  // A warning closes the keyboard so the choice shows; Fix reopens it, cleared.
  await input.pressSequentially('3045');await input.press('Enter');
  const warning=page.getByRole('alert');
  await expect(warning).toContainText('3045 is not a Girl Cubs number. Girl Cubs wristbands are 2000 to 2999.');
  await expect(input).not.toBeFocused();
  await page.screenshot({path:info.outputPath('check-in-warning.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toBeFocused();await expect(input).toHaveValue('');
  // A number already in the race is refused: Fix number only.
  await input.pressSequentially('2001');await input.press('Enter');
  await expect(warning).toContainText('2001 is already in this race. Check the wristband.');
  await expect(warning.getByRole('button',{name:'Keep',exact:true})).toHaveCount(0);
  await warning.getByRole('button',{name:'Fix number',exact:true}).click();
  await expect(input).toBeFocused();
  // Keep adds the number with an amber dot and carries on.
  await input.pressSequentially('3046');await input.press('Enter');
  await warning.getByRole('button',{name:'Keep',exact:true}).click();
  const kept=page.getByRole('button',{name:'Change runner 3046',exact:true});
  await expect(kept.locator('.kept-dot')).toBeVisible();
  await expect(input).toBeFocused();
  // Every number is saved as it goes in: there is no check step, and the race screen opened again shows the same list.
  await expect(page.getByText('Heat 1 · 4 runners',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('check-in-entry.png'),fullPage:true});
  expect(await lookProblems(page)).toEqual([]);
  await page.reload();await openRaceScreen(page,name);
  await page.getByRole('button',{name:/^Check-in Wristbands You are checking in · 4 in$/}).click();
  await expect(page.getByRole('list',{name:'Checked in'}).getByRole('listitem')).toHaveText(['2001','2002','2004','3046']);
  await deleteCurrentRace(request,code);
});
