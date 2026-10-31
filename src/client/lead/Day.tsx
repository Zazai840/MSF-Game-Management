import { useState, type FormEvent, type ReactNode } from 'react';
import type { DayRead } from '../../shared/day.js';
import { api,apiDownload,phoneStorage,startNewDay } from '../api.js';
import { useSubmit } from '../flow/useSubmit.js';
import { useToast } from '../races/Toast.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';
import { clock } from '../../shared/clock.js';
import './day.css';

const chevron=<svg className="day-row-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>;
/** When the day export was last downloaded, and whether anything changed after it. */
export function exportStatus(day:Pick<DayRead,'exportedAt'|'exportedRevision'|'revision'>) {
  if(!day.exportedAt) return 'Not downloaded yet.';
  return `Last downloaded ${clock(day.exportedAt)}, ${day.exportedRevision===day.revision?'includes every change so far':'with newer changes since'}.`;
}
/** Runs one lead action: the toast naming what was saved (built from the answer), v1's "Not saved" wording and the server's reason on failure. */
function useAction(onChanged:()=>Promise<void>,onSaved:()=>void) {
  const toast=useToast();
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState<{where:string;message:string}|null>(null);
  async function run<T>(where:string,path:string,body:unknown,saved:(answer:T)=>ToastSave) {
    setBusy(true);setFailed(null);
    try {const answer=await api<T>(path,body);toast({message:toastLine(saved(answer))});onSaved();await onChanged();return true;}
    catch(error) {setFailed({where,message:error instanceof Error?error.message:'Could not connect'});return false;}
    finally {setBusy(false);}
  }
  const failure=(where:string,again:string)=>failed?.where===where && <><p className="day-not-saved">Not saved - tap {again} again</p><p role="alert">{failed.message}</p></>;
  return {busy,run,failure};
}

/** A code a lead reads out; with an action, a button that makes a new one, or the children that change it. */
function CodeCard({label,code,explanation,note,make,children}:{label:string;code:string;explanation:string;note:string;make?:{action:string;busy:boolean;onMake:()=>void;failure:ReactNode};children?:ReactNode}) {
  return <section className="day-card" aria-label={label}>
    <span className="day-label" aria-hidden="true">{label}</span>
    <span className="code">{code}</span>
    <p className="day-text">{explanation}</p>
    {make && <button className="button-secondary button-small" disabled={make.busy} onClick={make.onMake}>{make.action}</button>}
    {children}
    <p className="day-note">{note}</p>
    {make?.failure}
  </section>;
}

/** Change Olympics password: the new password and what it does to every phone, then this phone goes to the password screen too. */
function ChangePassword() {
  const [open,setOpen]=useState(false);
  const [password,setPassword]=useState('');
  const [confirming,setConfirming]=useState(false);
  const {busy,error,submit,setError}=useSubmit();
  // The change ends this phone's session too, so it signs out as the server's password-changed reason would.
  const change=()=>void submit(async()=>{await api('day/olympics-password',{password});phoneStorage.signOut();},()=>setConfirming(false));
  if(!open) return <button className="button-secondary button-small" onClick={()=>setOpen(true)}>Change Olympics password</button>;
  if(confirming) return <div className="day-confirm">
    <p className="calm-note">Every phone, including yours, goes back to Join. Profiles stay on the phones.</p>
    <div className="day-actions"><button className="button-small" disabled={busy} onClick={change}>{busy?'Changing…':'Yes, change password'}</button>
      <button type="button" className="button-secondary button-small" disabled={busy} onClick={()=>setConfirming(false)}>Keep the old password</button></div>
  </div>;
  return <form onSubmit={(event:FormEvent)=>{event.preventDefault();setError('');setConfirming(true);}}>
    <label>New Olympics password<input value={password} onChange={event=>setPassword(event.target.value)} autoComplete="off" autoCapitalize="none" required /></label>
    {error && <p role="alert">{error}</p>}
    <div className="day-actions"><button className="button-small">Change password</button>
      <button type="button" className="button-secondary button-small" onClick={()=>{setOpen(false);setPassword('');setError('');}}>Cancel</button></div>
  </form>;
}

/**
 * Day setup (v1's Day tab): the Olympics password and lead code, rows opening Phones and Events, the day export and
 * Start a new day. Start a new day keeps v1's typed confirmation; the server still refuses it until the
 * latest changes are in a day export.
 */
export function Day({day,phones,onOpen,onChanged,onSaved}:{day:DayRead;phones:number|null;onOpen:(screen:'Signed in today'|'Events')=>void;onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const {busy:saving,run,failure}=useAction(onChanged,onSaved);
  const [busy,setBusy] = useState(false);
  const [exportError,setExportError] = useState('');
  const [confirmation,setConfirmation]=useState('');
  const [resetError,setResetError]=useState('');
  async function startNew(event:FormEvent) {
    event.preventDefault();setBusy(true);setResetError('');
    try {await startNewDay(confirmation);}
    catch(error) {setResetError(error instanceof Error?error.message:'Could not connect - tap Start a new day again');}
    finally {setBusy(false);}
  }
  const toast=useToast();
  async function download() {
    setBusy(true);setExportError('');
    try {
      const {blob,filename}=await apiDownload('day/export');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast({message:toastLine({kind:'downloaded',file:filename})});await onChanged();
    } catch(error) {setExportError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  const events=day.events.length;
  return <div className="day-setup">
    <CodeCard label="Olympics password" code={day.olympicsPassword} explanation="Volunteers type this once on their phone. Only leads can see it here."
      note="It stays the same when a new day starts."><ChangePassword/></CodeCard>
    <CodeCard label="Lead code" code={day.leadCode} explanation="Give this only to zone leads. Typed on Join or in Your job, it makes the phone a zone lead."
      note="Other leads go back to being volunteers. You and the owner keep access."
      make={{action:'Make a new lead code',busy:saving,onMake:()=>void run<{leadCode:string}>('lead','day/lead-code',{},({leadCode})=>({kind:'lead-code',code:leadCode})),failure:failure('lead','Make a new lead code')}}/>
    <div className="day-rows">
      <button className="day-row" onClick={()=>onOpen('Signed in today')}>
        <span className="day-row-text"><span className="day-row-title">Phones</span>
          <span className="day-row-sub">{phones===null?'Signed in today':`${phones} ${phones===1?'person':'people'} signed in today`}</span></span>{chevron}
      </button>
      <button className="day-row" onClick={()=>onOpen('Events')}>
        <span className="day-row-text"><span className="day-row-title">Events</span>
          <span className="day-row-sub">{events} {events===1?'event':'events'}</span></span>{chevron}
      </button>
    </div>
    <section className="day-card" aria-label="Day export">
      <span className="day-card-title">Day export</span>
      <p className="day-text">Excel file of today's results for the scoring workbook. <span>{exportStatus(day)}</span></p>
      <button disabled={busy} onClick={()=>void download()}>{busy?'Please wait…':'Download day export'}</button>
      {exportError && <><p className="day-not-saved">Not downloaded - tap Download day export again</p><p role="alert">{exportError}</p></>}
    </section>
    <section className="day-reset" aria-label="Start a new day">
      <form onSubmit={startNew}>
        <label>Type NEW DAY to confirm<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" autoCapitalize="characters" /></label>
        <button className="button-danger" disabled={busy || confirmation!=='NEW DAY'}>Start a new day</button>
      </form>
      <p className="day-note">Clears today's races. Download the day export first.</p>
      {resetError && <p role="alert">{resetError}</p>}
    </section>
  </div>;
}
