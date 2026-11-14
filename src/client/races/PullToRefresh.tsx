import { useEffect,useRef,useState } from 'react';
import { Icon,reducedMotion } from './parts.js';
/** The pull down that refreshes a screen, with its hint: the one way to refresh by hand, on every screen that shows data (one per screen). */
export function PullToRefresh({onRefresh}:{onRefresh:()=>void}) {
  const pull=usePullToRefresh(onRefresh);
  return <p ref={pull.hint} className="rz-pull" data-state={pull.state}>{pull.state==='refreshing'?<span className="rz-spinner" aria-hidden="true"/>:<Icon name="chevron-down"/>}
    {pull.state==='refreshing'?'Refreshing…':pull.state==='ready'?'Let go to refresh':'Pull down to refresh'}</p>;
}
/** How far the hint comes down before letting go refreshes, how far a finger moves before a pull counts, and how long "Refreshing…" stays. */
const threshold=64,slack=10,shownFor=700;
/** The further the pull, the less the hint follows: it slows before it stops, as a real thing does. */
const rubberBand=(pull:number,room:number)=>(pull*room*0.55)/(room+0.55*pull);
type PullState='idle'|'pulling'|'ready'|'refreshing';
/**
 * Pull down to refresh, on a screen at its top with no sheet or keyboard open: the hint follows the finger from the
 * first move (with reduced motion it only appears), says "Let go to refresh" past the threshold with a short buzz
 * where the phone has one, and letting go there refreshes. Letting go earlier does nothing.
 */
function usePullToRefresh(onRefresh:()=>void) {
  const [state,setState]=useState<PullState>('idle'),hint=useRef<HTMLParagraphElement>(null),refresh=useRef(onRefresh);
  useEffect(()=>{refresh.current=onRefresh;});
  useEffect(()=>{
    let startY:number|null=null,phase:PullState='idle',timer=0;
    const set=(next:PullState)=>{if(next!==phase) {phase=next;setState(next);}};
    // Straight onto the element: a pull moves it every frame.
    const follow=(distance:number|null)=>{if(hint.current) hint.current.style.transform=distance===null || reducedMotion()?'':`translate(-50%, ${distance}px)`;};
    const start=(event:TouchEvent)=>{
      const busy=phase==='refreshing' || event.touches.length!==1 || scrollY>0 || document.querySelector('.rz-scrim') || document.documentElement.dataset.keyboard==='open';
      if(busy || (event.target as Element).closest('[aria-roledescription="drag handle"], input, textarea')) return;
      startY=event.touches[0].clientY;
      listen(event.target);
    };
    // A touch's events go to the element it started on, even after a live read takes that element off the page; there
    // they never reach the window, so the pull listens on that element too. A second call for the same event changes nothing.
    let touched:EventTarget|null=null;
    const listen=(target:EventTarget|null)=>{
      touched?.removeEventListener('touchmove',move as EventListener);touched?.removeEventListener('touchend',end);touched?.removeEventListener('touchcancel',end);
      touched=target;
      touched?.addEventListener('touchmove',move as EventListener,{passive:false});touched?.addEventListener('touchend',end);touched?.addEventListener('touchcancel',end);
    };
    const move=(event:TouchEvent)=>{
      if(startY===null) return;
      const by=event.touches[0].clientY-startY-slack;
      if(by<=0 || scrollY>0) {follow(null);set('idle');return;}
      if(event.cancelable) event.preventDefault();
      const distance=rubberBand(by,innerHeight),ready=distance>=threshold;
      if(ready && phase!=='ready') navigator.vibrate?.(10);
      follow(distance);set(ready?'ready':'pulling');
    };
    const end=()=>{
      if(startY===null) return;
      startY=null;listen(null);follow(null);
      if(phase!=='ready') {set('idle');return;}
      set('refreshing');refresh.current();
      timer=window.setTimeout(()=>set('idle'),shownFor);
    };
    addEventListener('touchstart',start,{passive:true});addEventListener('touchmove',move,{passive:false});addEventListener('touchend',end);addEventListener('touchcancel',end);
    return ()=>{
      clearTimeout(timer);listen(null);
      removeEventListener('touchstart',start);removeEventListener('touchmove',move);removeEventListener('touchend',end);removeEventListener('touchcancel',end);
    };
  },[]);
  return {state,hint};
}
