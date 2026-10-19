import { createHash,randomUUID } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { firstLoadFiles,type ManifestChunk } from './first-load.mjs';

export function appShell():Plugin {
  let output:string;
  // Every build is new to phones, so each deploy reloads them onto it.
  const buildId=randomUUID();
  return {
    name:'running-zone-app-shell',
    apply:'build',
    config:()=>({define:{'import.meta.env.BUILD_ID':JSON.stringify(buildId)}}),
    configResolved(config) {output=resolve(config.root,config.build.outDir);},
    async closeBundle() {
      const manifest:Record<string,ManifestChunk>=JSON.parse(await readFile(resolve(output,'.vite/manifest.json'),'utf8'));
      // Lead is a dynamic import: it must never be downloaded for volunteers.
      const files=new Set<string>(['index.html',...firstLoadFiles(manifest)]);
      const hash=createHash('sha256');
      for(const file of [...files].sort()) hash.update(await readFile(resolve(output,file)));
      const version=hash.digest('hex').slice(0,20);
      // The server reads this at start and sends it on every response.
      await writeFile(resolve(output,'build-id'),buildId);
      const paths=[...files].map(file=>`/${file}`);
      await writeFile(resolve(output,'sw.js'),`
const CACHE = 'msf-shell-${version}';
const SHELL = ${JSON.stringify(paths)};
self.addEventListener('install', event => {
  // A new build activates itself once its shell is cached; the page reloads when it takes over.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new Request(path, {cache:'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('msf-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
