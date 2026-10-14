import type { ReactNode } from 'react';
import type { Job, WaitingCounts } from '../../shared/domain.js';

const icon=(paths:ReactNode)=><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;
/** What each job is called on screen; the internal job names stay Start line, Finish order and Times. */
const jobs:{job:Job;title:string;explanation:string;counted:boolean;icon:ReactNode}[]=[
  {job:'Start line',title:'Check in runners',explanation:"Type each runner's wristband number before the race starts",counted:false,icon:icon(<><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></>)},
  {job:'Finish order',title:'Record the finishing order',explanation:'Tap runners in the order they crossed the line',counted:true,icon:icon(<><path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></>)},
  {job:'Times',title:'Enter times',explanation:"Type each place's time from the timer",counted:true,icon:icon(<><circle cx="12" cy="14" r="7"/><path d="M12 14l3-2"/><path d="M10 3h4"/><path d="M12 3v4"/></>)}
];
export const racesReady=(count:number)=>`${count} ${count===1?'race':'races'} ready`;

export function Home({waiting,onJob}:{waiting:WaitingCounts;onJob:(job:Job)=>void}) {
  return <section className="home"><h1>What's your job for this race?</h1><div className="jobs">
    {jobs.map(({job,title,explanation,counted,icon})=><JobButton key={job} icon={icon} title={title} explanation={explanation} badge={counted && waiting[job]>0?<span className="badge">{racesReady(waiting[job])}</span>:null} onClick={()=>onJob(job)}/>)}
  </div></section>;
}

/** A big menu button: icon tile, title, one line of explanation, optional badge, chevron. Home jobs and the Dashboard menu share it. */
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
