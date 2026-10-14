import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp,mkdir,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { afterEach,expect,test } from 'vitest';

const run=promisify(execFile);
let dist='';
afterEach(async()=>{if(dist) await rm(dist,{recursive:true,force:true});});

// Random bytes do not compress, so their gzip size is close to their real size.
async function build(sizes:Record<string,number>) {
  dist=await mkdtemp(join(tmpdir(),'budget-'));
  await mkdir(join(dist,'.vite'),{recursive:true});await mkdir(join(dist,'assets'),{recursive:true});
  const files:Record<string,Buffer>={};
  for(const [file,size] of Object.entries(sizes)) {files[file]=randomBytes(size);await writeFile(join(dist,file),files[file]);}
  await writeFile(join(dist,'.vite/manifest.json'),JSON.stringify({
    'index.html':{file:'assets/index.js',isEntry:true,imports:['_shared.js'],css:['assets/index.css'],assets:['assets/font.woff2'],dynamicImports:['src/lead.tsx']},
    '_shared.js':{file:'assets/shared.js',css:['assets/shared.css']},
    'src/lead.tsx':{file:'assets/lead.js',css:['assets/lead.css'],assets:['assets/lead-only.woff2']}
  }));
  await writeFile(join(dist,'index.html'),'<script>var old=1;</script><script type="module" src="/assets/index.js"></script>');
  const gz=(file:string)=>gzipSync(files[file]).length;
  return {files,gz,inline:gzipSync('var old=1;').length};
}
const budget=()=>run(process.execPath,['scripts/budget.mjs',dist]);

test('first-load size counts static JavaScript, CSS, fonts, the service worker and inline scripts, not the lead area',async()=>{
  const {gz,inline}=await build({'assets/index.js':40_000,'assets/shared.js':20_000,'assets/index.css':5_000,'assets/shared.css':1_000,'assets/font.woff2':39_000,'sw.js':1_500,'assets/lead.js':300_000,'assets/lead.css':9_000,'assets/lead-only.woff2':9_000});
  const expected=['assets/index.js','assets/shared.js','assets/index.css','assets/shared.css','assets/font.woff2','sw.js'].reduce((total,file)=>total+gz(file),inline);
  const {stdout}=await budget();
  expect(stdout).toContain(`Volunteer first-load size: ${expected} / 1500000 bytes gzip`);
});

test('first-load size over 1.5 MB fails the build and still prints the total',async()=>{
  const {gz,inline}=await build({'assets/index.js':1_200_000,'assets/shared.js':10,'assets/index.css':10,'assets/shared.css':10,'assets/font.woff2':400_000,'sw.js':10,'assets/lead.js':10,'assets/lead.css':10,'assets/lead-only.woff2':10});
  const expected=['assets/index.js','assets/shared.js','assets/index.css','assets/shared.css','assets/font.woff2','sw.js'].reduce((total,file)=>total+gz(file),inline);
  const failure=await budget().then(()=>null,(error:{stdout:string;stderr:string})=>error);
  expect(failure?.stdout).toContain(`Volunteer first-load size: ${expected} / 1500000 bytes gzip`);
  expect(failure?.stderr).toContain('Volunteer first-load size exceeds the 1.5 MB gzip budget');
});
