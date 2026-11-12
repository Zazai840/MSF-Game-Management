import { useId,useState,type FormEvent } from 'react';
import { dayNumbers, regions, thisDayYears, type DayRead, type ThisDay as ThisDayRead } from '../../shared/day.js';
import { api,apiDownload,phoneStorage,startNewDay } from '../api.js';
import { useToast } from '../races/Toast.js';
import { DockedFooter,ErrorCallout,Icon,Sheet } from '../races/parts.js';
import { LeadBar } from './LeadBar.js';
import type { View } from '../shell/addresses.js';
import { toastLine } from '../../shared/toast-lines.js';
import { clock } from '../../shared/clock.js';

/** When the day export was last downloaded, and whether anything changed after it. */
export function exportStatus(day:Pick<DayRead,'exportedAt'|'exportedRevision'|'revision'>) {
  if(!day.exportedAt) return 'Not downloaded yet.';
  return `Last downloaded ${clock(day.exportedAt)}, ${day.exportedRevision===day.revision?'includes every change so far':'with newer changes since'}.`;
}

/** A code a lead reads out, one of the two side by side in Day setup's card. */
function Code({label,code}:{label:string;code:string}) {
  const id=useId();
  return <section className="rz-codecard__code" aria-labelledby={id}>
    <h2 className="rz-codecard__label" id={id}>{label}</h2>
    <p className="rz-codecard__value">{code}</p>
  </section>;
}

/**
 * This day labels the day for the scoring team: Year, Region and Day, each a row of choices saved on tap with its
 * toast. Any lead can change it at any time; Region and Day start empty, and the day export waits for both.
 */
export function ThisDay({day,onChanged,onSaved}:{day:ThisDayRead;onChanged:()=>Promise<void>;onSaved:()=>void}) {
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

/** Make a new lead code, asked first in a sheet from its row: the red yes on the right, a plain Keep naming the code that stays. */
function NewLeadCode({code,onClose,onChanged,onSaved}:{code:string;onClose:()=>void;onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const toast=useToast();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<unknown>(null);
  async function make() {
    if(busy) return;
    setBusy(true);setError(null);
    try {
      const {leadCode}=await api<{leadCode:string}>('day/lead-code',{});
      onClose();toast({message:toastLine({kind:'lead-code',code:leadCode})});onSaved();await onChanged();
    } catch(error) {setError(error);}
    finally {setBusy(false);}
  }
  return <Sheet title="Make a new lead code?" onClose={onClose}>
    <p className="rz-sheet__text">Every other lead loses lead access until they type the new code.</p>
    {error!==null && <ErrorCallout error={error} action="save"/>}
    <div className="rz-sheet__pair">
      <button type="button" className="rz-btn" onClick={onClose}>Keep {code}</button>
      <button type="button" className="rz-btn rz-btn--danger" aria-disabled={busy || undefined} onClick={()=>void make()}>Make a new lead code</button>
    </div>
  </Sheet>;
}

/** The day export: when it was last downloaded, and the download with its toast naming the file. */
export function DayExport({day,onChanged}:{day:DayRead;onChanged:()=>Promise<void>}) {
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
    {error!==null && <ErrorCallout error={error} action="read"/>}
    <button type="button" className="rz-btn rz-btn--primary rz-btn--block" disabled={busy} onClick={()=>void download()}>{busy?'Please wait…':'Download day export'}</button>
  </section>;
}

/** Start a new day, in its red-outlined card: typed NEW DAY first; the server still refuses it until the latest changes are in a day export. */
export function NewDay() {
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
      {error!==null && <ErrorCallout error={error} action="read"/>}
      <button className="rz-btn rz-btn--danger rz-btn--block" disabled={busy || typed!=='NEW DAY'}>Start a new day</button>
    </form>
  </section>;
}

/**
 * Day setup on one screen: both codes in one card, then seven rows in the order of the day. Each row opens its own
 * screen, but Make a new lead code, which asks in its sheet. A row in the warning style waits for the lead.
 */
export function Day({day,phones,onOpen,onChanged,onSaved}:{day:DayRead;phones:number|null;onOpen:(view:View)=>void;onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const [asking,setAsking]=useState(false);
  const events=day.events.length,labelled=day.region!==null && day.dayNumber!==null;
  const rows:Array<{label:string;meta?:string|null;warn?:boolean;view?:View}>=[
    {label:'This day',meta:labelled?`${day.year} · ${day.region} · Day ${day.dayNumber}`:'Choose the region and day',warn:!labelled,view:{kind:'this-day'}},
    {label:'Events',meta:`${events} ${events===1?'event':'events'}`,view:{kind:'events'}},
    {label:'Signed in today',meta:phones===null?null:`${phones} ${phones===1?'person':'people'} signed in today`,view:{kind:'signed-in-today'}},
    {label:'Change Olympics password',view:{kind:'olympics-password'}},
    {label:'Make a new lead code'},
    {label:'Day export',meta:exportStatus(day),warn:day.exportedAt!==null && day.exportedRevision!==day.revision,view:{kind:'day-export'}},
    {label:'Start a new day',view:{kind:'start-a-new-day'}}
  ];
  return <>
    <div className="rz-codecard">
      <div className="rz-codecard__codes"><Code label="Olympics password" code={day.olympicsPassword}/><Code label="Lead code" code={day.leadCode}/></div>
      <p className="rz-codecard__text">The Olympics password is for every volunteer. The lead code is only for zone leads.</p>
    </div>
    <ul className="rz-list">{rows.map(({label,meta,warn,view})=><li key={label}><button type="button" className={`rz-listrow${warn?' rz-listrow--warn':''}`} onClick={()=>view?onOpen(view):setAsking(true)}>
      <span className="rz-listrow__main"><span className="rz-listrow__label">{label}</span>{meta && <span className="rz-listrow__meta">{meta}</span>}</span>
      <Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>
    {asking && <NewLeadCode code={day.leadCode} onClose={()=>setAsking(false)} onChanged={onChanged} onSaved={onSaved}/>}
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
