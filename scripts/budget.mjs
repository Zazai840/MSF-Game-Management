import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
const root = resolve(process.argv[2] || 'dist/web');
const limit = 100_000;
const manifest = JSON.parse(await readFile(resolve(root,'.vite/manifest.json'),'utf8'));
const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
if (!entry) throw new Error('No volunteer entry in build manifest');
const files = new Set();
function visit(key) {
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing build chunk: ${key}`);
  if (files.has(chunk.file)) return;
  files.add(chunk.file);
  for (const imported of chunk.imports || []) visit(imported);
  // dynamicImports are intentionally excluded: the lead area is not first-load JS.
}
visit(entry);
let bytes = 0;
for (const file of files) if (file.endsWith('.js')) bytes += gzipSync(await readFile(resolve(root,file))).length;
// The app-shell worker is fetched on a volunteer's first visit as well.
bytes += gzipSync(await readFile(resolve(root,'sw.js'))).length;
// Inline bootstrap scripts arrive in the HTML on every first load too.
const html = await readFile(resolve(root,'index.html'),'utf8');
for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!/\bsrc\s*=/i.test(script[1]) && script[2].trim()) bytes += gzipSync(script[2]).length;
}
console.log(`Volunteer first-load JavaScript: ${bytes} / ${limit} bytes gzip`);
if (bytes > limit) throw new Error('Volunteer JavaScript exceeds 100 KB gzip budget');
