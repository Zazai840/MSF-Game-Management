import { useId,useState,type FormEvent,type ReactNode } from 'react';
import { dayNumbers, regions, thisDayYears, type DayRead, type ThisDay as ThisDayRead } from '../../shared/day.js';
import { api,apiDownload,ApiFailure,phoneStorage,startNewDay } from '../api.js';
import { useToast } from '../races/Toast.js';
import { Callout,DockedFooter,ErrorCallout,failureLine,Icon,LeadBar,Sheet } from '../races/parts.js';
import type { View } from '../shell/addresses.js';
import { toastLine } from '../../shared/toast-lines.js';
import { clock } from '../../shared/clock.js';

/** When the day export was last downloaded, and whether anything changed after it. */
export function exportStatus(day:Pick<DayRead,'exportedAt'|'exportedRevision'|'revision'>) {
  if(!day.exportedAt) return 'Not downloaded yet.';
  return `Last downloaded ${clock(day.exportedAt)}, ${day.exportedRevision===day.revision?'includes every change so far':'with newer changes since'}.`;
}
/** A refused download or new day says the server's reason, which already says what to do; a request that did not get through says Could not connect. */
const refusal=(error:unknown)=>error instanceof ApiFailure && error.message?error.message:failureLine(error,'read');

/** A code a lead reads out, with the button that changes it. */
function CodeCard({label,code,text,children}:{label:string;code:string;text:string;children:ReactNode}) {
  const id=useId();
  return <section className="rz-codecard" aria-labelledby={id}>
    <h2 className="rz-codecard__label" id={id}>{label}</h2>
    <p className="rz-codecard__value">{code}</p>
    <p className="rz-codecard__text">{text}</p>
    {children}
  </section>;
}

/**
 * This day labels the day for the scoring team: Year, Region and Day, each a row of choices saved on tap with its
 * toast. Any lead can change it at any time; Region and Day start empty, and the day export waits for both.
 */
