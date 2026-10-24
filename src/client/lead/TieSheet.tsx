import { useId,useState,type FormEvent } from 'react';
import { ActionSheet } from './ActionSheet.js';
import { api } from '../api.js';
import { resultName,type ResultTie } from '../../shared/results-rules.js';
import { ResultName } from './ResultName.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { keepsSameRaceOrder,tieEntryKey,type TieOutcome } from '../../shared/ties.js';
import { ordinal } from '../../shared/ordinal.js';
import { SortableList } from '../flow/SortableList.js';
import { formatTime } from '../../shared/time-entry.js';
import './ties.css';
export function TieSheet({code,tie,noFinal=false,onSaved,onClose}:{code:string;tie:ResultTie;noFinal?:boolean;onSaved:(next:EventResultsRead)=>void;onClose:()=>void}) {
  const commentId=useId();
  const [outcome,setOutcome]=useState<TieOutcome|null>(null);
  const [order,setOrder]=useState(tie.entries);
  const [comment,setComment]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [who,one]=tie.entries.some(entry=>entry.team)?['teams','team']:['runners','runner'];
  async function save(event:FormEvent) {
    event.preventDefault();if(!outcome || saving) return;setSaving(true);setError('');
    try {
      onSaved(await api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/settle-tie`,{tieId:tie.id,...(noFinal?{stage:'no-final'}:{}),outcome,comment,...(outcome==='no-run-off'?{}:{order:order.map(({raceId,entryId})=>({raceId,entryId}))})}));
    } catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {setSaving(false);}
  }
  return <ActionSheet title={`Tie at ${formatTime(tie.time)}`} busy={saving} focusKey={outcome||'choose'} onClose={onClose}>
    <h3>Tie at {formatTime(tie.time)}</h3><p>{tie.entries.map(resultName).join(', ')} have the same time in different races.</p>
    <div className="tie-outcomes">
      <button disabled={saving} aria-pressed={outcome==='no-run-off'} onClick={()=>setOutcome('no-run-off')}>No run-off needed</button>
      <button disabled={saving} aria-pressed={outcome==='run-off'} onClick={()=>setOutcome('run-off')}>Run-off held</button>
      <button disabled={saving} aria-pressed={outcome==='decided'} onClick={()=>setOutcome('decided')}>Decided without a run-off</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {outcome && <form className="tie-form" onSubmit={event=>void save(event)}>
      {outcome!=='no-run-off' && <><p>Put the tied {who} in the decided order: drag the handle on the right to move a {one}. Their original times stay at {formatTime(tie.time)}.</p>{new Set(order.map(entry=>entry.raceId)).size<order.length && <p>{who==='teams'?'Teams':'Runners'} from the same race stay in their finishing order.</p>}<SortableList label="Tie order" items={order} itemKey={tieEntryKey} itemName={resultName} disabled={saving}
        isAllowed={next=>keepsSameRaceOrder(next,tie.entries)} onReorder={setOrder}
        renderItem={(entry,place)=><><span className="row-place">{ordinal(place)}</span><span className="row-runner"><ResultName entry={entry} className=""/></span></>}/></>}
      <label htmlFor={commentId}>{outcome==='decided'?'Comment':'Comment (optional)'}</label><textarea id={commentId} value={comment} onChange={event=>setComment(event.target.value)} maxLength={1000} required={outcome==='decided'} disabled={saving}/>
      <button disabled={saving}>{saving?'Saving…':'Save tie'}</button>
    </form>}
    <button type="button" className="button-secondary" disabled={saving} onClick={onClose}>Close tie</button>
  </ActionSheet>;
}
