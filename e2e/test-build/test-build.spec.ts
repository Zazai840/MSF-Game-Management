import { readFileSync } from 'node:fs';
import {ownName,ownCode,becomeLead,expect,join,lookProblems,openLeadMenu,openRace,ownEvent,test,type Locator,type Page} from '../fixtures.js';

// Runs only under playwright.test-build.config.ts, which starts the server as a test build of this commit.
const commit=process.env.E2E_TEST_BUILD_COMMIT!;

/**
 * The marker and the Report a bug link, checked against the screen they report and the look rules: in the race
 * flow's test build bar above the app bar, or in the header of the older lead screens.
 */
async function expectReports(page:Page,screen:string,bar:Locator=page.locator('.rz-testbuild')) {
  await expect(bar.getByText(`Test build · ${commit.slice(0,7)}`,{exact:true})).toBeVisible();
  const link=bar.getByRole('link',{name:'Report a bug',exact:true});
  await expect(link).toHaveAttribute('target','_blank');
  const expected=new URL('https://github.com/Zazai840/MSF-Game-Management/issues/new?template=tester-bug.yml');
  expected.searchParams.set('commit',commit);expected.searchParams.set('screen',screen);
  // Inside the lead area the header learns the screen just after it shows, so wait for the link to catch up.
  await expect(link).toHaveAttribute('href',expected.href);
  expect(await lookProblems(page)).toEqual([]);
  // Nothing in the bar overlaps, and nothing pushes the page wider than the phone.
  const overlaps=await bar.evaluate(element=>{
    const boxes=[...element.querySelectorAll('strong,span,a')].filter(item=>!item.querySelector('strong,span,a')).map(item=>({text:item.textContent,box:item.getBoundingClientRect()}));
    const problems:string[]=[];
    for(const [index,a] of boxes.entries()) for(const b of boxes.slice(index+1)) {
      if(a.box.left<b.box.right&&b.box.left<a.box.right&&a.box.top<b.box.bottom&&b.box.top<a.box.bottom) problems.push(`${a.text} overlaps ${b.text}`);
    }
    if(document.documentElement.scrollWidth>window.innerWidth) problems.push('page is wider than the screen');
    return problems;
  });
  expect(overlaps).toEqual([]);
}

test('a test build shows its commit and a Report a bug link on Join, Races and a race',async({page,request},info)=>{
  const code=await ownCode(),name=ownName('Test build sprint');
  await ownEvent(request,code,name);
  await request.post('/api/races',{headers:{authorization:`Bearer ${process.env.E2E_OWNER_TOKEN}`},data:{eventCode:code,kind:'heat',number:1}});
  await page.goto('/');
  await expectReports(page,'Join');
  await join(page,`${ownName('Tester Marker')} With A Long Full Name`,{job:'Start line'});
  await expect(page.getByRole('navigation',{name:'Event type'})).toBeVisible();
  await expectReports(page,'Races');
  await page.screenshot({path:info.outputPath('races.png')});
  await openRace(page,name);
  await expectReports(page,'Race');
  await page.screenshot({path:info.outputPath('race.png')});
});

test('inside the lead area the Report a bug link names the screen shown',async({page})=>{
  await page.goto('/');
  await join(page,ownName('Tester Lead'),{job:'Start line'});
  await becomeLead(page);
  await openLeadMenu(page,'Results');
  await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await expectReports(page,'Results',page.getByRole('banner'));
  await page.getByRole('button',{name:'Back to Races',exact:true}).click();
  await openLeadMenu(page,'Day setup');
  await expect(page.getByRole('heading',{level:1,name:'Day setup',exact:true})).toBeVisible();
  await expectReports(page,'Day setup',page.getByRole('banner'));
});

test('the Report a bug link fills fields the tester bug form has',async()=>{
  const form=readFileSync('.github/ISSUE_TEMPLATE/tester-bug.yml','utf8');
  for(const field of ['what-happened','expected','commit','screen']) expect(form).toContain(`id: ${field}\n`);
  expect(form).toMatch(/labels: \[needs-triage\]/);
});
