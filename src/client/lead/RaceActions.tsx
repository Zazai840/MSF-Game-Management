import { raceRecording } from '../../shared/recording.js';
import type { EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionSheet } from './ActionSheet.js';
import { api } from '../api.js';
import { entryName,entryNumber,raceLabel,replacedByRerun } from '../../shared/races.js';
import { raceName } from '../../shared/race-flow.js';
import { digitsForTime,parseTimeDigits,formatTime,formatTimeDigits,timeBoxHint,timesOutOfOrder } from '../../shared/time-entry.js';
import { useTimeRefusal } from '../flow/useTimeRefusal.js';
// The race flow's amber callout; the older look has no race-flow tokens, so it brings its own .rz-screen.
import { Callout,Sheet } from '../races/parts.js';
import { ordinal } from '../../shared/ordinal.js';
import { entryCount,entryWord } from '../../shared/teams.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { SortableList } from '../flow/SortableList.js';
import { WrongTimeIcon,WrongTimeReason,wrongTimesByPlace } from '../flow/WrongTime.js';
import { useToast } from '../races/Toast.js';
import { toastLine } from '../../shared/toast-lines.js';
import type { RaceAction,View } from '../shell/addresses.js';
import './race-page.css';
type Correction='times'|'order';
/** A race not saved yet, in Race actions and on its race page: where its steps are finished. */
export const notSavedLine=(race:LeadRaceRead['race'],where:'page'|'screen')=>`${raceName(race)} is not saved yet. ${where==='page'?'Open it to finish its steps.':'Finish its steps on this screen first.'}`;
/**
 * Race actions, the one sheet "⋯" opens on a race page (`where="page"`) and on the race screen: the corrections, Re-run,
 * then a red Delete set apart; on a deleted race Restore and a red Delete for good; on a race not saved yet, where its
 * steps are finished and Delete. Re-run, Delete, Restore, Correct runner list and Correct teams open their screens;
 * Correct times and Correct finishing order open today's editor in the sheet's place. `onSaved` takes a correction's answer and re-reads the race, so an editor that saves each change
 * at once works on the latest versions.
 */
export function RaceActions({read,where,onOpen,onClose,onSaved,onRace}:{read:LeadRaceRead;where:'page'|'screen';onOpen:(view:View)=>void;onClose:()=>void;onSaved:(next:EventResultsRead)=>void|Promise<void>;onRace?:()=>void}) {
  const {race}=read,name=raceName(race);
  const [editing,setEditing]=useState<Correction|null>(null);
  if(editing) return <CorrectionEditor read={read} part={editing} onSaved={onSaved} onClose={onClose}/>;
  const screen=(action:RaceAction)=>onOpen({kind:'race-action',...(where==='page'?{code:race.event.code}:{}),raceId:race.id,action});
  const button=(label:string,onClick:()=>void,kind='')=><button type="button" className={`rz-btn rz-btn--block${kind}`} onClick={onClick}>{label}</button>;
  const remove=(label:string)=>button(label,()=>screen('delete'),' rz-btn--danger rz-sheet__apart');
  return <Sheet title={`${name} · actions`} onClose={onClose}>
    {race.state!=='saved' && !race.deleted && <p className="rz-sheet__text">{notSavedLine(race,where)}</p>}
    <div className="rz-sheet__actions">
      {race.deleted?<>{!replacedByRerun(race) && button(`Restore ${name}`,()=>screen('restore'),' rz-btn--primary')}{remove('Delete for good')}</>
        :race.state!=='saved'?<>{where==='page' && onRace && button(`Open ${name}`,onRace)}{remove(`Delete ${name}`)}</>
        :<>
          {race.kind!=='final' && button('Correct times',()=>setEditing('times'))}
          {race.parts.finish.value && button('Correct finishing order',()=>setEditing('order'))}
          {race.event.relay?button('Correct teams',()=>screen('correct-teams')):button('Correct runner list',()=>screen('correct-runner-list'))}
          {button('Re-run race',()=>screen('re-run'))}
          {remove(`Delete ${name}`)}
        </>}
    </div>
  </Sheet>;
}
const correctionTitles:Record<Correction,string>={times:'Correct times',order:'Correct finishing order'};
/**
 * Today's correction editor, in the older look until #279 makes each a screen: outside the race flow's screen
 * root, so its look stays. Correct finishing order saves each change at once and stays open.
 */
