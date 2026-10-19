import { useState, type FormEvent, type ReactNode } from 'react';
import { sections, type DayRead } from '../../shared/day.js';
import { api,apiDownload,phoneStorage,startNewDay } from '../api.js';
import './day.css';

const chevron=<svg className="day-row-chevron" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>;
/** "13:40": the day export's time in 24-hour form, as the scoring team reads it on the day. */
function clock(at:string) {const time=new Date(at);return `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;}
/** When the day export was last downloaded, and whether anything changed after it. */
export function exportStatus(day:Pick<DayRead,'exportedAt'|'exportedRevision'|'revision'>) {
  if(!day.exportedAt) return 'Not downloaded yet.';
  return `Last downloaded ${clock(day.exportedAt)}, ${day.exportedRevision===day.revision?'includes every change so far':'with newer changes since'}.`;
}
/** Runs one lead action: a short "Saved" on success, v1's "Not saved" wording and the server's reason on failure. */
function useAction(onChanged:()=>Promise<void>,onSaved:()=>void) {
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState<{where:string;message:string}|null>(null);
  async function run(where:string,path:string,body:unknown) {
    setBusy(true);setFailed(null);
    try {await api(path,body);onSaved();await onChanged();return true;}
    catch(error) {setFailed({where,message:error instanceof Error?error.message:'Could not connect'});return false;}
    finally {setBusy(false);}
  }
  const failure=(where:string,again:string)=>failed?.where===where && <><p className="day-not-saved">Not saved - tap {again} again</p><p role="alert">{failed.message}</p></>;
  return {busy,run,failure};
}

/** A code the scoring team reads out; with an action, a button that makes a new one, or the children that change it. */
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
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function change(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    // The change ends this phone's session too, so it signs out as the server's password-changed reason would.
    try {await api('day/olympics-password',{password});phoneStorage.signOut();}
    catch(error) {setError(error instanceof Error?error.message:'Could not connect - tap Change password again');setBusy(false);}
  }
  if(!open) return <button className="button-secondary button-small" onClick={()=>setOpen(true)}>Change Olympics password</button>;
  return <form onSubmit={change}>
    <label>New Olympics password<input value={password} onChange={event=>setPassword(event.target.value)} autoComplete="off" autoCapitalize="none" required /></label>
    <p className="day-text">Every phone, including yours, goes back to the password screen. Profiles stay on the phones.</p>
    {error && <p role="alert">{error}</p>}
    <div className="day-actions"><button className="button-small" disabled={busy}>{busy?'Changing…':'Change password'}</button>
      <button type="button" className="button-secondary button-small" disabled={busy} onClick={()=>{setOpen(false);setPassword('');setError('');}}>Cancel</button></div>
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
  const [exportMessage,setExportMessage] = useState('');
  const [exportError,setExportError] = useState('');
  const [confirmation,setConfirmation]=useState('');
  const [resetError,setResetError]=useState('');
  async function startNew(event:FormEvent) {
    event.preventDefault();setBusy(true);setResetError('');
    try {await startNewDay(confirmation);}
    catch(error) {setResetError(error instanceof Error?error.message:'Could not connect - tap Start a new day again');}
    finally {setBusy(false);}
  }
  async function download() {
    setBusy(true);setExportError('');setExportMessage('');
    try {
      const {blob,filename}=await apiDownload('day/export');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setExportMessage('Day export downloaded');await onChanged();
    } catch(error) {setExportError(error instanceof Error?error.message:'Could not connect');setExportMessage('Not downloaded - tap Download day export again');}
    finally {setBusy(false);}
  }
  const events=day.events.length;
  return <div className="day-setup">
    <CodeCard label="Olympics password" code={day.olympicsPassword} explanation="Volunteers type this once on their phone. Only the scoring team can see it here."
      note="It stays the same when a new day starts."><ChangePassword/></CodeCard>
    <CodeCard label="Lead code" code={day.leadCode} explanation="Give this only to zone leads. It opens the Dashboard."
      note="Zone leads who used the old code go back to being volunteers. The scoring team keeps access."
      make={{action:'Make a new lead code',busy:saving,onMake:()=>void run('lead','day/lead-code',{}),failure:failure('lead','Make a new lead code')}}/>
    <div className="day-rows">
      <button className="day-row" onClick={()=>onOpen('Signed in today')}>
        <span className="day-row-text"><span className="day-row-title">Phones</span>
          <span className="day-row-sub">{phones===null?'Signed in today':`${phones} ${phones===1?'person':'people'} signed in today`}</span></span>{chevron}
      </button>
      <button className="day-row" onClick={()=>onOpen('Events')}>
        <span className="day-row-text"><span className="day-row-title">Events</span>
          <span className="day-row-sub">{events} {events===1?'event':'events'} · {day.eventsConfirmed?'checked and confirmed':'not confirmed yet'}</span></span>{chevron}
      </button>
    </div>
    <section className="day-card" aria-label="Day export">
      <span className="day-card-title">Day export</span>
      <p className="day-text">Excel file of today's results for the scoring workbook. <span>{exportStatus(day)}</span></p>
      <button disabled={busy} onClick={()=>void download()}>{busy?'Please wait…':'Download day export'}</button>
      {exportMessage && <p className="day-note" role="status">{exportMessage}</p>}{exportError && <p role="alert">{exportError}</p>}
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

/** v1's event list for the day: rename, switch off or on, confirm the list and add an event. */
export function Events({day,onChanged,onSaved}:{day:DayRead;onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const {busy,run,failure}=useAction(onChanged,onSaved);
  const [editing,setEditing] = useState<string|null>(null);
  const [name,setName] = useState('');
  const [newCode,setNewCode] = useState('');
  const [newName,setNewName] = useState('');
  const [section,setSection] = useState('');
  const [format,setFormat] = useState('');
  async function rename(event:FormEvent) {
    event.preventDefault();
    if (editing && await run('list',`day/events/${encodeURIComponent(editing)}/rename`,{name})) setEditing(null);
  }
  async function add(event:FormEvent) {
    event.preventDefault();
    if (await run('add','day/events',{code:newCode,name:newName,section,format})) {
      setNewCode(''); setNewName(''); setSection(''); setFormat('');
    }
  }
  return <div className="day-setup">
    <section className="day-card" aria-label="Event list">
      <p className="day-text">{day.eventsConfirmed?'Event list confirmed':'Check the events, then confirm the list'}</p>
      {!day.eventsConfirmed && <button disabled={busy} onClick={()=>void run('list','day/confirm-events',{})}>Confirm event list</button>}
      {failure('list','Save')}
    </section>
    <div className="day-events">{day.events.map(event=><article key={event.id} className={event.enabled?'day-card':'day-card day-card-off'} aria-label={`${event.code} · ${event.section}`}>
      <h3>{event.code} · {event.name}</h3>
      <p className="day-text">{event.section} · {event.format==='heats'?'Heats then final':'Timed'}{!event.enabled && ' · Switched off'}</p>
      {editing===event.code ? <form onSubmit={rename}>
        <label>New name for {event.code}<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required /></label>
        <div className="day-actions"><button className="button-small" disabled={busy}>Save name for {event.code}</button><button type="button" className="button-secondary button-small" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></div>
      </form> : <div className="day-actions">
        <button className="button-secondary button-small" disabled={busy} onClick={()=>{setName(event.name);setEditing(event.code);}}>Rename {event.code}</button>
        <button className="button-secondary button-small" disabled={busy} onClick={()=>void run('list',`day/events/${encodeURIComponent(event.code)}/enabled`,{enabled:!event.enabled})}>{event.enabled?'Switch off':'Switch on'} {event.code}</button>
      </div>}
    </article>)}</div>
    <section className="day-card" aria-label="Add an event">
      <span className="day-card-title">Add an event</span>
      <form onSubmit={add}>
        <label>New event code<input value={newCode} onChange={e=>setNewCode(e.target.value)} maxLength={12} autoCapitalize="characters" required /></label>
        <label>New event name<input value={newName} onChange={e=>setNewName(e.target.value)} maxLength={100} required /></label>
        <label>New event section<select aria-label="New event section" value={section} onChange={e=>setSection(e.target.value)} required><option value="">Choose section</option>{sections.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>New event format<select aria-label="New event format" value={format} onChange={e=>setFormat(e.target.value)} required><option value="">Choose event format</option><option value="heats">Heats then final</option><option value="timed">Timed</option></select></label>
        <button disabled={busy}>{busy?'Saving…':'Add event'}</button>
      </form>
      {failure('add','Add event')}
    </section>
  </div>;
}
