import { useId,useState,type FormEvent,type ReactNode } from 'react';
import { roleLabels,type Role } from '../../shared/race-flow.js';
import { api } from '../api.js';
import { Callout,DockedFooter,Icon,Sheet,Star,roleDescriptions,roleIcons } from './parts.js';
const jobs=['start','finish','timer'] as const;
/** A job as a radio card: its job star, name and one line. */
export function JobCard({role,checked,onChoose}:{role:Role;checked:boolean;onChoose:()=>void}) {
  return <button type="button" role="radio" aria-checked={checked} className={`rz-jobcard rz-jobcard--${role}`} onClick={onChoose}>
    <span className="rz-jobcard__icon"><Star/><Icon name={roleIcons[role]}/></span>
    <span><span className="rz-jobcard__title">{role==='lead'?'Zone lead':roleLabels[role]}</span><span className="rz-jobcard__desc">{roleDescriptions[role]}</span></span>
    <span className="rz-jobcard__mark" aria-hidden="true"/>
  </button>;
}
/** The three volunteer jobs, as one radio group. */
export function JobChoice({role,onChoose,label}:{role:Role|null;onChoose:(role:Role)=>void;label:string}) {
  return <div role="radiogroup" aria-label={label} style={{display:'flex',flexDirection:'column',gap:10}}>
    {jobs.map(job=><JobCard key={job} role={job} checked={role===job} onChoose={()=>onChoose(job)}/>)}
  </div>;
}
/**
 * Switch job, from the role chip on any screen: tapping a job switches at once and closes the sheet (a race stays
 * open, in the new view). Zone lead asks for the lead code once per day, then switches.
 */
export function RoleSheet({role,lead,onChoose,onLead,onClose}:{role:Role;lead:boolean;onChoose:(role:Role)=>void;onLead:()=>Promise<void>;onClose:()=>void}) {
  const [asking,setAsking]=useState(false);
  return <Sheet title="Your job" onClose={onClose}>
    <p className="rz-sheet__text">This changes what you see on every race. Switch back any time.</p>
    <JobChoice role={role} label="Your job" onChoose={onChoose}/>
    <div style={{borderTop:'1.5px solid var(--line)',paddingTop:12}}>
      <JobCard role="lead" checked={role==='lead'} onChoose={()=>lead?onChoose('lead'):setAsking(true)}/>
    </div>
    {asking && !lead && <LeadCode onLead={async()=>{await onLead();onChoose('lead');}}/>}
    <button type="button" className="rz-btn rz-btn--small rz-btn--block" onClick={onClose}>Close</button>
  </Sheet>;
}
/**
 * The lead code, asked once per day before a volunteer can switch to Zone lead. With a `prompt` it is a screen's body
 * (Lead access needed): the prompt and field, and "Become lead" in the docked footer, greyed with its reason until a
 * code is typed.
 */
export function LeadCode({onLead,prompt}:{onLead:()=>Promise<void>;prompt?:ReactNode}) {
  const docked=prompt!==undefined;
  const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),id=useId();
  async function become(event:FormEvent) {
    event.preventDefault();if(!code) return;
    setBusy(true);setError('');
    try {await api('become-lead',{code});await onLead();}
    catch(failure) {setError(failure instanceof Error?failure.message:'Could not connect - please try again');}
    finally {setBusy(false);}
  }
  const button=<button className="rz-btn rz-btn--primary rz-btn--block" form={`${id}-form`} disabled={busy} aria-disabled={docked && !code || undefined}>{busy?'Checking…':docked?'Become lead':'Switch to Zone lead'}</button>;
  const form=<form id={`${id}-form`} className="rz-field" onSubmit={become}>
    <label className="rz-field__label" htmlFor={id}>Lead code</label>
    <input className="rz-field__input" id={id} type="password" autoComplete="off" value={code} onChange={event=>setCode(event.target.value)} required={!docked}/>
    {error && <Callout message={error}/>}
    {!docked && button}
  </form>;
  return docked?<><main className="rz-main rz-main--form">{prompt}{form}</main>
    <DockedFooter>{!code && <p className="rz-footer__reason">Type the code first.</p>}{button}</DockedFooter></>:form;
}
