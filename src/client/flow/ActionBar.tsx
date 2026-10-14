import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import './flow.css';
/** How far the on-screen keyboard covers the bottom of the page (iOS overlays it instead of shrinking the page). */
function useKeyboardInset() {
  const [inset,setInset]=useState(0);
  useEffect(()=>{
    const viewport=window.visualViewport;if(!viewport) return;
    const update=()=>setInset(Math.max(0,Math.round(window.innerHeight-viewport.height-viewport.offsetTop)));
    update();viewport.addEventListener('resize',update);viewport.addEventListener('scroll',update);
    return ()=>{viewport.removeEventListener('resize',update);viewport.removeEventListener('scroll',update);};
  },[]);
  return inset;
}
/** Buttons pinned to the bottom of the screen, riding directly above the phone's keyboard while it is open. */
export function ActionBar({children,stacked=false}:{children:ReactNode;stacked?:boolean}) {
  const inset=useKeyboardInset();
  const bar=useRef<HTMLDivElement>(null);
  // The page keeps room at its end for the bar, so the last row never hides behind it.
  useLayoutEffect(()=>{
    const element=bar.current;if(!element) return;
    const root=document.documentElement;
    const observer=new ResizeObserver(()=>root.style.setProperty('--action-bar-height',`${element.offsetHeight}px`));
    observer.observe(element);
    return ()=>{observer.disconnect();root.style.removeProperty('--action-bar-height');};
  },[]);
  return <div ref={bar} className={stacked?'action-bar action-bar-stacked':'action-bar'} style={{bottom:inset}}><div className="action-bar-inner">{children}</div></div>;
}
