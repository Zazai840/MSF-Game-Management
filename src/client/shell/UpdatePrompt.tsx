import { useEffect,useRef,useState } from 'react';

export function UpdatePrompt() {
  const [waiting,setWaiting]=useState<ServiceWorker|null>(null);
  const [reloading,setReloading]=useState(false);
  const requested=useRef(false);
  useEffect(()=>{
    if(!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let registration:ServiceWorkerRegistration|undefined;
    let disposed=false;
    const controllerChanged=()=>{if(requested.current) window.location.reload();};
    const check=()=>{if(document.visibilityState==='visible') void registration?.update().catch(()=>{/* Try on the next visible check. */});};
    const installed=()=>{
      if(!disposed && registration?.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
    };
    const updateFound=()=>{
      const worker=registration?.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed') installed();});
    };
    navigator.serviceWorker.addEventListener('controllerchange',controllerChanged);
    window.addEventListener('focus',check);
    document.addEventListener('visibilitychange',check);
    const timer=window.setInterval(check,60000);
    void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(value=>{
      if(disposed) return;
      registration=value;
      installed();
      registration.addEventListener('updatefound',updateFound);
      updateFound();
      check();
    }).catch(()=>{/* Saving still goes directly to the server if shell caching is unavailable. */});
    return ()=>{
      disposed=true;
      clearInterval(timer);
      registration?.removeEventListener('updatefound',updateFound);
      navigator.serviceWorker.removeEventListener('controllerchange',controllerChanged);
      window.removeEventListener('focus',check);
      document.removeEventListener('visibilitychange',check);
    };
  },[]);
  if(!waiting) return null;
  return <aside className="app-update" aria-label="App update"><button disabled={reloading} onClick={()=>{
    requested.current=true;setReloading(true);waiting.postMessage({type:'ACTIVATE_UPDATE'});
  }}>{reloading?'Reloading…':'New version, tap to reload'}</button></aside>;
}
