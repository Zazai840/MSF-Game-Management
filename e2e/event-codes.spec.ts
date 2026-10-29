import {backToRaces,becomeLead,deleteCurrentRace,expect,flowRace,openRace,ownCode,ownEvent,switchJob,test,type Page} from './fixtures.js';

/** Whether the event code shows on New race's section button, the event's card and the race bar, as this phone's job sees them. */
async function expectCode(page:Page,name:string,code:string,shown:boolean) {
  const count=shown?1:0,card=page.getByRole('article',{name:`${name} · Girl Cubs`,exact:true});
  await expect(card).toBeVisible();
  await expect(card.getByText(code,{exact:true})).toHaveCount(count);
  await page.getByRole('button',{name:'New race',exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'New race'});
  await sheet.getByRole('button',{name,exact:true}).click();
  await expect(sheet.getByRole('button',{name:shown?`Girl Cubs ${code}`:'Girl Cubs',exact:true})).toBeVisible();
  await expect(sheet.getByText(code,{exact:true})).toHaveCount(count);
  await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
  await openRace(page,name);
  await expect(page.getByRole('banner').getByText(code,{exact:true})).toHaveCount(count);
  await backToRaces(page);
}

test('event codes show only in the Zone lead role: not for a volunteer\'s job, and not for a lead working as Timer',async({openPhone,request},info)=>{
  const project=info.project.name,name=`Codes sprint ${project}`,code=await ownCode();
  await ownEvent(request,code,name);await flowRace(request,process.env.E2E_OWNER_TOKEN!,code);
  const {page}=await openPhone(`Codes ${project}`);
  for(const job of ['Start line','Finish line','Timer'] as const) {
    await switchJob(page,job);await expectCode(page,name,code,false);
  }
  await page.screenshot({path:info.outputPath('volunteer.png'),fullPage:true});
  await becomeLead(page);await expectCode(page,name,code,true);
  await page.screenshot({path:info.outputPath('lead.png'),fullPage:true});
  await switchJob(page,'Timer');await expectCode(page,name,code,false);
  await deleteCurrentRace(request,code);
});
