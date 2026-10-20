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
/**
 * True when this tab was forced to reload in the last 30 s, else notes that it is about to be. While a deploy overlaps,
 * a phone already on the new build can reach the old server and the new one in turn: one reload is enough until it settles.
 */
function reloadedLately() {
  try {
    if(Date.now()-Number(sessionStorage.getItem('msf:reloaded-at'))<30_000) return true;
    sessionStorage.setItem('msf:reloaded-at',String(Date.now()));
  } catch {/* No session storage: reload as asked. */}
  return false;
}
/**
 * Reloads onto the newest build: true when the page is now reloading, false when it carries on because it was forced
 * to reload moments ago. The worker is updated first, so the reload does not reopen the old shell from its cache.
 */
export function reloadApp() {
  if(reloading) return true;
  if(reloadedLately()) return false;
  reloading=true;
  void registration.then(async value=>{
    if(!value || !navigator.serviceWorker.controller) return reload();
    await value.update();
    if(!value.installing && !value.waiting) return reload();
    // The new worker's takeover reloads the page; if its install fails, reload anyway.
    setTimeout(reload,10000);
  }).catch(reload);
  return true;
}
/** False when the server runs another build than this page and the page is reloading onto it. */
export function onThisBuild(build:string|null|undefined) {
  if(!import.meta.env.PROD || !build || build===import.meta.env.BUILD_ID) return true;
  return !reloadApp();
}
