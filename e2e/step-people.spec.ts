import {expect,lookProblems,openRace,ownCode,ownEvent,ownName,signInThroughApi,test,writeCheckIn,writeOrder,type APIRequestContext} from './fixtures.js';
/**
 * A lead's Race screen names whom to ask about each step (ADR 0007): the last person who typed in it, or else up to
 * three people who have its role today and "+n" for the rest. Volunteers see no names.
 *
 * Every spec shares one test day, so other tests' people have these roles too. People are listed in name order: this
 * spec's start with "Aa" to come before every other test's, and log out when the test ends so the next project starts
 * without them. Each check reads the names from the front and lets other tests' people follow.
 */
const tokens:string[]=[];
/** These names first, then at most `more` other names, then perhaps a count of the rest. */
const first=(names:string[],more:number)=>new RegExp(`^${names.join(', ')}(, (?!Aa)[^,+]+){0,${more}}( \\+\\d+)?$`);
test.afterEach(async({request})=>{for(const token of tokens.splice(0)) await request.post('/api/sign-out',{headers:{authorization:`Bearer ${token}`},data:{}});});
/** A made-up person signed in through the API with this role reported, as their phone reports it on Join. */
async function inRole(request:APIRequestContext,name:string,role:'start'|'finish'|'timer') {
  const token=await signInThroughApi(request,name);tokens.push(token);
  expect((await request.post('/api/role',{headers:{authorization:`Bearer ${token}`},data:{role}})).ok()).toBe(true);
  return token;
}
test('a lead\'s Race screen names the last person who typed in each step, or else the people in that role today; a volunteer sees no names',async({openPhone,request},info)=>{
  const name=ownName('Who is here'),code=await ownCode();
  await ownEvent(request,code,name);
  // Long made-up names: the step strip is tight at 360px.
  const starter=ownName('Aabraham Featherstonehaugh Start'),finishers=[ownName('Aadelheid Finish'),ownName('Aadelina Wolfeschlegelstein Finish')];
  const timers=[1,2,3,4,5].map(number=>ownName(`Aagatha${number} Timer`));
  const start=await inRole(request,starter,'start'),[finish]=[await inRole(request,finishers[0]!,'finish'),await inRole(request,finishers[1]!,'finish')];
  for(const timer of timers) await inRole(request,timer,'timer');
  await writeCheckIn(request,start,code,[2001,2002]);
  const lead=await openPhone(ownName('Aa Step lead'),{lead:true});tokens.push(lead.token);
  await openRace(lead.page,name);
  const tabs=lead.page.getByRole('tablist',{name:'Heat 1 steps'}),who=(step:RegExp)=>tabs.getByRole('tab',{name:step}).locator('.rz-step__who');
  // Runners was typed in: only the person who typed. Nobody typed in the other two: the people in the role, both of two, three of five.
  await expect(who(/^Runners/)).toHaveText(starter);
  await expect(who(/^Finishing order/)).toHaveText(first(finishers,1));
  await expect(who(/^Times/)).toHaveText(new RegExp(`^${timers.slice(0,3).join(', ')} \\+\\d+$`));
  // No label wraps beside the long names.
  expect(new Set(await tabs.locator('.rz-step__label').evaluateAll(labels=>labels.map(label=>label.getBoundingClientRect().height)))).toHaveProperty('size',1);
  expect(await lookProblems(lead.page)).toEqual([]);
  // The strip stays inside the screen with its long names.
  expect(await lead.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await lead.page.screenshot({path:info.outputPath('step-people.png'),fullPage:true});
  // A person who switches job moves to the other step at once, with no change of the day.
  expect((await request.post('/api/role',{headers:{authorization:`Bearer ${tokens[2]}`},data:{role:'start'}})).ok()).toBe(true);
  await expect(who(/^Finishing order/)).toHaveText(first([finishers[0]!],2));
  // Once the Finish line types, the step names that one person.
  expect((await request.post('/api/role',{headers:{authorization:`Bearer ${tokens[2]}`},data:{role:'finish'}})).ok()).toBe(true);
  await expect(who(/^Finishing order/)).toHaveText(first(finishers,1));
  await writeOrder(request,finish,code,[2002,2001]);
  await expect(who(/^Finishing order/)).toHaveText(finishers[0]!);
  // A volunteer's steps name nobody.
  const volunteer=await openPhone(ownName('Aa Step timer'),{job:'timer'});tokens.push(volunteer.token);
  await openRace(volunteer.page,name);
  await expect(volunteer.page.getByRole('tablist',{name:'Heat 1 progress'}).getByRole('tab')).toHaveText(['Runners2 so far','Finishing order2 of 2','TimesYou · not yet']);
  await expect(volunteer.page.locator('.rz-step__who')).toHaveCount(0);
});
