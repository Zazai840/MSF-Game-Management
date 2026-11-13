import { useEffect,useRef,useState } from 'react';
import { frameData,newerSnapshot,splitFrames } from '../shared/live.js';
import { api,ApiFailure,apiResponse,keepSeen,lastSeen,StaleRequest } from './api.js';
import { clockWithSeconds } from '../shared/clock.js';
import { failureLine } from '../shared/request-failure.js';
import { onThisBuild } from './shell/updates.js';
import { linkLine,linkNext,linkStart,type LinkEvent } from './live-link.js';
/** Silence this long means the link is dead. Spread over 30-45 s so phones that lost signal together don't all reconnect at once. */
const silence=()=>30_000+Math.random()*15_000;

/**
 * Reads a live stream (`live/...`, read with fetch so the bearer token goes with it) and holds its newest snapshot,
 * ignoring any older than the one held. A planned end reconnects at once; a failure or silence reconnects with backoff.
 * The stream closes while the page is hidden and reopens when it is visible, and starts again when the signal goes or comes back;
 * every connect sends the whole snapshot first.
 * `offer` hands it a snapshot from elsewhere (a write's answer), kept by the same newest-wins rule; `refresh` starts
 * the stream again now (a pull down), which never clears the snapshot held.
 * With `remember`, it starts from what this path showed last (api.ts, lastSeen) while the stream connects; `arrived`
 * is when the snapshot shown came in ("10:42:05").
 */
export function useLive<T extends {revision:number}>(path:string,{remember=false}:{remember?:boolean}={}) {
  const [shown,setShown]=useState(()=>remember?lastSeen<T>(path)??null:null);
  const snapshot=shown?.value??null;
  const setSnapshot=(value:T)=>{const at=clockWithSeconds(new Date());if(remember) keepSeen(path,value,at);setShown({value,at});};
  const [error,setError]=useState(''),[gone,setGone]=useState(false);
  const held=useRef<T|null>(null);
  // A remembered snapshot on the screen counts as held: the note then says the connection is lost, not that nothing could be read.
  const showing=useRef(false);
  const restartNow=useRef(()=>{});
  useEffect(()=>{showing.current=snapshot!==null;});
  useEffect(()=>{
    held.current=null;
    // The link's state and every decision about it are `linkNext`'s; this effect only opens, reads and drops streams.
    let link=linkStart(document.visibilityState==='hidden');
    let controller:AbortController|null=null,retry=0,stopped=false;
    function send(event:LinkEvent) {
      if(stopped) return;
      const next=linkNext(link,event);
      link=next.link;setError(linkLine(link));
      if(next.drop) {controller?.abort();controller=null;}
      if(next.drop || next.reconnect!==null) clearTimeout(retry);
      if(next.reconnect!==null) retry=window.setTimeout(()=>{send({type:'retry'});void connect();},next.reconnect);
    }
    async function connect() {
      if(stopped || controller || link.state!=='connecting') return;
      const mine=controller=new AbortController();
      // Only the stream still held speaks for the link: one dropped (the page hidden, the signal changed) says nothing.
      const say=(event:LinkEvent)=>{if(controller===mine) {controller=null;send(event);}};
      let watchdog=0;
      const arm=()=>{clearTimeout(watchdog);watchdog=window.setTimeout(()=>mine.abort(),silence());};
      try {
        arm();
        const reader=(await apiResponse(path,undefined,mine.signal)).body!.pipeThrough(new TextDecoderStream()).getReader();
        // Connected again: the note goes even if nothing changed meanwhile.
        if(controller===mine) send({type:'opened'});
        let rest='';
        for(;;) {
          const {value,done}=await reader.read();
          if(done) {say({type:'ended'});return;}
          arm();
          const split=splitFrames(rest+value);rest=split.rest;
          for(const data of split.frames.map(frameData)) {
            if(data===null) continue;
            const next=JSON.parse(data) as T&{build?:string};
            if(!onThisBuild(next.build)) return;
            if(newerSnapshot(held.current,next)) {held.current=next;if(controller===mine) send({type:'fresh'});setSnapshot(next);}
          }
        }
      } catch(failure) {
        // A 401 has already sent the phone to sign in, and a changed session ends this screen; other refusals say why and stop.
        if(failure instanceof StaleRequest) return;
        if(failure instanceof ApiFailure && failure.status<500) {say({type:'refused',line:failure.status===401?null:failureLine(failure,'read')});setGone(!!failure.body.gone);return;}
        // The watchdog's own abort is silence; anything else is a lost link.
        say(mine.signal.aborted?{type:'silent'}:{type:'lost',held:held.current!==null || showing.current});
      } finally {
        clearTimeout(watchdog);
        if(controller===mine) controller=null;
      }
    }
    const visibility=()=>send({type:document.visibilityState==='hidden'?'hidden':'shown'});
    // The signal going or coming back leaves the open stream likely dead (it can stay silent until the watchdog): start again at once.
    const restart=()=>send({type:'restart'});
    restartNow.current=restart;
    document.addEventListener('visibilitychange',visibility);addEventListener('offline',restart);addEventListener('online',restart);
    void connect();
    return ()=>{
      stopped=true;clearTimeout(retry);controller?.abort();
      document.removeEventListener('visibilitychange',visibility);removeEventListener('offline',restart);removeEventListener('online',restart);
    };
  },[path]);
  const offer=(next:T)=>{if(newerSnapshot(held.current,next)) {held.current=next;setSnapshot(next);}};
  return {snapshot,arrived:shown?.at??'',error,gone,offer,refresh:()=>restartNow.current()};
}
/**
 * A lead screen's read of `path`, read again every 5 s while the page is visible (lead reads have no live stream): the
 * newest answer, when it arrived ("10:42:05"), why the last read failed (null once one arrives), `refresh` to read now,
 * and `offer` to show a save's answer in its place (a read already on its way is then dropped).
 */
export function usePolledRead<T>(path:string) {
  // A screen seen before starts from what it showed last, with the time it arrived, and reads again behind it.
  const [read,setRead]=useState<T|null>(()=>lastSeen<T>(path)?.value??null),[updated,setUpdated]=useState(()=>lastSeen(path)?.at??''),[error,setError]=useState<unknown>(null);
  const request=useRef(0);
  function show(next:T) {const at=clockWithSeconds(new Date());keepSeen(path,next,at);setRead(next);setUpdated(at);setError(null);}
  async function refresh() {
    const generation=++request.current;
    try {const next=await api<T>(path);if(generation===request.current) show(next);}
    catch(failure) {if(generation===request.current) setError(failure);}
  }
  useEffect(()=>{
    void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    return ()=>{request.current++;clearInterval(timer);};
  },[path]);
  return {read,updated,error,refresh,offer:(next:T)=>{request.current++;show(next);}};
}
