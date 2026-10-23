import { raceRecording } from '../../shared/recording.js';
import type { LeadRaceRead } from '../../shared/lead-results.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import type { WristbandWarning } from '../../shared/wristband-checks.js';
import { useEffect,useRef,useState } from 'react';
import { ActionSheet } from './ActionSheet.js';
import { RaceTeamsEditor } from './RaceTeams.js';
import { api } from '../api.js';
import { entryName,entryNumber,raceLabel,replacedByRerun,runnersOf } from '../../shared/races.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { digitsForTime,parseTimeDigits,formatTime,formatTimeDigits,timesOutOfOrder } from '../../shared/time-entry.js';
import { ordinal } from '../../shared/ordinal.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { SortableList } from '../flow/SortableList.js';
import { WrongTimeIcon,WrongTimeReason,wrongTimesByPlace } from '../flow/WrongTime.js';
import './race-page.css';
export interface RaceActionsProps {race:LeadRaceRead['race'];relay?:Pick<LeadRaceRead,'teams'|'relays'>;onSaved:(next:EventResultsRead)=>void;onRefresh:()=>void|Promise<void>;onRemoved:()=>void}
export function RaceActions({race,relay,onSaved,onRefresh,onRemoved}:RaceActionsProps) {
  const [action,setAction]=useState<'times'|'order'|'runners'|'teams'|'delete'|'re-run'|'restore'|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  /** `stay` keeps the sheet open for corrections that save each change at once. */
  async function command(command:string,body:unknown,removed=false,stay=false) {
    if(busy) return;setBusy(true);setError('');
    try {onSaved(await api<EventResultsRead>(`lead/races/${race.id}/${command}`,body));if(removed) {setAction(null);onRemoved();} else {await onRefresh();if(!stay) setAction(null);}}
    catch(error) {setError(error instanceof Error?error.message:'Not saved - try again');}
    finally {setBusy(false);}
  }
  function open(next:typeof action) {setAction(next);setError('');}
  const replaced=replacedByRerun(race);
  return <div className="race-action-choices">{race.parts.times.value?.acceptedByLead && <p className="calm-note">Out-of-order times accepted by a lead</p>}{race.deleted?<>{replaced?<p>{raceLabel(race)} · {replaced}</p>:<><p>Deleted race</p><button onClick={()=>open('restore')}>Restore race</button></>}<button className="button-secondary" onClick={()=>open('delete')}>Delete permanently</button></>:race.state!=='saved'?<><p className="calm-note">In progress - open the race screen</p><button className="button-secondary" onClick={()=>open('delete')}>Delete race</button></>:<>{race.kind!=='final' && <button className="button-secondary" onClick={()=>open('times')}>Correct times</button>}{race.parts.finish.value && <button className="button-secondary" onClick={()=>open('order')}>Correct finishing order</button>}{race.event.relay?<button className="button-secondary" onClick={()=>open('teams')}>Correct teams</button>:<button className="button-secondary" onClick={()=>open('runners')}>Correct runner list</button>}<button className="button-secondary" onClick={()=>open('re-run')}>Re-run race</button><button className="button-secondary" onClick={()=>open('delete')}>Delete race</button></>}
    {action && <ActionSheet title={`${action==='times'?'Correct times':action==='order'?'Correct finishing order':action==='runners'?'Correct runner list':action==='teams'?'Correct teams':action==='restore'?'Restore race':action==='re-run'?'Re-run race':'Delete race'} · ${raceLabel(race)}`} busy={busy} onClose={()=>setAction(null)}><h3>{raceLabel(race)}</h3>{error && <p role="alert">{error}</p>}
      {action==='times'?<RaceTimesEditor race={race} busy={busy} onSave={body=>void command('times',body)} onClose={()=>setAction(null)}/>:action==='order'?<RaceOrderEditor race={race} busy={busy} onSave={body=>command('finish-order',body,false,true)} onClose={()=>setAction(null)}/>:action==='teams'?<RaceTeamsEditor race={race} teams={relay?.teams||[]} relays={relay?.relays||[]} busy={busy} onSave={body=>command('teams',body,false,true)} onClose={()=>setAction(null)}/>:action==='runners'?<RaceRunnersEditor race={race} busy={busy} onSave={body=>void command('runners',body)} onClose={()=>setAction(null)}/>:<RaceLifecycle action={action} race={race} busy={busy} onSave={(body,permanent)=>void command(action==='delete'?'delete':action,body,!!permanent)} onClose={()=>setAction(null)}/>}
    </ActionSheet>}
  </div>;
}
function RaceLifecycle({action,race,busy,onSave,onClose}:{action:'delete'|'restore'|'re-run';race:LeadRaceRead['race'];busy:boolean;onSave:(body:unknown,permanent?:boolean)=>void;onClose:()=>void}) {
  const [comment,setComment]=useState('');
  return <div className="sheet-stack">{action==='re-run'?<p>Call a re-run as a last resort. This record moves to Deleted races; a new {race.kind==='heat'?'heat':race.kind==='final'?'final':'race'} becomes the event's current race on the race screen, with the same runners checked in.</p>:action==='restore'?<p>Restore {raceLabel(race)} and include its record in this event again?</p>:<p>{race.deleted?'Delete this record permanently?':'Move this race to Deleted races, or delete it permanently?'} Permanent deletion cannot be undone. Audit notes remain.</p>}
    <label>Comment (optional)<textarea maxLength={1000} disabled={busy} value={comment} onChange={event=>setComment(event.target.value)}/></label>
    {action==='delete'?<>{!race.deleted && <button disabled={busy} onClick={()=>onSave({permanent:false,comment})}>Move to Deleted races</button>}<button disabled={busy} onClick={()=>onSave({permanent:true,comment},true)}>Confirm permanent deletion</button></>:<button disabled={busy} onClick={()=>onSave({comment})}>{action==='re-run'?'Confirm re-run':'Confirm restore'}</button>}
    <button className="button-secondary" disabled={busy} onClick={onClose}>Keep current record</button>
  </div>;
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
 * Times screens); tapping one retypes it on the phone's own number pad. No finisher and the explicit
 * acceptance of out-of-order times are v1's.
 */
function RaceTimesEditor({race,busy,onSave,onClose}:{race:LeadRaceRead['race'];busy:boolean;onSave:(body:unknown)=>void;onClose:()=>void}) {
  const [baseVersion]=useState(race.parts.times.version);
  const [digits,setDigits]=useState<Array<string|null>>(()=>Array.from({length:Math.max(race.parts.runners.value?.length||0,race.parts.times.value?.places.length||0)},(_,index)=>{const time=race.parts.times.value?.places[index];return time===null?null:time===undefined?'':digitsForTime(time);}));
  const [editing,setEditing]=useState<number|null>(null);
  const rows=useInSight(editing);
  const [accepted,setAccepted]=useState(false),[comment,setComment]=useState('');
  const places=digits.map(value=>value===null?null:parseTimeDigits(value)),outOfOrder=timesOutOfOrder(places),invalid=digits.some(value=>value!==null && parseTimeDigits(value)===null);
  const mismatch=raceRecording({...race,parts:{...race.parts,times:invalid?race.parts.times:{version:baseVersion,value:{places,outOfOrder}}}}).countMismatch;
  const wrong=wrongTimesByPlace(places);
  /** Times left beyond the runners (say, after a runner was removed) must be cleared with No finisher; only the runners' places are saved. */
  const runnerCount=race.parts.runners.value?.length||0,leftover=places.slice(runnerCount).some(time=>time!==null);
  function change(index:number,value:string|null) {setAccepted(false);setDigits(previous=>previous.map((old,at)=>at===index?value:old));}
  /** Done on one place moves on to the next place still needing a time, as typing times in order would. */
  function done(index:number) {const next=digits.findIndex((value,at)=>at>index && value==='');setEditing(next>=0?next:null);}
  function noFinisher(index:number,checked:boolean) {
    setAccepted(false);setDigits(previous=>previous.map((old,at)=>checked && at>=index?null:at===index?'':old));
    if(checked && editing!==null && editing>=index) setEditing(null);
  }
  const rowLabel=(index:number,value:string)=>`${ordinal(index+1)} place · ${value?formatTimeDigits(value):'Time needed'}${wrong.get(index)?` · ${wrong.get(index)!.reason}`:''}`;
  return <form className="sheet-stack" onSubmit={event=>{event.preventDefault();onSave({baseVersion,places:places.slice(0,runnerCount),acceptOutOfOrder:accepted,comment});}}>
    {mismatch && <p className="count-mismatch" role="alert">{mismatch}</p>}
    {leftover && <p className="sheet-hint">This race has {runnerCount} {race.event.relay?(runnerCount===1?'team':'teams'):runnerCount===1?'runner':'runners'}. Choose No finisher for every place after {ordinal(runnerCount)} to save.</p>}
    <p className="sheet-hint">Read times in place order from the SprintTimer recording. Tap a place to retype its time.</p>
    <ol ref={rows} className="time-rows" aria-label="Times">{digits.map((value,index)=><li key={index} className="lead-time-place">
      {value!==null && editing===index?<div className="lead-editing">
        <NumberEntry label={`${ordinal(index+1)} place time`} placeholder="Digits only, e.g. 1234" value={value} busy={busy} nextLabel="Done" selectKey={index}
          onChange={digits=>change(index,digits)} onNext={()=>done(index)} display={<p className="time-shows">Shows as <strong>{formatTimeDigits(value)}</strong></p>}/>
      </div>:value===null?<div className="time-row time-row-none"><span className="time-place">{ordinal(index+1)}</span><span className="time-value">No finisher</span></div>
      :<button type="button" disabled={busy} className={wrong.get(index)?'time-row time-wrong':'time-row'} aria-label={rowLabel(index,value)} onClick={()=>setEditing(index)}>
        <span className="time-place">{ordinal(index+1)}</span><span className="time-value"><strong>{value?formatTimeDigits(value):'Time needed'}</strong><WrongTimeReason wrong={wrong.get(index)}/></span>
        {wrong.get(index) && <WrongTimeIcon/>}{pencil}
      </button>}
      <label className="lead-checkbox"><input type="checkbox" checked={value===null} disabled={busy || digits.slice(0,index).includes(null)} onChange={event=>noFinisher(index,event.target.checked)}/>No finisher</label>
    </li>)}</ol>
    {outOfOrder && <div className="warning-box"><p>Times are out of order. Check the recording or explicitly accept this set as the lead.</p><label className="lead-checkbox"><input type="checkbox" checked={accepted} disabled={busy} onChange={event=>setAccepted(event.target.checked)}/>Accept these out-of-order times</label></div>}
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
    <p className="sheet-hint">Drag a {relay?'team':'wristband'} to its place: times stay by place. Each change saves at once.</p>
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
/**
 * The lead's runner list correction: tapping a runner retypes their number on the phone's own number pad
 * (they keep their place and time); Add runner and Review runner list stay on screen however long the list.
 */
function RaceRunnersEditor({race,busy,onSave,onClose}:{race:LeadRaceRead['race'];busy:boolean;onSave:(body:unknown)=>void;onClose:()=>void}) {
  const [original]=useState(race);
  const [entries,setEntries]=useState(()=>(runnersOf(race.parts.runners.value).map(runner=>({entryId:runner.id as string|undefined,number:String(runner.wristband)}))));
  const [editing,setEditing]=useState<number|null>(null);
  const rows=useInSight(editing);
  const [step,setStep]=useState<'input'|'warnings'|'review'>('input');
  const region=useRef<HTMLDivElement>(null);
  const opened=useRef(false);
  // A new step puts focus on its first control (the sheet itself focuses the first one on opening).
  useEffect(()=>{if(opened.current) region.current?.querySelector<HTMLElement>('input,button,textarea')?.focus();opened.current=true;},[step]);
  const [warnings,setWarnings]=useState<Array<{number:number;message:string}>>([]);
  const [checking,setChecking]=useState(false),[error,setError]=useState(''),[kept,setKept]=useState<number[]>([]);
  const [newDidNotFinish,setNewDidNotFinish]=useState(false),[comment,setComment]=useState('');
  const additions=entries.some(entry=>!entry.entryId);
  async function check(event:React.FormEvent) {
    event.preventDefault();setError('');
    const blank=entries.findIndex(entry=>entry.number==='');
    if(blank>=0) {setEditing(blank);setError(`Type a wristband number for runner ${blank+1}, or remove that runner`);return;}
    setEditing(null);const numbers=entries.map(entry=>Number(entry.number));
    const refusal=runnerListRefusal(numbers);if(refusal && numbers.length) {setError(refusal);return;}
    setChecking(true);
    try {
      const warnings:Array<{number:number;message:string}>=[];
      for(const entry of entries) {
        const number=Number(entry.number),old=runnersOf(original.parts.runners.value).find(runner=>runner.id===entry.entryId);
        if(old?.wristband===number) continue;
        const data=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:original.event.code,wristband:number,raceId:original.id});
        for(const warning of data.warnings.filter(warning=>original.kind!=='final'||warning.kind!=='already-ran')) warnings.push({number,message:warning.message});
      }
      setWarnings(warnings);setKept([]);setStep(warnings.length?'warnings':'review');
    } catch(error) {setError(error instanceof Error?error.message:'Could not check the runners');}
    finally {setChecking(false);}
  }
  function save() {
    const runners=entries.map(entry=>({...(entry.entryId?{entryId:entry.entryId}:{}),wristband:Number(entry.number)}));
    let finish:undefined|{order:number[];didNotFinish:number[]};
    if(additions && newDidNotFinish && original.parts.finish.value) {
      const numberFor=(id:string)=>runners.find(runner=>runner.entryId===id)?.wristband;
      finish={order:original.parts.finish.value.order.map(numberFor).filter((number):number is number=>number!==undefined),didNotFinish:[...original.parts.finish.value.didNotFinish.map(numberFor).filter((number):number is number=>number!==undefined),...runners.filter(runner=>!runner.entryId).map(runner=>runner.wristband)]};
    }
    onSave({baseVersion:original.parts.runners.version,finishVersion:original.parts.finish.version,runners,keptWarnings:kept,comment,...(finish?{finish}:{})});
  }
  function add() {setError('');setEntries(previous=>[...previous,{entryId:undefined,number:''}]);setEditing(entries.length);}
  function remove(index:number) {setError('');setEditing(null);setEntries(previous=>previous.filter((_old,at)=>at!==index));}
  const disabled=busy || checking;
  return <div ref={region} className="sheet-stack">{error && <p role="alert">{error}</p>}{step==='input'?<form className="sheet-stack" onSubmit={event=>void check(event)}>
    <p className="sheet-hint">Tap a runner to change their number: they keep their place and time. Remove or add a runner only when the runners themselves changed.</p>
    <ol ref={rows} className="lead-runner-rows" aria-label="Runners">{entries.map((entry,index)=><li key={entry.entryId||`new-${index}`}>{editing===index?<div className="lead-editing">
      <NumberEntry label={`Wristband for runner ${index+1}`} placeholder="e.g. 2045" value={entry.number} busy={disabled} nextLabel="Done" selectKey={index}
        onChange={digits=>setEntries(previous=>previous.map((old,at)=>at===index?{...old,number:digits}:old))} onNext={()=>setEditing(null)}/>
    </div>:<>
      <button type="button" disabled={disabled} className="lead-runner-row" aria-label={`Runner ${index+1} · ${entry.number||'Number needed'}`} onClick={()=>setEditing(index)}>
        <span className="row-label">Runner {index+1}</span><strong>{entry.number||'Number needed'}</strong>{pencil}</button>
      <button type="button" disabled={disabled} className="lead-remove" aria-label={`Remove runner ${index+1}`} onClick={()=>remove(index)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </>}</li>)}</ol>
    {entries.length===0 && <p className="sheet-hint">No runners</p>}
    <div className="sheet-actions"><button type="button" className="button-secondary" disabled={disabled} onClick={add}>Add runner</button><button disabled={disabled}>{checking?'Checking…':'Review runner list'}</button></div>
    </form>:step==='warnings'?<div className="warning-box">{warnings.map((warning,index)=><p key={index}>{warning.message}</p>)}<div className="warning-actions"><button disabled={busy} onClick={()=>setStep('input')}>Fix runners</button><button className="button-secondary" disabled={busy} onClick={()=>{setKept([...new Set(warnings.map(warning=>warning.number))]);setStep('review');}}>Keep warnings</button></div></div>:<><h4>{entries.length} runners. Is that right?</h4><p>{entries.map(entry=>entry.number).join(' · ')||'No runners'}</p>{warnings.map((warning,index)=><p className="warning-box" key={index}>{warning.message} · Warning kept</p>)}{additions && original.parts.finish.value && <><p>Finish order must be recorded again for new runners, unless they did not finish.</p><label className="lead-checkbox"><input type="checkbox" checked={newDidNotFinish} disabled={busy} onChange={event=>setNewDidNotFinish(event.target.checked)}/>New runners did not finish</label></>}
      <label>Comment (optional)<textarea disabled={busy} maxLength={1000} value={comment} onChange={event=>setComment(event.target.value)}/></label><button disabled={busy} onClick={save}>{busy?'Saving…':'Save runner list'}</button><button className="button-secondary" disabled={busy} onClick={()=>setStep('input')}>Change runner list</button>
    </>}
    <button className="button-secondary" disabled={disabled} onClick={onClose}>Cancel correction</button></div>;
}
