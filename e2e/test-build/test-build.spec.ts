import { readFileSync } from 'node:fs';
import { expect,jobButton,joinDay,lookProblems,steps,test,type Page } from '../fixtures.js';

// Runs only under playwright.test-build.config.ts, which starts the server as a test build of this commit.
const commit='0123456789abcdef0123456789abcdef01234567';

/** The marker and the Report a bug link in the header, checked against the screen they report and the look rules. */
async function expectMarker(page:Page,screen:string) {
  const header=page.getByRole('banner');
  await expect(header.getByText('Test build · 0123456',{exact:true})).toBeVisible();
  const link=header.getByRole('link',{name:'Report a bug',exact:true});
  await expect(link).toHaveAttribute('target','_blank');
  const url=new URL((await link.getAttribute('href'))!);
  expect(url.origin+url.pathname).toBe('https://github.com/Zazai840/MSF-Game-Management/issues/new');
  expect(Object.fromEntries(url.searchParams)).toEqual({template:'tester-bug.yml',commit,screen});
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

test('a test build shows its commit and a Report a bug link on Join, Home and inside a job',async({page},info)=>{
  await page.goto('/');
  await expectMarker(page,'Join');
  await joinDay(page,`Tester Marker ${info.project.name} With A Long Full Name`);
  await expect(jobButton(page,'Start line')).toBeVisible();
  await expectMarker(page,'Home');
  await page.screenshot({path:info.outputPath('home.png')});
  await jobButton(page,'Start line').click();
  await expect(steps(page)).toBeVisible();
  await expectMarker(page,'Start line');
  await page.screenshot({path:info.outputPath('job.png')});
});

test('the Report a bug link fills fields the tester bug form has',async()=>{
  const form=readFileSync('.github/ISSUE_TEMPLATE/tester-bug.yml','utf8');
  for(const field of ['what-happened','expected','commit','screen']) expect(form).toContain(`id: ${field}\n`);
  expect(form).toMatch(/labels: \[needs-triage\]/);
});
