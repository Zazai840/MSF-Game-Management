import type { ReactNode } from 'react';
import { Trail } from './Trail.js';
import './flow.css';
/**
 * The full-screen thank-you after the server confirms a volunteer's save.
 * `race` names what was saved, for example "60m Boy Beavers · Heat 3 · 5 runners".
 * Children are small secondary actions shown below Home (for example Edit runners).
 */
export function Saved({race,nextLabel,onNext,onHome,children}:{race:string;nextLabel:string;onNext:()=>void;onHome:()=>void;children?:ReactNode}) {
  return <section className="saved">
    <Trail steps={[{label:'Home',onSelect:onHome},{label:'Saved'}]}/>
    <div className="saved-body" role="status">
      <span className="saved-tick" aria-hidden="true"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <h1>Thank you.{' '}<br/>Your responses have been saved.</h1>
      <p data-testid="saved-race">{race}</p>
    </div>
    <div className="saved-actions">
      <button type="button" onClick={onNext}>{nextLabel}</button>
      <button type="button" className="button-secondary" onClick={onHome}>Home</button>
      {children && <div className="saved-more">{children}</div>}
    </div>
  </section>;
}
