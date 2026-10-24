import { useId,useState,type FormEvent } from 'react';
import { api } from '../api.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import type { StageCheckSheet,StageItem } from '../../shared/stages.js';
import { ActionSheet } from './ActionSheet.js';
import { ordinal } from '../../shared/ordinal.js';
import { ResultName } from './ResultName.js';
import './stages.css';
export function StageSheet({code,sheet,onSaved,onClose,onOpen}:{code:string;sheet:StageCheckSheet;onSaved:(detail:EventResultsRead)=>void;onClose:()=>void;onOpen:(item:StageItem)=>void}) {
  const id=useId(),reopening=sheet.completed,noFinal=!reopening && sheet.stage==='no-final';
  const reopenTitle=sheet.stage==='event'?'Reopen event':sheet.stage==='heats'?'Reopen heats':'Reopen final';
  const [comment,setComment]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function save(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try {onSaved(await api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/${reopening?'reopen-stage':'complete-stage'}`,{stage:sheet.stage,...(reopening||noFinal?{comment}:{})}));}
    catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {setBusy(false);}
  }
  const items=(items:StageItem[])=>items.map(item=><li key={item.id}><button disabled={busy} onClick={()=>onOpen(item)}>{item.message}</button></li>);
  return <ActionSheet title={reopening?reopenTitle:sheet.label} busy={busy} onClose={onClose}>
    <h3>{reopening?reopenTitle:sheet.label}</h3>
    {error && <p role="alert">{error}</p>}
    {!reopening && <><section className={sheet.mustSettleFirst.length?'stage-blockers stage-attention':'stage-blockers'}><h4>Must settle first</h4>{sheet.mustSettleFirst.length?<ul>{items(sheet.mustSettleFirst)}</ul>:<p>Nothing to settle</p>}</section>
      <section className={sheet.worthALook.length?'stage-warnings stage-attention':'stage-warnings'}><h4>Worth a look</h4>{sheet.worthALook.length?<><p>These warnings do not block completion.</p><ul>{items(sheet.worthALook)}</ul></>:<p>No open warnings</p>}</section>
      <section><h4>What this creates</h4><p>{sheet.stage==='heats'?'Finals line-up':sheet.stage==='final'?'Final positions':'Medal places'}</p><ol className="stage-creates">{sheet.creates.map(place=><li key={place.position}>{ordinal(place.position)}: {place.team?<ResultName entry={place} className="" legs="inline"/>:place.wristband??'-'}</li>)}</ol></section></>}
    <form onSubmit={event=>void save(event)}>{noFinal && <><p>No final will be run. Medals go to the 3 fastest heat times.</p><label htmlFor={id}>Comment</label><textarea id={id} required maxLength={1000} placeholder="For example: Out of time" value={comment} disabled={busy} onChange={event=>setComment(event.target.value)}/></>}
      {reopening && <><p>This unlocks the stage for corrections.</p>{sheet.reopenWarning && <p role="status">{sheet.reopenWarning}</p>}<label htmlFor={id}>Comment</label><textarea id={id} required maxLength={1000} value={comment} disabled={busy} onChange={event=>setComment(event.target.value)}/></>}
      <button disabled={busy||(!reopening&&sheet.mustSettleFirst.length>0)}>{busy?'Saving…':reopening?'Reopen':'Confirm'}</button>
    </form><button className="button-secondary" disabled={busy} onClick={onClose}>Close check sheet</button>
  </ActionSheet>;
}
