import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

interface Chunk { file:string; isEntry?:boolean; imports?:string[]; css?:string[] }

export function appShell():Plugin {
  let output:string;
  return {
    name:'running-zone-app-shell',
    apply:'build',
    configResolved(config) {output=resolve(config.root,config.build.outDir);},
    async closeBundle() {
      const manifest:Record<string,Chunk>=JSON.parse(await readFile(resolve(output,'.vite/manifest.json'),'utf8'));
      const entry=Object.keys(manifest).find(key=>manifest[key].isEntry);
      if(!entry) throw new Error('No volunteer app entry');
      const files=new Set<string>(['index.html']);
      function visit(key:string) {
        const chunk=manifest[key];
        if(files.has(chunk.file)) return;
        files.add(chunk.file);
        for(const css of chunk.css||[]) files.add(css);
        // Lead is a dynamic import: it must never be downloaded for volunteers.
        for(const dependency of chunk.imports||[]) visit(dependency);
      }
      visit(entry);
      const hash=createHash('sha256');
      for(const file of [...files].sort()) hash.update(await readFile(resolve(output,file)));
      const version=hash.digest('hex').slice(0,20);
      const paths=[...files].map(file=>`/${file}`);
      await writeFile(resolve(output,'sw.js'),`
const CACHE = 'msf-shell-${version}';
const SHELL = ${JSON.stringify(paths)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(path, {cache:'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('msf-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match('/index.html')).then(response => response || fetch(request)));
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(request)));
  }
});
`);
    }
  };
}
