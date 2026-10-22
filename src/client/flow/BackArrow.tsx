import { createContext,useContext,useState,type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './flow.css';
const Host=createContext<HTMLElement|null>(null);
/** Wrap the screens below the header; the back arrow of whichever screen is showing renders at the top of it. */
export function BackArea({children}:{children:ReactNode}) {
  const [host,setHost]=useState<HTMLElement|null>(null);
  return <Host.Provider value={host}><div ref={setHost}/>{children}</Host.Provider>;
}
/**
 * The bare back arrow at the left of the row under the header, on every screen but Home.
 * It goes up one level, to the screen named by `to` ("Back to Results").
 */
export function BackArrow({to,onBack}:{to:string;onBack:()=>void}) {
  const host=useContext(Host);
  const row=<nav className="app-nav" aria-label="Back">
    <button type="button" className="back-arrow" aria-label={`Back to ${to}`} onClick={onBack}>
      <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>
    </button>
  </nav>;
  return host?createPortal(row,host):row;
}
