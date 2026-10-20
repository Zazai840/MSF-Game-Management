import type { ReactNode } from 'react';
import { currentRaceLabel,type HomeEvent } from '../../shared/race-screen.js';

const icon=(paths:ReactNode)=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;

/** Home: the day's switched-on events, one heading per event name in programme order, a tile per Section opening its race screen. */
export function Home({events,onEvent}:{events:HomeEvent[];onEvent:(code:string)=>void}) {
  return <section className="home"><h1>Which event are you at?</h1>
    {[...new Set(events.map(event=>event.name))].map(name=><section className="event-sections" key={name} aria-label={name}><h2>{name}</h2><div className="section-choices">
      {events.filter(event=>event.name===name).map(event=><button key={event.code} aria-label={`${name} ${event.section} · ${currentRaceLabel(event.race)}`} onClick={()=>onEvent(event.code)}>{event.section}<small>{currentRaceLabel(event.race)}</small></button>)}
    </div></section>)}
  </section>;
}

/** A big menu button: icon tile, title, one line of explanation, optional badge, chevron. The Dashboard menu uses it. */
export function JobButton({icon,title,explanation,badge,onClick}:{icon:ReactNode;title:string;explanation:string;badge?:ReactNode;onClick:()=>void}) {
  return <button className="job-button" onClick={onClick}>
    <span className="job-icon" aria-hidden="true">{icon}</span>
    <span className="job-text"><span className="job-title">{title}</span><span className="job-explanation">{explanation}</span>{badge}</span>
    <svg className="job-chevron" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
  </button>;
}
export const jobIcon=icon;

/** The lead's way into the lead area, or a volunteer's way to give the lead code. */
export function LeadEntry({isLead,toCheck,onDashboard,onBecomeLead}:{isLead:boolean;toCheck:number;onDashboard:()=>void;onBecomeLead:()=>void}) {
  if(!isLead) return <button className="button-secondary lead-entry" onClick={onBecomeLead}>I'm a zone lead</button>;
  return <button className="lead-entry" onClick={onDashboard}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
    Dashboard{toCheck>0 && <>{' '}<span className="badge badge-attention">{toCheck} to check</span></>}
  </button>;
}
