import { useState } from 'react';
import { eventTitle,eventTypeNames,sections,type DayEvent,type DayRead } from '../../shared/day.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';
import { api } from '../api.js';
import { useToast } from '../races/Toast.js';
import { Callout,DockedFooter,ErrorCallout,Icon,Sheet } from '../races/parts.js';
import { LeadHeader } from './LeadHeader.js';
import { PullToRefresh } from '../races/PullToRefresh.js';
import { UpdatedAt } from '../races/UpdatedAt.js';
import type { View } from '../shell/addresses.js';

type EventsView=Extract<View,{kind:'events'|'rename-event'|'new-event'}>;
const formats={heats:'Heats then final',timed:'Timed'} as const;
/** One save from an Events screen: the server call, then `saved` (a sheet closes here, so the toast shows in its final place), the toast and a fresh day read; a refusal comes back to show. */
function useSave(onSaved:()=>Promise<void>) {
  const toast=useToast();
  const [busy,setBusy]=useState(false);
  async function save(path:string,body:unknown,line:ToastSave,saved?:()=>void) {
    setBusy(true);
    try {await api(path,body);saved?.();toast({message:toastLine(line)});await onSaved();return null;}
    catch(error) {return error;}
    finally {setBusy(false);}
  }
  return {busy,save};
}

/**
 * Events (from Day setup) and the two screens it opens: Rename and Add an event. Events is a row per event; a tap opens
 * the event's sheet with Rename and Switch off / on. Switch saves at once and closes the sheet; a refused save shows in
 * the sheet. There is no event list to confirm.
 */
export function Events({view,day,updated,error,onRefresh,onOpen,onBack,onSaved}:{view:EventsView;day:DayRead|null;updated:string;error:unknown;
  onRefresh:()=>Promise<void>;onOpen:(view:View)=>void;onBack:()=>void;onSaved:()=>Promise<void>}) {
  if(view.kind==='rename-event') return <Rename code={view.code} day={day} error={error} onRefresh={onRefresh} onBack={onBack} onSaved={onSaved}/>;
  if(view.kind==='new-event') return <AddEvent onBack={onBack} onSaved={onSaved}/>;
  return <EventList day={day} updated={updated} error={error} onRefresh={onRefresh} onOpen={onOpen} onSaved={onSaved}/>;
}

function EventList({day,updated,error,onRefresh,onOpen,onSaved}:{day:DayRead|null;updated:string;error:unknown;onRefresh:()=>Promise<void>;onOpen:(view:View)=>void;onSaved:()=>Promise<void>}) {
  const {busy,save}=useSave(onSaved);
  const [openId,setOpenId]=useState<DayEvent['id']|null>(null);
  const [refused,setRefused]=useState<unknown>(null);
  const open=day?.events.find(event=>event.id===openId);
  async function toggle(event:DayEvent) {
    setRefused(null);
    const failure=await save(`day/events/${encodeURIComponent(event.code)}/enabled`,{enabled:!event.enabled},{kind:'switched',code:event.code,on:!event.enabled},()=>setOpenId(null));
    if(failure) setRefused(failure);
  }
  return <LeadHeader title="Events" up="Day setup" body={<><main className="rz-main">
    {error!==null && <ErrorCallout error={error} action="read"/>}
    {day && <ul className="rz-list" aria-label="Events">{day.events.map(event=><li key={event.id}>
      <button type="button" className="rz-listrow" onClick={()=>{setRefused(null);setOpenId(event.id);}}>
        <span className="rz-listrow__main"><span className="rz-listrow__label">{eventTitle(event)}</span>
          <span className="rz-listrow__meta">{event.code} · {eventTypeNames[event.type]} · {formats[event.format]}{!event.enabled && ' · Switched off'}</span></span>
        <Icon name="chevron-right" className="rz-icon--bold"/></button>
    </li>)}</ul>}
    <button type="button" className="rz-btn rz-btn--block" onClick={()=>onOpen({kind:'new-event'})}><Icon name="plus"/>Add an event</button>
  </main><footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void onRefresh()}/></footer>
  {open && <Sheet title={eventTitle(open)} onClose={()=>setOpenId(null)}>
    {refused!==null && <ErrorCallout error={refused} action="save"/>}
    <div className="rz-sheet__actions">
      <button type="button" className="rz-btn rz-btn--block" onClick={()=>onOpen({kind:'rename-event',code:open.code})}>Rename</button>
      <button type="button" className="rz-btn rz-btn--block" disabled={busy} onClick={()=>void toggle(open)}>{open.enabled?'Switch off':'Switch on'}</button>
    </div>
  </Sheet>}
  </>}/>;
}

