import { useLayoutEffect,useRef,type ReactNode } from 'react';
import './flow.css';
/** Buttons pinned to the bottom of the screen, riding directly above the phone's keyboard while typing (keyboard.ts). */
export function ActionBar({children,stacked=false}:{children:ReactNode;stacked?:boolean}) {
  const bar=useRef<HTMLDivElement>(null);
  // The page keeps room at its end for the bar, so the last row never hides behind it.
  useLayoutEffect(()=>{
    const element=bar.current;if(!element) return;
    const root=document.documentElement;
    const observer=new ResizeObserver(()=>root.style.setProperty('--action-bar-height',`${element.offsetHeight}px`));
    observer.observe(element);
    return ()=>{observer.disconnect();root.style.removeProperty('--action-bar-height');};
  },[]);
  return <div ref={bar} className={stacked?'action-bar action-bar-stacked':'action-bar'}><div className="action-bar-inner">{children}</div></div>;
}
