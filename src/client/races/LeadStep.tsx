import { useEffect,useState } from 'react';
import { clockWithSeconds } from '../../shared/clock.js';
import type { DayLeadItem } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName,stepLabels,type Step } from '../../shared/race-flow.js';
import { entryName,isTeamEntry,type RaceEntry } from '../../shared/races.js';
import { formatTime } from '../../shared/time-entry.js';
import { toCheckWording } from '../../shared/to-check.js';
import { wrongTimes } from '../../shared/wrong-times.js';
import { api } from '../api.js';
import { Callout,Icon } from './parts.js';
import { FinishLine,StartLine,Timer,type StepProps } from './Steps.js';
/** Which step a lead item is about: a runner's warning to Runners, an addition at the finish to Finishing order, times and ties to Times. */
export function issueStep(item:DayLeadItem):Step {
  if(item.kind==='added-at-finish') return 'positions';
  if(item.kind==='times-out-of-order' || item.kind==='tie') return item.race?.kind==='final'?'positions':'times';
  return 'runners';
}
/**
 * One step of a race as a lead sees it. A race not yet saved shows the step's own body, so the lead can work it.
 * A saved race shows its record (the runners, the order, or the times joined to wristbands by place); changes go
 * through the race actions. Problems sit on the step they are about, each with "It's right" (it clears the issue and
 * records who accepted it) or the way to settle it.
 */
export function LeadStep({step,issues,onIssue,onResults,onActions,...props}:StepProps & {step:Step;issues:readonly DayLeadItem[];onIssue:()=>void;onResults:(item:DayLeadItem)=>void;onActions:()=>void}) {
  const {read}=props,{race}=read,own=issues.filter(item=>issueStep(item)===step);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[updated,setUpdated]=useState(()=>clockWithSeconds(new Date()));
  useEffect(()=>setUpdated(clockWithSeconds(new Date())),[read.revision]);
  async function accept(item:DayLeadItem) {
    setBusy(item.id);setError('');
    try {
      if(item.kind==='times-out-of-order') {
        const count=race.parts.runners.value?.length||0,places=[...(race.parts.times.value?.places||[])];
        while(places.length<count) places.push(null);
        await api(`lead/races/${race.id}/times`,{baseVersion:race.parts.times.version,places,acceptOutOfOrder:true});
      } else await api(`lead/races/${item.raceId}/runners/${item.entryId}/${item.kind==='added-at-finish'?'mark-added-checked':'mark-warning-checked'}`,{});
      onIssue();
    } catch(failure) {setError(failure instanceof Error?failure.message:'Not saved - try again');}
    finally {setBusy('');}
  }
  const acceptable=(item:DayLeadItem)=>item.kind==='warning' || item.kind==='added-at-finish' || item.kind==='times-out-of-order';
  const callouts=own.length>0 && <>{error && <Callout message={error}/>}{own.map(item=>{const words=toCheckWording(item);return <Callout key={item.id} message={<><strong>{words.title}.</strong> {words.explanation}</>}
    actions={acceptable(item)?<><button type="button" className="rz-btn rz-btn--primary" onClick={onActions}>{item.kind==='times-out-of-order'?'Fix time':'Fix'}</button>
      <button type="button" className="rz-btn" disabled={busy===item.id} onClick={()=>void accept(item)}>It's right</button></>
      :<button type="button" className="rz-btn rz-btn--primary" onClick={()=>onResults(item)}>Open in Results</button>}/>;})}</>;
  const mismatch=step!=='runners' && race.recording.countMismatch;
  if(race.state!=='saved') return <>
    {(callouts || mismatch) && <div className="rz-main" style={{flex:'none',paddingBottom:0}}>{callouts}{mismatch && <Callout status message={mismatch}/>}</div>}
    {step==='runners'?<StartLine {...props}/>:step==='positions'?<FinishLine {...props}/>:<Timer {...props}/>}
  </>;
  return <>
    <main className="rz-main" role="tabpanel" aria-label={stepLabels[step]}>
      {callouts}{mismatch && <Callout status message={mismatch}/>}
      <StepRecord read={read} step={step} onEdit={onActions}/>
    </main>
    <footer className="rz-footer"><p className="rz-refresh" aria-live="polite">Updated at {updated}</p></footer>
  </>;
}
/** A kept warning on a child, or on any child of a relay team. */
const kept=(entry:RaceEntry)=>isTeamEntry(entry)?entry.legs.some(leg=>leg.warnings.length):!!entry.warnings?.length;
const nameOf=(entry:RaceEntry|undefined)=>entry?entryName(entry):'';
/**
 * A step's record, read-only: the runners, the finishing order, or the times joined to wristbands by place. A lead
 * sees it on a saved race (each time opens the race actions); anyone sees it when looking at another role's step.
 */
export function StepRecord({read,step,onEdit}:{read:StepProps['read'];step:Step;onEdit?:()=>void}) {
  const {race}=read,runners=race.parts.runners.value||[],byId=new Map(runners.map(runner=>[runner.id,runner]));
  const finish=race.parts.finish.value,places=race.parts.times.value?.places||[];
  const rows=Math.max(places.length,finish?.order.length||0),wrong=new Set(wrongTimes(places).map(time=>time.index));
  return <>
    <p className="rz-prompt__meta">{raceName(race)} · {step==='times'?'positions and times joined up':step==='positions'?'the finishing order':`${runners.length} checked in`}</p>
    {step==='runners' && (runners.length?<ul className="rz-chips" aria-label="Checked in">{runners.map(runner=><li key={runner.id}><span className={kept(runner)?'rz-chip rz-chip--warn':'rz-chip'}>{entryName(runner)}</span></li>)}</ul>
      :<p className="rz-empty">Nobody is checked in yet.</p>)}
    {step==='positions' && (finish?<ol className="rz-lead-rows" aria-label="Finishing order">
      {finish.order.map((id,index)=><li key={id} className="rz-lead-row"><span className="rz-lead-row__place">{ordinal(index+1)}</span><span className="rz-lead-row__num">{nameOf(byId.get(id))}</span><span/></li>)}
      {finish.didNotFinish.map(id=><li key={id} className="rz-lead-row"><span className="rz-lead-row__place">–</span><span className="rz-lead-row__num">{nameOf(byId.get(id))}</span><span className="rz-tag rz-tag--dnf">Did not finish</span></li>)}
    </ol>:<p className="rz-empty">Nobody is placed yet.</p>)}
    {step==='times' && (rows?<ol className="rz-lead-rows" aria-label="Times">{Array.from({length:rows},(_,index)=>{
      const runner=byId.get(finish?.order[index]||''),time=places[index],warn=wrong.has(index);
      const content=<><span className="rz-lead-row__place">{ordinal(index+1)}</span><span className="rz-lead-row__num">{runner?entryName(runner):'–'}</span>
        <span className="rz-lead-row__end">{time==null?'No time':formatTime(time)}{onEdit && <> <Icon name="pencil" className="rz-icon--sm"/></>}</span></>;
      const label=`${ordinal(index+1)}, ${runner?entryName(runner):'no wristband'}, ${time==null?'no time yet':formatTime(time)}`;
      return <li key={index}>{onEdit?<button type="button" className={warn?'rz-lead-row rz-lead-row--warn':'rz-lead-row'} style={{width:'100%'}} onClick={onEdit} aria-label={`${label}. Edit`}>{content}</button>
        :<div className={warn?'rz-lead-row rz-lead-row--warn':'rz-lead-row'} aria-label={label}>{content}</div>}</li>;
    })}</ol>:<p className="rz-empty">No times yet.</p>)}
  </>;
}