/** Rename: the event's new name, saved by the docked button; Races, Results and the Day export show it. */
function Rename({code,day,error,onRefresh,onBack,onSaved}:{code:string;day:DayRead|null;error:unknown;onRefresh:()=>Promise<void>;onBack:()=>void;onSaved:()=>Promise<void>}) {
  const {busy,save}=useSave(onSaved);
  const event=day?.events.find(item=>item.code===code);
  const [typed,setTyped]=useState<string|null>(null);
  const [refused,setRefused]=useState<unknown>(null);
  const name=typed??event?.name??'',reason=!name.trim() || name.trim()===event?.name?'Change the name to save.':null;
  async function submit() {
    if(reason || busy) return;
    setRefused(null);
    const failure=await save(`day/events/${encodeURIComponent(code)}/rename`,{name},{kind:'renamed',code});
    if(failure) setRefused(failure);else onBack();
  }
  return <LeadHeader title={`Rename ${code}`} up="Events" body={<><PullToRefresh onRefresh={()=>void onRefresh()}/><main className="rz-main rz-main--form">
    {error!==null && <ErrorCallout error={error} action="read"/>}
    {day && !event && <Callout status message={`There is no event ${code} today.`}/>}
    {event && <>
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{event.name} · {event.section}</p>
        <h2 className="rz-prompt__q">New name for <em>{code}?</em></h2><p className="rz-prompt__help">Races, Results and the Day export show the new name.</p></div>
      <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="event-name">Event name</label>
        <input className="rz-field__input" id="event-name" value={name} maxLength={100} autoComplete="off" onChange={change=>setTyped(change.target.value)}/></div>
      {refused!==null && <ErrorCallout error={refused} action="save"/>}
    </>}
  </main>
  {event && <DockedFooter>{reason && <p className="rz-footer__reason">{reason}</p>}
    <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={reason || busy?true:undefined} onClick={()=>void submit()}>Save name</button></DockedFooter>}
  </>}/>;
}

const types=[['races','Races'],['hurdles','Hurdles']] as const;
/** What the docked Add event still needs, in the order the fields come. */
function missing(details:{code:string;name:string;section:string;type:string;format:string}) {
  if(!details.code.trim()) return 'Type the event code first.';
  if(!details.name.trim()) return 'Type the event name first.';
  if(!details.section) return 'Choose the section first.';
  if(!details.type) return 'Choose Races or Hurdles first.';
  if(!details.format) return 'Choose the format first.';
  return null;
}
/** Add an event: code, name, section, Races or Hurdles and format, added by the docked button. A lead never adds a relay. */
function AddEvent({onBack,onSaved}:{onBack:()=>void;onSaved:()=>Promise<void>}) {
  const {busy,save}=useSave(onSaved);
  const [details,setDetails]=useState({code:'',name:'',section:'',type:'',format:''});
  const [refused,setRefused]=useState<unknown>(null);
  const set=(field:keyof typeof details)=>(value:string)=>setDetails(current=>({...current,[field]:value}));
  const reason=missing(details);
  async function submit() {
    if(reason || busy) return;
    setRefused(null);
    const failure=await save('day/events',details,{kind:'event-added',code:details.code.trim().toUpperCase()});
    if(failure) setRefused(failure);else onBack();
  }
  const choices=(label:string,value:string,options:ReadonlyArray<readonly [string,string]>,onChoose:(value:string)=>void,grid=false)=>
    <fieldset><legend className="rz-field__label">{label}</legend><div className={grid?'rz-choices rz-choices--grid':'rz-choices'}>
      {options.map(([option,text])=><button key={option} type="button" className="rz-choice" aria-pressed={option===value} onClick={()=>onChoose(option)}>{text}</button>)}
    </div></fieldset>;
  return <LeadHeader title="Add an event" up="Events" body={<><main className="rz-main rz-main--form">
    <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="new-event-code">Event code</label>
      <input className="rz-field__input" id="new-event-code" value={details.code} maxLength={12} autoComplete="off" autoCapitalize="characters" onChange={change=>set('code')(change.target.value)}/></div>
    <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor="new-event-name">Event name</label>
      <input className="rz-field__input" id="new-event-name" value={details.name} maxLength={100} autoComplete="off" onChange={change=>set('name')(change.target.value)}/></div>
    {choices('Section',details.section,sections.map(section=>[section,section] as const),set('section'),true)}
    {choices('Races or Hurdles',details.type,types,set('type'))}
    {choices('Format',details.format,Object.entries(formats),set('format'))}
    {refused!==null && <ErrorCallout error={refused} action="save"/>}
  </main>
  <DockedFooter>{reason && <p className="rz-footer__reason">{reason}</p>}
    <button type="button" className="rz-btn rz-btn--primary rz-btn--block" aria-disabled={reason || busy?true:undefined} onClick={()=>void submit()}>Add event</button></DockedFooter>
  </>}/>;
}
