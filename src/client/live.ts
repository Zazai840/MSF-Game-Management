import { useEffect,useRef,useState } from 'react';
import { frameData,newerSnapshot,splitFrames } from '../shared/live.js';
import { ApiFailure,apiResponse,StaleRequest } from './api.js';
import { onThisBuild } from './shell/updates.js';
/** Silence this long means the link is dead. Spread over 30-45 s so phones that lost signal together don't all reconnect at once. */
const silence=()=>30_000+Math.random()*15_000;
/** The wait before reconnecting after a failure or silence: 1 s, doubling up to 30 s. */
const backoff=(failures:number)=>Math.min(30_000,1000*2**(failures-1));

/**
 * Reads a live stream (`live/...`, read with fetch so the bearer token goes with it) and holds its newest snapshot,
 * ignoring any older than the one held. A planned end reconnects at once; a failure or silence reconnects with backoff.
 * The stream closes while the page is hidden and reopens when it is visible, and starts again when the signal goes or comes back;
 * every connect sends the whole snapshot first.
 * `offer` hands it a snapshot from elsewhere (a write's answer), kept by the same newest-wins rule.
 */
export function useLive<T extends {revision:number}>(path:string) {
  const [snapshot,setSnapshot]=useState<T|null>(null);
  const [error,setError]=useState('');
  const held=useRef<T|null>(null);
  useEffect(()=>{
    held.current=null;
    let controller:AbortController|null=null,retry=0,failures=0,stopped=false;
    const hidden=()=>document.visibilityState==='hidden';
    async function connect() {
      clearTimeout(retry);
      if(stopped || controller || hidden()) return;
      const mine=controller=new AbortController();
      let watchdog=0,planned=false;
      const arm=()=>{clearTimeout(watchdog);watchdog=window.setTimeout(()=>mine.abort(),silence());};
      try {
        arm();
        const reader=(await apiResponse(path,undefined,mine.signal)).body!.pipeThrough(new TextDecoderStream()).getReader();
        // Connected again: the note goes even if nothing changed meanwhile.
        setError('');
        let rest='';
        for(;;) {
          const {value,done}=await reader.read();
          if(done) {planned=true;break;}
          arm();
          const split=splitFrames(rest+value);rest=split.rest;
          for(const data of split.frames.map(frameData)) {
            if(data===null) continue;
            const next=JSON.parse(data) as T&{build?:string};
            if(!onThisBuild(next.build)) return;
            if(newerSnapshot(held.current,next)) {held.current=next;failures=0;setSnapshot(next);}
          }
        }
      } catch(failure) {
        // A 401 has already sent the phone to sign in, and a changed session ends this screen; other refusals say why and stop.
        if(failure instanceof StaleRequest) return;
        if(failure instanceof ApiFailure && failure.status<500) {if(failure.status!==401) setError(failure.message);return;}
        // A phone holding a snapshot keeps showing it, with a calm note that it is reconnecting.
        if(!mine.signal.aborted) setError(held.current?'Connection lost - trying again':'Could not connect - trying again');
      } finally {
        clearTimeout(watchdog);
        if(controller===mine) controller=null;
      }
      if(stopped || controller || hidden()) return;
      retry=window.setTimeout(()=>void connect(),planned?0:backoff(++failures));
    }
    const visibility=()=>{
      if(!hidden()) {void connect();return;}
      clearTimeout(retry);controller?.abort();controller=null;
    };
    // The signal going or coming back leaves the open stream likely dead (it can stay silent until the watchdog): start again at once.
    const restart=()=>{clearTimeout(retry);controller?.abort();controller=null;void connect();};
    document.addEventListener('visibilitychange',visibility);addEventListener('offline',restart);addEventListener('online',restart);
    void connect();
    return ()=>{
      stopped=true;clearTimeout(retry);controller?.abort();
      document.removeEventListener('visibilitychange',visibility);removeEventListener('offline',restart);removeEventListener('online',restart);
    };
  },[path]);
  const offer=(next:T)=>{if(newerSnapshot(held.current,next)) {held.current=next;setSnapshot(next);}};
  return {snapshot,error,offer};
}
