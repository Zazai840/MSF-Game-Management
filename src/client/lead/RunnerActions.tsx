import { useId,useState } from 'react';
import { ActionSheet } from './ActionSheet.js';
import { RunnerNumber } from './RunnerNumber.js';
import { api } from '../api.js';
import { disqualificationReasons } from '../../shared/rulings.js';
import { isOpenEligibilityWarning } from '../../shared/runner-rulings.js';
import { formatTime } from '../../shared/time-entry.js';
import { resultHolder,resultName,type LeaderboardRow } from '../../shared/results-rules.js';
import { resultLabel } from './ResultName.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
export interface RunnerActionsProps { row:LeaderboardRow; rows:readonly LeaderboardRow[]; eventCode:string; onSaved:(next:EventResultsRead)=>void; onClose:()=>void }
export function RunnerActions({row,rows,eventCode,onSaved,onClose}:RunnerActionsProps) {
  const reasonId=useId(),commentId=useId();
  const [action,setAction]=useState<'choose'|'disqualify'|'lift'|'correct'|'count'>('choose');
  const [reason,setReason]=useState('');
  const [comment,setComment]=useState('');
  const [counted,setCounted]=useState(`${row.raceId}:${row.entryId}`);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const choices=rows.filter(other=>resultHolder(other)===resultHolder(row) && !other.disqualification && other.race.kind!=='final');
  async function command(command:string,body:unknown,target=row) {
    if(saving) return;setSaving(true);setError('');
    try {onSaved(await api<EventResultsRead>(`lead/races/${target.raceId}/runners/${target.entryId}/${command}`,body));}
    catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {setSaving(false);}
  }
  function save(event:React.FormEvent) {event.preventDefault();void command(action==='lift'?'lift-disqualification':'disqualify',{reason,comment});}
  return <ActionSheet title={`Actions for ${resultName(row)}`} busy={saving} focusKey={action} onClose={onClose}>
    <h3>{resultLabel(row)}</h3>{error && <p role="alert">{error}</p>}
    {action==='choose'?<div className="runner-action-choices">{row.disqualification?<><p>Disqualified: {row.disqualification.reason}</p><button disabled={saving} onClick={()=>setAction('lift')}>Lift disqualification</button></>:<button disabled={saving} onClick={()=>setAction('disqualify')}>{row.team?`Disqualify ${resultName(row)}`:'Disqualify'}</button>}
      {row.flags.some(flag=>flag.kind==='added-at-finish' && !flag.checked) && <button disabled={saving} onClick={()=>void command('mark-added-checked',{})}>Mark addition checked</button>}
      {row.flags.some(isOpenEligibilityWarning) && <><button disabled={saving} onClick={()=>void command('mark-warning-checked',{})}>Mark checked</button>{!row.disqualification && <button disabled={saving} onClick={()=>{setReason('Wrong section or age');setAction('disqualify');}}>Disqualify for wrong section or age</button>}</>}
      <button disabled={saving} onClick={()=>setAction('correct')}>Correct number</button>
      {!row.disqualification && choices.length>1 && <button disabled={saving} onClick={()=>setAction('count')}>Choose which result counts</button>}
      <button disabled={saving} className="button-secondary" onClick={onClose}>Close actions</button>
    </div>:action==='correct'?<RunnerNumber row={row} eventCode={eventCode} onSaved={onSaved} onClose={onClose} onBusyChange={setSaving}/>:action==='count'?<form onSubmit={event=>{event.preventDefault();const target=choices.find(other=>`${other.raceId}:${other.entryId}`===counted);if(target) void command('count-result',{},target);}}>
      <p>Choose the result that counts for {resultName(row)}. Other results stay visible as not counted.</p>
      {choices.map(other=><label className="count-choice" key={`${other.raceId}:${other.entryId}`}><input type="radio" name="counted-result" value={`${other.raceId}:${other.entryId}`} checked={counted===`${other.raceId}:${other.entryId}`} onChange={event=>setCounted(event.target.value)} disabled={saving} aria-label={`Count ${other.race.kind==='heat'?'Heat':'Race'} ${other.race.number}`}/>{other.race.kind==='heat'?'Heat':'Race'} {other.race.number} · {other.recordingPending?'Not recorded yet':other.time===null?'Did not finish':formatTime(other.time)}{other.notCounted?' · Not counted':''}</label>)}
      <button disabled={saving}>{saving?'Saving…':'Save counted result'}</button><button type="button" className="button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
    </form>:<form onSubmit={save}>
      {action==='disqualify' && <><label htmlFor={reasonId}>Reason</label><select id={reasonId} value={reason} onChange={event=>setReason(event.target.value)} required disabled={saving}><option value="">Choose a reason</option>{disqualificationReasons.map(reason=><option key={reason}>{reason}</option>)}</select></>}
      <label htmlFor={commentId}>{action==='lift'||reason==='Other'?'Comment':'Comment (optional)'}</label><textarea id={commentId} value={comment} onChange={event=>setComment(event.target.value)} required={action==='lift'||reason==='Other'} maxLength={1000} disabled={saving}/>
      <button disabled={saving}>{saving?'Saving…':action==='lift'?'Save lift':'Save disqualification'}</button><button type="button" className="button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
    </form>}
  </ActionSheet>;
}
