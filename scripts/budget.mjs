import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { firstLoadFiles } from './first-load.mjs';
const root = resolve(process.argv[2] || 'dist/web');
// Spec 43 raised the v1 100 KB budget to pay for styling and a self-hosted font; the aim is about 1 MB.
const limit = 1_500_000;
const manifest = JSON.parse(await readFile(resolve(root,'.vite/manifest.json'),'utf8'));
let bytes = 0;
for (const file of firstLoadFiles(manifest)) bytes += gzipSync(await readFile(resolve(root,file))).length;
// The app-shell worker is fetched on a volunteer's first visit as well.
bytes += gzipSync(await readFile(resolve(root,'sw.js'))).length;
// Inline bootstrap scripts arrive in the HTML on every first load too.
const html = await readFile(resolve(root,'index.html'),'utf8');
for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc\s*=/i.test(script[1]) && script[2].trim()) bytes += gzipSync(script[2]).length;
}
console.log(`Volunteer first-load size: ${bytes} / ${limit} bytes gzip (JavaScript, CSS, fonts and service worker)`);
if (bytes > limit) throw new Error('Volunteer first-load size exceeds the 1.5 MB gzip budget');
