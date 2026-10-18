import { createProfile,expect,lookProblems,test,type Page } from './fixtures.js';
const profilesHeading=(page:Page)=>page.getByRole('heading',{level:1,name:"Who's using this phone?"});
/** Ends the session as a new day would, so the phone shows its profile screen. */
async function backToProfiles(page:Page) {
  await expect(page.getByRole('heading',{name:"What's your job for this race?"})).toBeVisible();
  await page.evaluate(()=>localStorage.removeItem('msf:token'));await page.reload();
  await expect(profilesHeading(page)).toBeVisible();
}
test('Edit list forgets a profile on this phone only, and names do not sign in until Done',async({page},info)=>{
  const sam=`Sam Edit ${info.project.name}`,ola=`Ola Edit ${info.project.name}`;
  await page.goto('/');
  await createProfile(page,sam);await backToProfiles(page);
  await createProfile(page,ola);await backToProfiles(page);
  await expect(page.getByRole('button',{name:'Remove',exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'Edit list',exact:true}).click();
  await expect(page.getByRole('button',{name:'Edit list',exact:true})).toHaveCount(0);
  // While editing, tapping a name stays on the profile screen.
  await page.getByText(sam,{exact:true}).click();
  await expect(profilesHeading(page)).toBeVisible();
  await expect(page.getByRole('banner').getByText(sam,{exact:true})).toHaveCount(0);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('edit-list.png')});
  await page.getByRole('button',{name:`Remove ${sam}`,exact:true}).click();
  await expect(page.getByText(`Remove ${sam} from this phone? Your profile isn't deleted. A lead can put it back on any phone.`,{exact:true})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('edit-list-confirm.png')});
  await page.getByRole('button',{name:'Keep',exact:true}).click();
  await expect(page.getByText(sam,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:`Remove ${sam}`,exact:true}).click();
  await page.getByRole('button',{name:'Remove from this phone',exact:true}).click();
  await expect(page.getByText(sam,{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByRole('button',{name:`Remove ${ola}`,exact:true})).toHaveCount(0);
  await page.reload();
  await expect(profilesHeading(page)).toBeVisible();
  await expect(page.getByText(sam,{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:ola,exact:true})).toBeVisible();
  // Removing the last profile leaves an ordinary empty profile screen, still past the Olympics password.
  await page.getByRole('button',{name:'Edit list',exact:true}).click();
  await page.getByRole('button',{name:`Remove ${ola}`,exact:true}).click();
  await page.getByRole('button',{name:'Remove from this phone',exact:true}).click();
  await expect(page.getByText(ola,{exact:true})).toHaveCount(0);
  await expect(page.getByText('Tap your name.',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^(Edit list|Done)$/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'New here? Create profile'})).toHaveAttribute('aria-expanded','true');
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('edit-list-empty.png')});
  await page.reload();
  await expect(profilesHeading(page)).toBeVisible();
  // The profile is still on the server, so its name is still taken.
  await createProfile(page,sam);
  await expect(page.getByRole('alert')).toHaveText(`${sam} already has a profile. If that's you, tap That's me and show a lead. If not, add your middle name or initial.`);
});
