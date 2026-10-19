let registration:Promise<ServiceWorkerRegistration|undefined>=Promise.resolve(undefined);
let reloading=false;
const reload=()=>window.location.reload();
/** Installs the app-shell service worker. A new worker activates itself and takes over, and the page reloads onto it. */
export function startUpdates() {
  if(!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // The first worker taking over a freshly opened page is not a new build.
  let controlled=Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(controlled) reload();controlled=true;});
  // Saving still goes directly to the server if shell caching is unavailable.
  registration=navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>undefined);
}
/** Reloads onto the newest build. The worker is updated first, so the reload does not reopen the old shell from its cache. */
export function reloadApp() {
  if(reloading) return;
  reloading=true;
  void registration.then(async value=>{
    if(!value || !navigator.serviceWorker.controller) return reload();
    await value.update();
    // shortcut: a phone already on the new build that reaches the old server mid-switch-over reloads until that server is gone; compare build order if Railway ever overlaps deploys for long.
    if(!value.installing && !value.waiting) return reload();
    // The new worker's takeover reloads the page; if its install fails, reload anyway.
    setTimeout(reload,10000);
  }).catch(reload);
}
/** False when the server runs another build than this page: the page is then reloading onto it. */
export function onThisBuild(build:string|null|undefined) {
  if(!import.meta.env.PROD || !build || build===import.meta.env.BUILD_ID) return true;
  reloadApp();
  return false;
}
