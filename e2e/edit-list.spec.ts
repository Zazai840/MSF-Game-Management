import {ownName,expect,join,lookProblems,test,type Page} from './fixtures.js';
const welcome=(page:Page)=>page.getByRole('region',{name:'Joined on this phone before'});
/** Ends the session as a new day would, so Join lists the names this phone has joined with. */
async function backToJoin(page:Page) {
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await page.evaluate(()=>localStorage.removeItem('msf:token'));await page.reload();
  await expect(page.getByRole('heading',{level:1,name:'Someone else? Join'})).toBeVisible();
}
test('Edit list forgets a name on this phone only, and names do not sign in while editing',async({page},info)=>{
  const sam=ownName('Sam Edit'),ola=ownName('Ola Edit');
  await page.goto('/');
  await join(page,sam,{job:'Start line'});await backToJoin(page);
  await join(page,ola,{job:'Start line'});await backToJoin(page);
  await expect(welcome(page).getByRole('button',{name:/^Remove /})).toHaveCount(0);
  await welcome(page).getByRole('button',{name:'Edit list',exact:true}).click();
  await expect(welcome(page).getByRole('button',{name:'Edit list',exact:true})).toHaveCount(0);
  await expect(welcome(page).getByText('Removing a name only takes it off this phone. A lead can put it back on any phone.',{exact:true})).toBeVisible();
  // While editing, tapping a name stays on Join.
  await welcome(page).getByText(sam,{exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Someone else? Join'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('edit-list.png')});
  await welcome(page).getByRole('button',{name:`Remove ${sam} from this phone`,exact:true}).click();
  await expect(welcome(page).getByText(sam,{exact:true})).toHaveCount(0);
  await welcome(page).getByRole('button',{name:'Done',exact:true}).click();
  await expect(welcome(page).getByRole('button',{name:`Remove ${ola} from this phone`,exact:true})).toHaveCount(0);
  await page.reload();
  await expect(welcome(page).getByText(sam,{exact:true})).toHaveCount(0);
  await expect(welcome(page).getByRole('button',{name:new RegExp(`^${ola}`)})).toBeVisible();
  // Removing the last name leaves plain Join, still past the Olympics password: the phone keeps its pass.
  await welcome(page).getByRole('button',{name:'Edit list',exact:true}).click();
  await welcome(page).getByRole('button',{name:`Remove ${ola} from this phone`,exact:true}).click();
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1,name:'Join the Running Zone'})).toBeVisible();
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('edit-list-empty.png')});
  // The profile is still on the server, so its name is taken: That's me brings it back to this phone.
  await join(page,sam,{job:'Start line'});
  await page.locator('.rz-callout',{hasText:'Is this you on a new phone?'}).getByRole('button',{name:"That's me",exact:true}).click();
  await expect(page.getByRole('button',{name:`${sam}: Log out`,exact:true})).toBeVisible();
});