function ThisDay({day,onChanged,onSaved}:{day:ThisDayRead;onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const toast=useToast();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  async function save(field:keyof ThisDayRead,value:string|number) {
    if(busy || day[field]===value) return;
    setBusy(true);setError(null);
    try {
      await api('day/this-day',{[field]:value});
      const name=({year:'Year',region:'Region',dayNumber:'Day'} as const)[field];
      toast({message:toastLine({kind:'this-day',field:name,value:field==='dayNumber'?`Day ${value}`:String(value)})});onSaved();await onChanged();
    } catch(error) {setError(error);}
    finally {setBusy(false);}
  }
  const choices=(field:keyof ThisDayRead,legend:string,values:ReadonlyArray<string|number>)=><fieldset>
    <legend className="rz-field__label">{legend}</legend>
    <div className="rz-choices rz-choices--row">{values.map(value=><button key={value} type="button" className="rz-choice" aria-pressed={day[field]===value} onClick={()=>void save(field,value)}>{value}</button>)}</div>
  </fieldset>;
  const id=useId();
  return <section className="rz-codecard" aria-labelledby={id}>
    <h2 className="rz-codecard__label" id={id}>This day</h2>
    {choices('year','Year',thisDayYears(new Date()))}
    {choices('region','Region',regions)}
    {choices('dayNumber','Day',dayNumbers)}
    {error!==null && <ErrorCallout error={error} action="save"/>}
    <p className="rz-codecard__text">Goes on the Day export. Any lead can change it.</p>
  </section>;
}

/** Make a new lead code, asked first in a sheet: the red yes on the right, a plain Keep naming the code that stays. */
function LeadCode({code,onChanged,onSaved}:{code:string;onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const toast=useToast();
  const [asking,setAsking]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  const close=()=>{setAsking(false);setError(null);};
  async function make() {
    if(busy) return;
    setBusy(true);setError(null);
    try {
      const {leadCode}=await api<{leadCode:string}>('day/lead-code',{});
      setAsking(false);toast({message:toastLine({kind:'lead-code',code:leadCode})});onSaved();await onChanged();
    } catch(error) {setError(error);}
    finally {setBusy(false);}
  }
  return <CodeCard label="Lead code" code={code} text="Give this only to zone leads. Typed on Join or when changing job, it makes the phone a zone lead.">
    <button type="button" className="rz-btn rz-btn--small" onClick={()=>setAsking(true)}>Make a new lead code</button>
    {asking && <Sheet title="Make a new lead code?" onClose={close}>
      <p className="rz-sheet__text">Every other lead loses lead access until they type the new code.</p>
      {error!==null && <ErrorCallout error={error} action="save"/>}
      <div className="rz-sheet__pair">
        <button type="button" className="rz-btn" onClick={close}>Keep {code}</button>
        <button type="button" className="rz-btn rz-btn--danger" aria-disabled={busy || undefined} onClick={()=>void make()}>Make a new lead code</button>
      </div>
    </Sheet>}
  </CodeCard>;
}

/** The day export: when it was last downloaded, and the download with its toast naming the file. */
function DayExport({day,onChanged}:{day:DayRead;onChanged:()=>Promise<void>}) {
  const toast=useToast();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  async function download() {
    setBusy(true);setError(null);
    try {
      const {blob,filename}=await apiDownload('day/export');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      toast({message:toastLine({kind:'downloaded',file:filename})});await onChanged();
    } catch(error) {setError(error);}
    finally {setBusy(false);}
  }
  const id=useId();
  return <section className="rz-codecard" aria-labelledby={id}>
    <h2 className="rz-codecard__label" id={id}>Day export</h2>
    <p className="rz-codecard__text">Excel file of today's results for the scoring workbook. <span>{exportStatus(day)}</span></p>
    {error!==null && <Callout message={refusal(error)}/>}
    <button type="button" className="rz-btn rz-btn--primary rz-btn--block" disabled={busy} onClick={()=>void download()}>{busy?'Please wait…':'Download day export'}</button>
  </section>;
}

/** Start a new day, in its red-outlined card: typed NEW DAY first; the server still refuses it until the latest changes are in a day export. */
function NewDay() {
  const [typed,setTyped]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  async function start(event:FormEvent) {
    event.preventDefault();setBusy(true);setError(null);
    try {await startNewDay(typed);}
    catch(error) {setError(error);}
    finally {setBusy(false);}
  }
  const id=useId();
  return <section className="rz-codecard rz-codecard--danger" aria-labelledby={id}>
    <h2 className="rz-codecard__label" id={id}>Start a new day</h2>
    <p className="rz-codecard__text">Clears today's races. Download the day export first.</p>
    <form className="rz-codecard__form" onSubmit={start}>
      <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor={`${id}-typed`}>Type NEW DAY to confirm</label>
        <input className="rz-field__input" id={`${id}-typed`} value={typed} onChange={event=>setTyped(event.target.value)} autoComplete="off" autoCapitalize="characters"/></div>
      {error!==null && <Callout message={refusal(error)}/>}
      <button className="rz-btn rz-btn--danger rz-btn--block" disabled={busy || typed!=='NEW DAY'}>Start a new day</button>
    </form>
  </section>;
}

/**
 * Day setup's cards, in the spec's order: This day, the Olympics password, the lead code, rows
 * opening Signed in today and Events, the day export and Start a new day.
 */
export function Day({day,phones,onOpen,onChanged,onSaved}:{day:DayRead;phones:number|null;onOpen:(view:View)=>void;onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const events=day.events.length;
  const rows:Array<{label:string;meta:string|null;view:View}>=[
    {label:'Signed in today',meta:phones===null?null:`${phones} ${phones===1?'person':'people'} signed in today`,view:{kind:'signed-in-today'}},
    {label:'Events',meta:`${events} ${events===1?'event':'events'}`,view:{kind:'events'}}
  ];
  return <>
    <ThisDay day={day} onChanged={onChanged} onSaved={onSaved}/>
    <CodeCard label="Olympics password" code={day.olympicsPassword} text="Volunteers type this once on their phone. It stays the same when a new day starts.">
      <button type="button" className="rz-btn rz-btn--small" onClick={()=>onOpen({kind:'olympics-password'})}>Change Olympics password</button>
    </CodeCard>
    <LeadCode code={day.leadCode} onChanged={onChanged} onSaved={onSaved}/>
    <ul className="rz-list">{rows.map(row=><li key={row.label}><button type="button" className="rz-listrow" onClick={()=>onOpen(row.view)}>
      <span className="rz-listrow__main"><span className="rz-listrow__label">{row.label}</span>{row.meta && <span className="rz-listrow__meta">{row.meta}</span>}</span>
      <Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>
    <DayExport day={day} onChanged={onChanged}/>
    <NewDay/>
  </>;
}

/**
 * Change Olympics password: one race-flow screen, with no second question. The help line says what saving does, and
 * after saving this phone goes back to Join too, so there is no toast.
 */
export function ChangePassword() {
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  const id=useId(),reason=password?'':'Type the new password first.';
  async function change() {
    if(reason || busy) return;
    setBusy(true);setError(null);
    // The change ends this phone's session too, so it signs out as the server's password-changed reason would.
    try {await api('day/olympics-password',{password});phoneStorage.signOut();}
    catch(error) {setError(error);setBusy(false);}
  }
  return <LeadBar title="Change Olympics password" up="Day setup" body={<>
    <main className="rz-main rz-main--form">
      <div className="rz-prompt rz-prompt--compact"><h2 className="rz-prompt__q">New <em>Olympics password?</em></h2>
        <p className="rz-prompt__help">Every phone, including yours, goes back to Join.</p></div>
      <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor={id}>New password</label>
        <input className="rz-field__input" id={id} value={password} onChange={event=>setPassword(event.target.value)} onKeyDown={event=>{if(event.key==='Enter') void change();}}
          autoComplete="off" autoCapitalize="none" spellCheck={false}/></div>
      {error!==null && <ErrorCallout error={error} action="save"/>}
    </main>
    <DockedFooter>{reason && <p className="rz-footer__reason">{reason}</p>}
      <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={reason || busy?true:undefined} onClick={()=>void change()}>Change password</button></DockedFooter>
  </>}/>;
}
