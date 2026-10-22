import { useState,type ReactNode } from 'react';
/** A card opened and closed by its header, side arrow on the right. Opening it calls `onOpen` (taking its job's hold); closing only tidies this phone's screen. */
export function RaceCard({title,status,onOpen,children}:{title:string;status:string;onOpen?:()=>void;children:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <section className="race-card">
    <button className="race-card-head" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open) onOpen?.();}}>
      <span className="race-card-text"><span className="race-card-title">{title}</span><span className="race-card-status">{status}</span></span>
      <span className="race-card-arrow" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
    </button>
    {open && <div className="race-card-body">{children}</div>}
  </section>;
}