function CorrectionEditor({read,part,onSaved,onClose}:{read:LeadRaceRead;part:Correction;onSaved:(next:EventResultsRead)=>void|Promise<void>;onClose:()=>void}) {
  const {race}=read;
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const toast=useToast(),named={section:race.event.section,kind:race.kind,number:race.number};
  async function command(command:string,body:unknown,stay=false) {
    if(busy) return;setBusy(true);setError('');
    try {
      const answer=await api<EventResultsRead>(`lead/races/${race.id}/${command}`,body);
      toast({message:toastLine({kind:'corrected',part,race:named})});await onSaved(answer);
      if(!stay) onClose();
    }
    catch(error) {setError(error instanceof Error?error.message:'Not saved - try again');}
    finally {setBusy(false);}
  }
  return createPortal(<ActionSheet title={`${correctionTitles[part]} · ${raceLabel(race)}`} busy={busy} onClose={onClose}><h3>{raceLabel(race)}</h3>{error && <p role="alert">{error}</p>}
    {part==='times'?<RaceTimesEditor race={race} busy={busy} onSave={body=>void command('times',body)} onClose={onClose}/>
      :<RaceOrderEditor race={race} busy={busy} onSave={body=>command('finish-order',body,true)} onClose={onClose}/>}
  </ActionSheet>,document.body);
}
/**
 * Keeps the place or runner being retyped in sight inside the sheet (clear of its sticky buttons, see race-page.css),
 * also when the sheet shrinks as the number bar and the phone's keyboard open.
 */
function useInSight(editing:number|null) {
  const rows=useRef<HTMLOListElement>(null);
  useEffect(()=>{
    const block=rows.current?.querySelector('.lead-editing'),sheet=rows.current?.closest('[role=dialog]');
    if(editing===null || !block || !sheet) return;
    const observer=new ResizeObserver(()=>block.scrollIntoView({block:'nearest'}));
    observer.observe(sheet);return ()=>observer.disconnect();
  },[editing]);
  return rows;
}
const pencil=<svg className="time-edit" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>;
/**
 * The lead's times correction: each place is a row (a wrong time in amber with its reason, as on the
 * Times screens); tapping one retypes it on the phone's own number pad, and Done refuses a time no one can run under the
 * box, its digits selected so the next digit replaces them, as the Timer does. No finisher and the explicit
 * acceptance of out-of-order times are v1's.
 */
