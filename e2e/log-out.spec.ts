import {press,ownName,becomeLead,expect,join,lookProblems,openLeadsBarTab,openRelays,test,type Page} from './fixtures.js';
const races=(page:Page)=>expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
const joinScreen=(page:Page)=>expect(page.getByRole('heading',{level:1,name:/Join( the Running Zone)?$/})).toBeVisible();
const menuItems=(page:Page)=>page.getByRole('menu').getByRole('menuitem');
const pick=(page:Page,item:string)=>menuItems(page).getByText(item,{exact:true}).click();
// The pass, session, job and drafts go; only the names listed on the phone stay.
const onlyNamesKept=async(page:Page)=>expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('msf:')))).toEqual(['msf:profiles']);
test('a volunteer\'s avatar menu has only Log out, which goes straight to Join keeping the listed names',async({page},info)=>{
  const name=ownName('Vol Out');
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);
  await page.getByRole('button',{name:`${name}: Log out`,exact:true}).click();
  await expect(menuItems(page)).toHaveText(['Log out']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('volunteer-menu.png')});
  await pick(page,'Log out');
  await joinScreen(page);await onlyNamesKept(page);
  await expect(page.getByRole('heading',{name:'Your profile'})).toHaveCount(0);
});
test('a lead\'s avatar menu has only Log out too, on Races and on the lead header',async({page},info)=>{
  const name=ownName('Sami Out');
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);await becomeLead(page);
  const avatar=page.getByRole('banner').getByRole('button',{name:`${name}: Log out`,exact:true});
  await press(avatar);
  await expect(menuItems(page)).toHaveText(['Log out']);
  await press(avatar);await expect(menuItems(page)).toHaveCount(0);
  await openLeadsBarTab(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup'})).toBeVisible();
  await expect(page.getByText(name,{exact:true})).toHaveCount(0);
  await press(avatar);
  await expect(menuItems(page)).toHaveText(['Log out']);
  expect(await lookProblems(page)).toEqual([]);
  await page.screenshot({path:info.outputPath('lead-menu.png')});
  await pick(page,'Log out');
  await joinScreen(page);await onlyNamesKept(page);
});
test('a second tab on the same phone follows a log out from the Relays tab',async({page,context})=>{
  const name=ownName('Tabs Out');
  await page.goto('/');await join(page,name,{job:'Finish line'});await races(page);
  const other=await context.newPage();await other.goto('/');await races(other);
  await openRelays(page);
  await page.getByRole('button',{name:`${name}: Log out`,exact:true}).click();
  await pick(page,'Log out');
  await joinScreen(page);await joinScreen(other);
  await other.close();
});
test('Races letting go of its live stream while the phone reads why it was logged out still keeps the listed names',async({page})=>{
  const name=ownName('Let Go');
  // A slow phone, made certain: the server ends the live stream just as Log out ends the session, the stream's
  // reconnect (no token now) is answered 401 at once, and its reason is not read before Races lets go of it.
  await page.addInitScript(()=>{
    const original=window.fetch,flags=window as {heldReason?:boolean;streamOpen?:boolean};
    window.fetch=async(input,init)=>{
      const live=String(input).includes('/api/live/'),signedIn=new Headers(init?.headers).has('authorization');
      if(live && !signedIn && !flags.heldReason) {
        flags.heldReason=true;
        const body=new ReadableStream({start:reading=>init?.signal?.addEventListener('abort',()=>reading.error(new DOMException('signal is aborted without reason','AbortError')))});
        return new Response(body,{status:401,headers:{'content-type':'application/json'}});
      }
      const response=await original(input,init);
      if(!live || !response.ok || !response.body) return response;
      flags.streamOpen=true;
      const reader=response.body.getReader();
      const body=new ReadableStream({start(stream) {
        window.addEventListener('msf:session',()=>{try {stream.close();} catch {/* already closed */}void reader.cancel();});
        void (async()=>{for(;;) {const {done,value}=await reader.read().catch(()=>({done:true,value:undefined}));if(done) break;try {stream.enqueue(value);} catch {break;}}})();
      }});
      return new Response(body,{status:response.status,headers:response.headers});
    };
  });
  await page.goto('/');await join(page,name,{job:'Start line'});await races(page);
  // Races' stream must be open (a slow server answers it late) or Log out has no stream to end.
  await page.waitForFunction(()=>(window as {streamOpen?:boolean}).streamOpen);
  await page.getByRole('button',{name:`${name}: Log out`,exact:true}).click();await pick(page,'Log out');
  await joinScreen(page);await page.waitForFunction(()=>(window as {heldReason?:boolean}).heldReason);
  await onlyNamesKept(page);
});
