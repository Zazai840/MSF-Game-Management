import { useId,useState,type FormEvent } from 'react';
import { ActionSheet } from './ActionSheet.js';
import { api } from '../api.js';
import type { ResultTie } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import type { TieOutcome } from '../../shared/ties.js';
import { formatTime } from '../../shared/time-entry.js';
import './ties.css';
export function TieSheet({code,tie,onSaved,onClose}:{code:string;tie:ResultTie;onSaved:(next:EventResultsRead)=>void;onClose:()=>void}) {
  const commentId=useId();
  const [outcome,setOutcome]=useState<TieOutcome|null>(null);
  const [order,setOrder]=useState(tie.entries);
  const [comment,setComment]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const canMove=(index:number,direction:number)=>!!order[index+direction] && order[index].raceId!==order[index+direction].raceId;
  function move(index:number,direction:number) {
    setOrder(previous=>{const next=[...previous];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;});
  }
  async function save(event:FormEvent) {
    event.preventDefault();if(!outcome || saving) return;setSaving(true);setError('');
    try {
      onSaved(await api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/settle-tie`,{tieId:tie.id,outcome,comment,...(outcome==='no-run-off'?{}:{order:order.map(({raceId,entryId})=>({raceId,entryId}))})}));
    } catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {setSaving(false);}
  }
  return <ActionSheet title={`Tie at ${formatTime(tie.time)}`} busy={saving} focusKey={outcome||'choose'} onClose={onClose}>
    <h3>Tie at {formatTime(tie.time)}</h3><p>{tie.entries.map(entry=>entry.wristband).join(', ')} have the same time in different races.</p>
    <div className="tie-outcomes">
      <button disabled={saving} aria-pressed={outcome==='no-run-off'} onClick={()=>setOutcome('no-run-off')}>No run-off needed</button>
      <button disabled={saving} aria-pressed={outcome==='run-off'} onClick={()=>setOutcome('run-off')}>Run-off held</button>
      <button disabled={saving} aria-pressed={outcome==='decided'} onClick={()=>setOutcome('decided')}>Decided without a run-off</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {outcome && <form onSubmit={event=>void save(event)}>
      {outcome!=='no-run-off' && <><p>Put the tied runners in the decided order. Their original times stay at {formatTime(tie.time)}.</p>{new Set(order.map(entry=>entry.raceId)).size<order.length && <p>Runners from the same race stay in their finishing order.</p>}<ol aria-label="Tie order" className="tie-order">{order.map((entry,index)=><li key={`${entry.raceId}:${entry.entryId}`}><strong>{entry.wristband}</strong><div><button type="button" disabled={saving||!canMove(index,-1)} aria-label={`Move ${entry.wristband} up`} onClick={()=>move(index,-1)}>↑</button><button type="button" disabled={saving||!canMove(index,1)} aria-label={`Move ${entry.wristband} down`} onClick={()=>move(index,1)}>↓</button></div></li>)}</ol></>}
      <label htmlFor={commentId}>{outcome==='decided'?'Comment':'Comment (optional)'}</label><textarea id={commentId} value={comment} onChange={event=>setComment(event.target.value)} maxLength={1000} required={outcome==='decided'} disabled={saving}/>
      <button disabled={saving}>{saving?'Saving…':'Save tie'}</button>
    </form>}
    <button type="button" className="secondary" disabled={saving} onClick={onClose}>Close tie</button>
  </ActionSheet>;
}