function RaceTimesEditor({race,busy,onSave,onClose}:{race:LeadRaceRead['race'];busy:boolean;onSave:(body:unknown)=>void;onClose:()=>void}) {
  const [baseVersion]=useState(race.parts.times.version);
  const [digits,setDigits]=useState<Array<string|null>>(()=>Array.from({length:Math.max(race.parts.runners.value?.length||0,race.parts.times.value?.places.length||0)},(_,index)=>{const time=race.parts.times.value?.places[index];return time===null?null:time===undefined?'':digitsForTime(time);}));
  const [editing,setEditingPlace]=useState<number|null>(null);
  const refusal=useTimeRefusal();
  const setEditing=(index:number|null)=>{setEditingPlace(index);refusal.clear();};
  const rows=useInSight(editing);
  const [accepted,setAccepted]=useState(false),[comment,setComment]=useState('');
  const places=digits.map(value=>value===null?null:parseTimeDigits(value)),outOfOrder=timesOutOfOrder(places),invalid=digits.some(value=>value!==null && parseTimeDigits(value)===null);
  const mismatch=raceRecording({...race,parts:{...race.parts,times:invalid?race.parts.times:{version:baseVersion,value:{places,outOfOrder}}}}).countMismatch;
  const wrong=wrongTimesByPlace(places,race.event.name);
  /** Times left beyond the runners (say, after a runner was removed) must be cleared with No finisher; only the runners' places are saved. */
  const runnerCount=race.parts.runners.value?.length||0,leftover=places.slice(runnerCount).some(time=>time!==null);
  function change(index:number,value:string|null) {setAccepted(false);refusal.clear();setDigits(previous=>previous.map((old,at)=>at===index?value:old));}
  /** Done on one place moves on to the next place still needing a time, as typing times in order would. */
  function done(index:number) {
    if(refusal.check(digits[index]!,race.event.name)) return;
    const next=digits.findIndex((value,at)=>at>index && value==='');setEditing(next>=0?next:null);}
  function noFinisher(index:number,checked:boolean) {
    setAccepted(false);setDigits(previous=>previous.map((old,at)=>checked && at>=index?null:at===index?'':old));
    if(checked && editing!==null && editing>=index) setEditing(null);
  }
  const rowLabel=(index:number,value:string)=>`${ordinal(index+1)} place · ${value?formatTimeDigits(value):'Time needed'}${wrong.get(index)?` · ${wrong.get(index)!.reason}`:''}`;
  // noValidate: the time box shows "12.34", which its digits pattern (there for the number pad) would refuse.
  return <form className="sheet-stack" noValidate onSubmit={event=>{event.preventDefault();onSave({baseVersion,places:places.slice(0,runnerCount),acceptOutOfOrder:accepted,comment});}}>
    {mismatch && <p className="count-mismatch" role="alert">{mismatch}</p>}
    {leftover && <p className="sheet-hint">This race has {entryCount(runnerCount,!!race.event.relay)}. Choose No finisher for every place after {ordinal(runnerCount)} to save.</p>}
    <p className="sheet-hint">Read times in place order from the SprintTimer recording. Tap a place to retype its time.</p>
    <ol ref={rows} className="time-rows" aria-label="Times">{digits.map((value,index)=><li key={index} className="lead-time-place">
      {value!==null && editing===index?<div className="lead-editing">
        <NumberEntry label={`${ordinal(index+1)} place time`} value={value} busy={busy} nextLabel="Done" selectKey={`${index}:${refusal.count}`} time
          onChange={digits=>change(index,digits)} onNext={()=>done(index)} display={refusal.message?<div className="rz-screen time-refusal"><Callout message={refusal.message}/></div>:<p className="time-hint">{timeBoxHint}</p>}/>
      </div>:value===null?<div className="time-row time-row-none"><span className="time-place">{ordinal(index+1)}</span><span className="time-value">No finisher</span></div>
      :<button type="button" disabled={busy} className={wrong.get(index)?'time-row time-wrong':'time-row'} aria-label={rowLabel(index,value)} onClick={()=>setEditing(index)}>
        <span className="time-place">{ordinal(index+1)}</span><span className="time-value"><strong>{value?formatTimeDigits(value):'Time needed'}</strong><WrongTimeReason wrong={wrong.get(index)}/></span>
        {wrong.get(index) && <WrongTimeIcon/>}{pencil}
      </button>}
      <label className="lead-checkbox"><input type="checkbox" checked={value===null} disabled={busy || digits.slice(0,index).includes(null)} onChange={event=>noFinisher(index,event.target.checked)}/>No finisher</label>
    </li>)}</ol>
    {outOfOrder && !refusal.message && <div className="warning-box"><p>Times are out of order. Check the recording or explicitly accept this set as the lead.</p><label className="lead-checkbox"><input type="checkbox" checked={accepted} disabled={busy} onChange={event=>setAccepted(event.target.checked)}/>Accept these out-of-order times</label></div>}
    <label>Comment (optional)<textarea maxLength={1000} disabled={busy} value={comment} onChange={event=>setComment(event.target.value)}/></label>
    {invalid && <p className="sheet-hint">Enter a valid time for each place, or choose No finisher.</p>}<button disabled={busy || invalid || leftover}>{busy?'Saving…':'Save times'}</button><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>Cancel correction</button>
  </form>;
}
/**
 * The lead's finishing order correction on a saved race: dragging a wristband (on a relay, a team) moves it to another
 * place while times stay by place, and No place marks Did not finish or Didn't run. Each change saves at once.
 */
