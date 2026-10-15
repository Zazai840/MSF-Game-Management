import { createContext,useContext,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './flow.css';
/** One step of a job. The last step is where the person is now; every earlier one goes back when tapped. */
export interface TrailStep { label:string; onSelect?:()=>void }
const Host=createContext<HTMLElement|null>(null);
/** Wrap the screens below the header; the trail of whichever screen is showing renders at the top of it. */
export function TrailArea({children}:{children:ReactNode}) {
  const [host,setHost]=useState<HTMLElement|null>(null);
  return <Host.Provider value={host}><div className="trail-area" ref={setHost}/>{children}</Host.Provider>;
}
/**
 * The breadcrumb trail: `Home › Check in runners › 60m › Girl Cubs › Runners (2) › Check`.
 * It stays on one line, so on a narrow screen it drops steps from the left and starts with `…`.
 */
export function Trail({steps}:{steps:TrailStep[]}) {
  const host=useContext(Host);
  const nav=useRef<HTMLElement>(null);
  const [hidden,setHidden]=useState(0);
  const [width,setWidth]=useState(0);
  const key=steps.map(step=>step.label).join('\u0000');
  useLayoutEffect(()=>setHidden(0),[key,width]);
  useLayoutEffect(()=>{
    const element=nav.current;
    // The step just before the current one always stays, so there is always a way back; it shortens instead.
    if(element && element.scrollWidth>element.clientWidth+1 && hidden<steps.length-2) setHidden(hidden+1);
  });
  useLayoutEffect(()=>{
    const element=nav.current;if(!element) return;
    const observer=new ResizeObserver(([entry])=>setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);return ()=>observer.disconnect();
  },[host]);
  const shown=steps.slice(hidden);
  const trail=<nav className="trail" aria-label="Steps" ref={nav}>
    {hidden>0 && <><span className="trail-more" aria-hidden="true">…</span><span className="trail-separator" aria-hidden="true">›</span></>}
    {shown.map((step,index)=>{
      const last=index===shown.length-1;
      const shrinks=shown.length===1 || (hidden>0 && shown.length===2 && index===0);
      return <span className={shrinks?'trail-step trail-step-alone':'trail-step'} key={hidden+index}>
        {last||!step.onSelect?<span aria-current={last?'step':undefined}>{step.label}</span>:<button type="button" onClick={step.onSelect}>{step.label}</button>}
        {!last && <span className="trail-separator" aria-hidden="true">›</span>}
      </span>;
    })}
  </nav>;
  return host?createPortal(trail,host):trail;
}
