import type { ReactNode } from 'react';
import { homeStatus,type HomeSnapshot } from '../../shared/race-screen.js';
import { teamsBadge } from '../../shared/teams.js';
import { useLive } from '../live.js';
import type { HomeTab } from '../api.js';

const icon=(paths:ReactNode)=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;

const teamsIcon=icon(<><circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.6-.4 5 1.4 5 4.3"/></>);
const tabs:Array<[HomeTab,string]>=[['races','Races & Hurdles'],['relays','Relays']];
/**
 * Home: the day's switched-on events, live from the day-wide stream, behind two tabs: Races & Hurdles, then Relays,
 * which opens with the Teams button.
 * One heading per event name in programme order, a tile per Section opening its race screen. Each tile's status line
 * says what is happening on the event's current race.
 */
export function Home({tab,onTab,onEvent,onTeams}:{tab:HomeTab;onTab:(tab:HomeTab)=>void;onEvent:(code:string)=>void;onTeams:()=>void}) {
  const {snapshot,error}=useLive<HomeSnapshot>('live/home');
  const events=(snapshot?.events||[]).filter(event=>event.relay===(tab==='relays')),badge=teamsBadge(events);
  return <section className="home">
    <div className="tabs-seg" role="tablist" aria-label="Events">{tabs.map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} onClick={()=>onTab(key)}>{label}</button>)}</div>
    <h1>Which event are you at?</h1>
    {!snapshot?error?<p role="alert">{error}</p>:<p>Opening…</p>:error && <p role="status" className="calm-note">{error}</p>}
    {tab==='relays' && <JobButton icon={teamsIcon} title="Teams" explanation="Type each relay's teams at the prep area" badge={badge && <span className="badge">{badge}</span>} onClick={onTeams}/>}
    {[...new Set(events.map(event=>event.name))].map(name=><section className="event-sections" key={name} aria-label={name}><h2>{name}</h2><div className="section-choices">
      {events.filter(event=>event.name===name).map(event=>{const status=homeStatus(event);return <button key={event.code} aria-label={`${name} ${event.section} · ${status}`} onClick={()=>onEvent(event.code)}>{event.section}<small>{status}</small></button>;})}
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
