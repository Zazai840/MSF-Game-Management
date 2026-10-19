import { readFileSync } from 'node:fs';
import { becomeLead,dashboardMenuButton,expect,jobButton,createProfile,lookProblems,openDashboard,test,type Page } from '../fixtures.js';

// Runs only under playwright.test-build.config.ts, which starts the server as a test build of this commit.
const commit=process.env.E2E_TEST_BUILD_COMMIT!;

/** The marker and the Report a bug link in the header, checked against the screen they report and the look rules. */
async function expectHeaderReports(page:Page,screen:string) {
  const header=page.getByRole('banner');
  await expect(header.getByText(`Test build · ${commit.slice(0,7)}`,{exact:true})).toBeVisible();
  const link=header.getByRole('link',{name:'Report a bug',exact:true});
  await expect(link).toHaveAttribute('target','_blank');
  const expected=new URL('https://github.com/Zazai840/MSF-Game-Management/issues/new?template=tester-bug.yml');
  expected.searchParams.set('commit',commit);expected.searchParams.set('screen',screen);
  // Inside the Dashboard the header learns the screen just after it shows, so wait for the link to catch up.
  await expect(link).toHaveAttribute('href',expected.href);
  expect(await lookProblems(page)).toEqual([]);
  // Nothing in the header overlaps, and nothing pushes the page wider than the phone.
  const overlaps=await header.evaluate(element=>{
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

test('a test build shows its commit and a Report a bug link on the Olympics password screen, Home and inside a job',async({page},info)=>{
  await page.goto('/');
  await expectHeaderReports(page,'Olympics password');
  await createProfile(page,`Tester Marker ${info.project.name} With A Long Full Name`);
  await expect(jobButton(page,'Start line')).toBeVisible();
  await expectHeaderReports(page,'Home');
  await page.screenshot({path:info.outputPath('home.png')});
  await jobButton(page,'Start line').click();
  await expect(page.getByRole('button',{name:'Back to Home',exact:true})).toBeVisible();
  await expectHeaderReports(page,'Start line');
  await page.screenshot({path:info.outputPath('job.png')});
});

test('inside the Dashboard the Report a bug link names the Dashboard screen shown',async({page},info)=>{
  await page.goto('/');
  await createProfile(page,`Tester Lead ${info.project.name}`);
  await becomeLead(page);
  await openDashboard(page);
  await expectHeaderReports(page,'Dashboard');
  await dashboardMenuButton(page,'Results').click();
  await expect(page.getByRole('heading',{level:1,name:'Results',exact:true})).toBeVisible();
  await expectHeaderReports(page,'Results');
});

test('the Report a bug link fills fields the tester bug form has',async()=>{
  const form=readFileSync('.github/ISSUE_TEMPLATE/tester-bug.yml','utf8');
  for(const field of ['what-happened','expected','commit','screen']) expect(form).toContain(`id: ${field}\n`);
  expect(form).toMatch(/labels: \[needs-triage\]/);
});