function RaceOrderEditor({race,busy,onSave,onClose}:{race:LeadRaceRead['race'];busy:boolean;onSave:(body:unknown)=>Promise<void>;onClose:()=>void}) {
  type Order={order:number[];didNotFinish:number[];didNotRun:number[]};
  // Entries go by the number the server takes: a child's wristband, or a team's number shown as "Team 3".
  const entries=race.parts.runners.value||[],relay=race.event.relay;
  const numberOf=(id:string)=>{const entry=entries.find(entry=>entry.id===id);return entry?entryNumber(entry):0;};
  const name=(number:number)=>{const entry=entries.find(entry=>entryNumber(entry)===number);return entry?entryName(entry):String(number);};
  const finish=race.parts.finish.value!,places=race.kind==='final'?null:race.parts.times.value?.places;
  // A change being saved shows at once; the race read after the save replaces it.
  const [saving,setSaving]=useState<Order|null>(null),[asking,setAsking]=useState<number|null>(null);
  const shown=saving||{order:finish.order.map(numberOf),didNotFinish:finish.didNotFinish.map(numberOf),didNotRun:[]};
  async function save(next:Order) {setAsking(null);setSaving(next);await onSave({baseVersion:race.parts.finish.version,runnersVersion:race.parts.runners.version,...next});setSaving(null);}
  const without=(list:number[],number:number)=>list.filter(other=>other!==number);
  const time=(place:number)=>{const value=places?.[place-1];return value===undefined?null:value===null?'No time':formatTime(value);};
  return <div className="sheet-stack lead-order">
    <p className="sheet-hint">Drag a {entryWord(!!relay)} to its place: times stay by place. Each change saves at once.</p>
    <SortableList label="Finishing order" items={shown.order} itemKey={number=>number} itemName={name} disabled={busy} onReorder={order=>void save({...shown,order})}
      renderItem={(number,place)=><><span className="lead-order-place"><span className="row-place">{ordinal(place)}</span>{places && <small>{time(place)}</small>}</span><span className="row-runner"><strong>{name(number)}</strong></span>
        <button type="button" className="button-small button-secondary lead-no-place" disabled={busy} aria-label={`No place for ${name(number)}`} onClick={()=>setAsking(number)}>No place</button></>}/>
    {asking!==null && <div className="lead-order-ask"><p><strong>{name(asking)} has no place. What happened?</strong></p>
      <div className="lead-order-choices"><button autoFocus disabled={busy} onClick={()=>void save({...shown,order:without(shown.order,asking),didNotFinish:[...shown.didNotFinish,asking]})}>Did not finish</button><button disabled={busy} onClick={()=>void save({...shown,order:without(shown.order,asking),didNotRun:[...shown.didNotRun,asking]})}>Didn't run</button></div>
      <p className="sheet-hint">Didn't run takes {name(asking)} off this race{relay?': it is still to run again':''}.</p><button className="button-secondary" disabled={busy} onClick={()=>setAsking(null)}>Keep {name(asking)}'s place</button></div>}
    {shown.didNotFinish.length+shown.didNotRun.length>0 && <ul className="lead-order-others" aria-label="No place">
      {shown.didNotFinish.map(number=><li key={number}><strong>{name(number)}</strong><span>Did not finish</span><button className="button-small button-secondary" disabled={busy} aria-label={`Give a place to ${name(number)}`} onClick={()=>void save({...shown,order:[...shown.order,number],didNotFinish:without(shown.didNotFinish,number)})}>Give a place</button></li>)}
      {shown.didNotRun.map(number=><li key={number}><strong>{name(number)}</strong><span>Didn't run · taken off this race</span></li>)}
    </ul>}
    <button className="button-secondary" disabled={busy} onClick={onClose}>Done</button>
  </div>;
}
