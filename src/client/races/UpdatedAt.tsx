import { useEffect,useRef,useState } from 'react';
import { Icon,reducedMotion } from './parts.js';
/** "Updated at 10:42:05", one centred line on Races and every lead screen. A pull down from the top of the screen is the one way to refresh by hand. */
export function UpdatedAt({time,onRefresh}:{time:string;onRefresh:()=>void}) {
  const pull=usePullToRefresh(onRefresh);
  return <><p className="rz-refresh" aria-live="polite">Updated at {time||'…'}</p>
    <p ref={pull.hint} className="rz-pull" data-state={pull.state}>{pull.state==='refreshing'?<span className="rz-spinner" aria-hidden="true"/>:<Icon name="chevron-down"/>}
      {pull.state==='refreshing'?'Refreshing…':pull.state==='ready'?'Let go to refresh':'Pull down to refresh'}</p></>;
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
      startY=null;follow(null);
      if(phase!=='ready') {set('idle');return;}
      set('refreshing');refresh.current();
      timer=window.setTimeout(()=>set('idle'),shownFor);
    };
    // The browser's own pull (Chrome's reload) is off while this screen has its own.
    document.documentElement.classList.add('rz-pulls');
    addEventListener('touchstart',start,{passive:true});addEventListener('touchmove',move,{passive:false});addEventListener('touchend',end);addEventListener('touchcancel',end);
    return ()=>{
      clearTimeout(timer);document.documentElement.classList.remove('rz-pulls');
      removeEventListener('touchstart',start);removeEventListener('touchmove',move);removeEventListener('touchend',end);removeEventListener('touchcancel',end);
    };
  },[]);
  return {state,hint};
}
