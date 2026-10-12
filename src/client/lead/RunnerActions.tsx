import { useId,useState } from 'react';
import { ActionSheet } from './ActionSheet.js';
import { api } from '../api.js';
import { disqualificationReasons } from '../../shared/rulings.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
export interface RunnerActionsProps { row:LeaderboardRow; onSaved:(next:EventResultsRead)=>void; onClose:()=>void }
/** Other runner rulings can share this selected stable entry and successful-save callback. */
export function RunnerActions({row,onSaved,onClose}:RunnerActionsProps) {
  const reasonId=useId(),commentId=useId();
  const [action,setAction]=useState<'choose'|'disqualify'|'lift'>('choose');
  const [reason,setReason]=useState('');
  const [comment,setComment]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  async function save(event:React.FormEvent) {
    event.preventDefault();if(saving) return;setSaving(true);setError('');
    try {
      const command=action==='lift'?'lift-disqualification':'disqualify';
      const next=await api<EventResultsRead>(`lead/races/${row.raceId}/runners/${row.entryId}/${command}`,{reason,comment});
      onSaved(next);
    } catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {setSaving(false);}
  }
  return <ActionSheet title={`Actions for ${row.wristband}`} busy={saving} focusKey={action} onClose={onClose}>
    <h3>Runner {row.wristband}</h3>
    {error && <p role="alert">{error}</p>}
    {action==='choose'?<>{row.disqualification?<><p>Disqualified: {row.disqualification.reason}</p><button onClick={()=>setAction('lift')}>Lift disqualification</button></>:<button onClick={()=>setAction('disqualify')}>Disqualify</button>}<button className="secondary" onClick={onClose}>Close actions</button></>:<form onSubmit={event=>void save(event)}>
      {action==='disqualify' && <><label htmlFor={reasonId}>Reason</label><select id={reasonId} value={reason} onChange={event=>setReason(event.target.value)} required disabled={saving}><option value="">Choose a reason</option>{disqualificationReasons.map(reason=><option key={reason}>{reason}</option>)}</select></>}
      <label htmlFor={commentId}>{action==='lift'||reason==='Other'?'Comment':'Comment (optional)'}</label><textarea id={commentId} value={comment} onChange={event=>setComment(event.target.value)} required={action==='lift'||reason==='Other'} maxLength={1000} disabled={saving}/>
      <button disabled={saving}>{saving?'Saving…':action==='lift'?'Save lift':'Save disqualification'}</button><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
    </form>}
  </ActionSheet>;
}
