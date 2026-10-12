import { runnerListRefusal } from '../../shared/runner-list.js';
import type { WristbandWarning } from '../../shared/wristband-checks.js';
import { useEffect,useRef,useState } from 'react';
import { ActionSheet } from './ActionSheet.js';
import { api } from '../api.js';
import { raceLabel,type RaceRead } from '../../shared/races.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { digitsForTime,parseTimeDigits,formatTimeDigits,timesOutOfOrder } from '../../shared/time-entry.js';
export interface RaceActionsProps {race:RaceRead;onSaved:(next:EventResultsRead)=>void;onRefresh:()=>void;onRemoved:()=>void}
export function RaceActions({race,onSaved,onRefresh,onRemoved}:RaceActionsProps) {
  const [action,setAction]=useState<'times'|'runners'|'delete'|'re-run'|'restore'|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function command(command:string,body:unknown,removed=false) {
    if(busy) return;setBusy(true);setError('');
    try {onSaved(await api<EventResultsRead>(`lead/races/${race.id}/${command}`,body));setAction(null);if(removed) onRemoved();else onRefresh();}
    catch(error) {setError(error instanceof Error?error.message:'Not saved - try again');}
    finally {setBusy(false);}
  }
  function open(next:typeof action) {setAction(next);setError('');}
  return <div className="race-action-choices">{race.parts.times.value?.acceptedByLead && <p>Out-of-order times accepted by a lead</p>}{race.deleted?<><p>Deleted race{race.deleteReason==='re-run'?' · Re-run called':''}</p><button onClick={()=>open('restore')}>Restore race</button><button onClick={()=>open('delete')}>Delete permanently</button></>:<>{race.kind!=='final' && <button onClick={()=>open('times')}>Correct times</button>}<button onClick={()=>open('runners')}>Correct runner list</button><button onClick={()=>open('re-run')}>Re-run race</button><button onClick={()=>open('delete')}>Delete race</button></>}
    {action && <ActionSheet title={`${action==='times'?'Correct times':action==='runners'?'Correct runner list':action==='restore'?'Restore race':action==='re-run'?'Re-run race':'Delete race'} · ${raceLabel(race)}`} busy={busy} onClose={()=>setAction(null)}><h3>{raceLabel(race)}</h3>{error && <p role="alert">{error}</p>}
      {action==='times'?<RaceTimesEditor race={race} busy={busy} onSave={body=>void command('times',body)} onClose={()=>setAction(null)}/>:action==='runners'?<RaceRunnersEditor race={race} busy={busy} onSave={body=>void command('runners',body)} onClose={()=>setAction(null)}/>:<RaceLifecycle action={action} race={race} busy={busy} onSave={(body,permanent)=>void command(action==='delete'?'delete':action,body,!!permanent)} onClose={()=>setAction(null)}/>}
    </ActionSheet>}
  </div>;
}
function RaceLifecycle({action,race,busy,onSave,onClose}:{action:'delete'|'restore'|'re-run';race:RaceRead;busy:boolean;onSave:(body:unknown,permanent?:boolean)=>void;onClose:()=>void}) {
  const [comment,setComment]=useState('');
  return <div>{action==='re-run'?<p>Call a re-run as a last resort. This record moves to Deleted races; a new {race.kind==='heat'?'heat':race.kind==='final'?'final':'race'} appears at the start line with the same runners.</p>:action==='restore'?<p>Restore {raceLabel(race)} and include its record in this event again?</p>:<p>{race.deleted?'Delete this record permanently?':'Move this race to Deleted races, or delete it permanently?'} Permanent deletion cannot be undone. Audit notes remain.</p>}
    <label>Comment (optional)<textarea maxLength={1000} disabled={busy} value={comment} onChange={event=>setComment(event.target.value)}/></label>
    {action==='delete'?<>{!race.deleted && <button disabled={busy} onClick={()=>onSave({permanent:false,comment})}>Move to Deleted races</button>}<button disabled={busy} onClick={()=>onSave({permanent:true,comment},true)}>Confirm permanent deletion</button></>:<button disabled={busy} onClick={()=>onSave({comment})}>{action==='re-run'?'Confirm re-run':'Confirm restore'}</button>}
    <button className="secondary" disabled={busy} onClick={onClose}>Keep current record</button>
  </div>;
}
function RaceTimesEditor({race,busy,onSave,onClose}:{race:RaceRead;busy:boolean;onSave:(body:unknown)=>void;onClose:()=>void}) {
  const [baseVersion]=useState(race.parts.times.version);
  const [digits,setDigits]=useState<Array<string|null>>(()=>Array.from({length:race.parts.runners.value?.length||0},(_,index)=>{const time=race.parts.times.value?.places[index];return time===null?null:time===undefined?'':digitsForTime(time);}));
  const [accepted,setAccepted]=useState(false),[comment,setComment]=useState('');
  const places=digits.map(value=>value===null?null:parseTimeDigits(value)),outOfOrder=timesOutOfOrder(places),invalid=digits.some(value=>value!==null && parseTimeDigits(value)===null);
  function change(index:number,value:string|null) {setAccepted(false);setDigits(previous=>previous.map((old,at)=>at===index?value:old));}
  return <form onSubmit={event=>{event.preventDefault();onSave({baseVersion,places,acceptOutOfOrder:accepted,comment});}}>
    <p>Read times in place order from the SprintTimer recording. The last two digits are hundredths.</p>
    {digits.map((value,index)=><div className="lead-time-input" key={index}><label>Place {index+1}<input aria-label={`Time for place ${index+1}`} inputMode="numeric" pattern="[0-9]+" required={value!==null} value={value??''} disabled={busy || value===null} onChange={event=>change(index,event.target.value)}/></label><output>{value===null?'No finisher':formatTimeDigits(value)}</output><label className="lead-checkbox"><input type="checkbox" checked={value===null} disabled={busy || digits.slice(0,index).includes(null)} onChange={event=>{setAccepted(false);setDigits(previous=>previous.map((old,at)=>event.target.checked && at>=index?null:at===index?'':old));}}/>No finisher</label></div>)}
    {outOfOrder && <div className="runner-number-warning"><p>Times are out of order. Check the recording or explicitly accept this set as the lead.</p><label className="lead-checkbox"><input type="checkbox" checked={accepted} disabled={busy} onChange={event=>setAccepted(event.target.checked)}/>Accept these out-of-order times</label></div>}
    <label>Comment (optional)<textarea maxLength={1000} disabled={busy} value={comment} onChange={event=>setComment(event.target.value)}/></label>
    {invalid && <p>Enter a valid time for each place, or choose No finisher.</p>}<button disabled={busy || invalid}>{busy?'Saving…':'Save times'}</button><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel correction</button>
  </form>;
}
function RaceRunnersEditor({race,busy,onSave,onClose}:{race:RaceRead;busy:boolean;onSave:(body:unknown)=>void;onClose:()=>void}) {
  const [original]=useState(race);
  const [entries,setEntries]=useState(()=>((race.parts.runners.value||[]).map(runner=>({entryId:runner.id as string|undefined,number:String(runner.wristband)}))));
  const [step,setStep]=useState<'input'|'warnings'|'review'>('input');
  const region=useRef<HTMLDivElement>(null);
  useEffect(()=>{region.current?.querySelector<HTMLElement>('input,button,textarea')?.focus();},[step]);
  const [warnings,setWarnings]=useState<Array<{number:number;message:string}>>([]);
  const [checking,setChecking]=useState(false),[error,setError]=useState(''),[kept,setKept]=useState<number[]>([]);
  const [newDidNotFinish,setNewDidNotFinish]=useState(false),[comment,setComment]=useState('');
  const additions=entries.some(entry=>!entry.entryId);
  async function check(event:React.FormEvent) {
    event.preventDefault();setError('');const numbers=entries.map(entry=>Number(entry.number));
    const refusal=runnerListRefusal(numbers);if(refusal && numbers.length) {setError(refusal);return;}
    setChecking(true);
    try {
      const warnings:Array<{number:number;message:string}>=[];
      for(const entry of entries) {
        const number=Number(entry.number),old=original.parts.runners.value?.find(runner=>runner.id===entry.entryId);
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
  return <div ref={region}>{error && <p role="alert">{error}</p>}{step==='input'?<form onSubmit={event=>void check(event)}><p>Change a number in its existing row to keep that child’s place and time. Remove or add a row only when the runners themselves changed.</p>
    {entries.map((entry,index)=><div className="lead-runner-input" key={entry.entryId||`new-${index}`}><label>Runner {index+1}<input aria-label={`Wristband for runner ${index+1}`} inputMode="numeric" pattern="[0-9]+" required value={entry.number} disabled={busy || checking} onChange={event=>setEntries(previous=>previous.map((old,at)=>at===index?{...old,number:event.target.value}:old))}/></label><button type="button" disabled={busy || checking} className="secondary" onClick={()=>setEntries(previous=>previous.filter((_old,at)=>at!==index))}>Remove runner {index+1}</button></div>)}
    <button type="button" disabled={busy || checking || entries.length>=6} onClick={()=>setEntries(previous=>[...previous,{entryId:undefined,number:''}])}>Add runner</button><button disabled={busy || checking}>{checking?'Checking…':'Review runner list'}</button>
    </form>:step==='warnings'?<div className="runner-number-warning">{warnings.map((warning,index)=><p key={index}>{warning.message}</p>)}<button disabled={busy} onClick={()=>setStep('input')}>Fix runners</button><button disabled={busy} onClick={()=>{setKept([...new Set(warnings.map(warning=>warning.number))]);setStep('review');}}>Keep warnings</button></div>:<><h4>{entries.length} runners. Is that right?</h4><p>{entries.map(entry=>entry.number).join(' · ')||'No runners'}</p>{warnings.map((warning,index)=><p className="runner-number-warning" key={index}>{warning.message} · Warning kept</p>)}{additions && original.parts.finish.value && <><p>Finish order must be recorded again for new runners, unless they did not finish.</p><label className="lead-checkbox"><input type="checkbox" checked={newDidNotFinish} disabled={busy} onChange={event=>setNewDidNotFinish(event.target.checked)}/>New runners did not finish</label></>}
      <label>Comment (optional)<textarea disabled={busy} maxLength={1000} value={comment} onChange={event=>setComment(event.target.value)}/></label><button disabled={busy} onClick={save}>{busy?'Saving…':'Save runner list'}</button><button className="secondary" disabled={busy} onClick={()=>setStep('input')}>Change runner list</button>
    </>}
    <button className="secondary" disabled={busy || checking} onClick={onClose}>Cancel correction</button></div>;
}
