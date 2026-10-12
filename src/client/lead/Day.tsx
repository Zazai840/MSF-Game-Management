import { useState, type FormEvent } from 'react';
import { sections, type DayRead } from '../../shared/day.js';
import { api,apiDownload } from '../api.js';
import './day.css';
import { Phones } from './Phones.js';

export function Day({day,onChanged}:{day:DayRead;onChanged:()=>Promise<void>}) {
  const [editing,setEditing] = useState<string|null>(null);
  const [name,setName] = useState('');
  const [newCode,setNewCode] = useState('');
  const [newName,setNewName] = useState('');
  const [section,setSection] = useState('');
  const [format,setFormat] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [exportMessage,setExportMessage] = useState('');
  const [exportError,setExportError] = useState('');
  async function save(path:string,body:unknown) {
    setBusy(true); setMessage(''); setError('');
    try { await api(path,body); setMessage('Saved'); await onChanged(); return true; }
    catch(error) { setMessage('Not saved - tap Save again'); setError(error instanceof Error?error.message:'Could not connect'); return false; }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true);setExportError('');setExportMessage('');
    try {
      const {blob,filename}=await apiDownload('day/export');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setExportMessage('Day export downloaded');await onChanged();
    } catch(error) {setExportError(error instanceof Error?error.message:'Could not connect');setExportMessage('Not downloaded — tap Download day export again');}
    finally {setBusy(false);}
  }
  async function rename(event:FormEvent) {
    event.preventDefault();
    if (editing && await save(`day/events/${encodeURIComponent(editing)}/rename`,{name})) setEditing(null);
  }
  async function add(event:FormEvent) {
    event.preventDefault();
    if (await save('day/events',{code:newCode,name:newName,section,format})) {
      setNewCode(''); setNewName(''); setSection(''); setFormat('');
    }
  }
  return <div className="day-setup">
    <dl><dt>Day code</dt><dd className="code">{day.dayCode}</dd><dt>Lead code</dt><dd className="code">{day.leadCode}</dd></dl>
    <section aria-label="Day export" className="day-export">
      <h2>Day export</h2>
      <p>Download all running results, finals and audit notes in one Excel workbook.</p>
      <button disabled={busy} onClick={()=>void download()}>{busy?'Please wait…':'Download day export'}</button>
      <p role="status">{exportMessage}</p>{exportError && <p role="alert">{exportError}</p>}
      <p>{day.exportedAt?`Last export: ${new Date(day.exportedAt).toLocaleString()}`:'No day export downloaded yet'}</p>
      {day.exportedAt && <p>{day.exportedRevision===day.revision?'Includes all changes so far':'Changes since the last export — download again before starting a new day'}</p>}
    </section>
    <Phones onChanged={onChanged} />
    <h2>Events for today</h2>
    <p>{day.eventsConfirmed?'Event list confirmed':'Check the events, then confirm the list'}</p>
    <button disabled={busy || day.eventsConfirmed} onClick={()=>void save('day/confirm-events',{})}>Confirm event list</button>
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    <div className="day-events">{day.events.map(event=><article key={event.id} aria-label={`${event.code} · ${event.section}`}>
      <h3>{event.code} · {event.name}</h3>
      <p>{event.section} · {event.format==='heats'?'Heats then final':'Timed'}{!event.enabled && ' · Switched off'}</p>
      {editing===event.code ? <form onSubmit={rename}>
        <label>New name for {event.code}<input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required /></label>
        <div className="day-actions"><button disabled={busy}>Save name for {event.code}</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></div>
      </form> : <div className="day-actions">
        <button disabled={busy} onClick={()=>{setName(event.name);setEditing(event.code);}}>Rename {event.code}</button>
        <button disabled={busy} onClick={()=>void save(`day/events/${encodeURIComponent(event.code)}/enabled`,{enabled:!event.enabled})}>{event.enabled?'Switch off':'Switch on'} {event.code}</button>
      </div>}
    </article>)}</div>
    <h2>Add an event</h2>
    <form onSubmit={add}>
      <label>New event code<input value={newCode} onChange={e=>setNewCode(e.target.value)} maxLength={12} autoCapitalize="characters" required /></label>
      <label>New event name<input value={newName} onChange={e=>setNewName(e.target.value)} maxLength={100} required /></label>
      <label>New event section<select aria-label="New event section" value={section} onChange={e=>setSection(e.target.value)} required><option value="">Choose section</option>{sections.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>New event format<select aria-label="New event format" value={format} onChange={e=>setFormat(e.target.value)} required><option value="">Choose event format</option><option value="heats">Heats then final</option><option value="timed">Timed</option></select></label>
      <button disabled={busy}>{busy?'Saving…':'Add event'}</button>
    </form>
  </div>;
}
