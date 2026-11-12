import { useEffect,useState } from 'react';
import { clockWithSeconds } from '../../shared/clock.js';
import type { DayLeadItem } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName,stepLabels,type RaceFlowRead,type Step } from '../../shared/race-flow.js';
import { entryName,isTeamEntry,type RaceEntry } from '../../shared/races.js';
import { entryCount,legsText } from '../../shared/teams.js';
import { formatTime } from '../../shared/time-entry.js';
import { wrongTimes } from '../../shared/wrong-times.js';
import { api } from '../api.js';
import { RaceProblems,acceptable } from '../lead/RaceProblems.js';
import { Callout,Icon } from './parts.js';
import { UpdatedAt } from './UpdatedAt.js';
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
  const [updated,setUpdated]=useState(()=>clockWithSeconds(new Date()));
  useEffect(()=>setUpdated(clockWithSeconds(new Date())),[read]);
  /** Refresh: the race and its To check read again now, as the live stream would bring them. */
  function refresh() {void api<RaceFlowRead>(`races/${race.id}`).then(props.flow.offer).catch(()=>{});onIssue();}
  // The race page's problems, with this screen's ways to settle one: the race actions, or Results.
  const callouts=own.length>0 && <RaceProblems items={own} race={race} onAccepted={onIssue}
    fix={item=>acceptable(item)?{label:item.kind==='times-out-of-order'?'Fix time':'Fix',open:onActions}:{label:'Open in Results',open:()=>onResults(item)}}/>;
  // A race not in Results yet says what it still needs in the band; a saved race whose finishers and times disagree says so here.
  const mismatch=step!=='runners' && race.recording.countMismatch;
  if(race.state!=='saved') return <>
    {callouts && <div className="rz-main" style={{flex:'none',paddingBottom:0}}>{callouts}</div>}
    {step==='runners'?<StartLine {...props}/>:step==='positions'?<FinishLine {...props}/>:<Timer {...props}/>}
  </>;
  return <>
    <main className="rz-main" role="tabpanel" aria-label={stepLabels[step]}>
      {callouts}{mismatch && <Callout status message={mismatch}/>}
      <StepRecord read={read} step={step} onEdit={onActions}/>
    </main>
    <footer className="rz-footer"><UpdatedAt time={updated} onRefresh={refresh}/></footer>
  </>;
}
/** A relay team's four children on the line under its name, in a chip or across a row; nothing for a child. */
const TeamLegs=({entry,className='rz-team-legs'}:{entry:RaceEntry|undefined;className?:string})=>entry && isTeamEntry(entry)?<span className={className}>{legsText(entry.legs)}</span>:null;
const nameOf=(entry:RaceEntry|undefined)=>entry?entryName(entry):'–';
/** A kept warning on a child, or on any child of a relay team. */
const kept=(entry:RaceEntry)=>isTeamEntry(entry)?entry.legs.some(leg=>leg.warnings.length):!!entry.warnings?.length;
/**
 * A step's record, read-only: the runners, the finishing order, or the times joined to wristbands by place. A lead
 * sees it on a saved race (each time opens the race actions); anyone sees it when looking at another role's step.
 */
export function StepRecord({read,step,onEdit}:{read:StepProps['read'];step:Step;onEdit?:()=>void}) {
  const {race}=read,relay=race.event.relay,runners=race.parts.runners.value||[],byId=new Map(runners.map(runner=>[runner.id,runner]));
  const finish=race.parts.finish.value,places=race.parts.times.value?.places||[];
  const rows=Math.max(places.length,finish?.order.length||0),wrong=new Set(wrongTimes(places,race.event.name).map(time=>time.index));
  return <>
    <p className="rz-prompt__meta">{raceName(race)} · {step==='times'?'places and times joined up':step==='positions'?'the finishing order':`${relay?entryCount(runners.length,true):runners.length} checked in`}</p>
    {step==='runners' && (runners.length?<ul className="rz-chips" aria-label="Checked in">{runners.map(runner=><li key={runner.id}><span className={['rz-chip',kept(runner) && 'rz-chip--warn',relay && 'rz-chip--team'].filter(Boolean).join(' ')}>{entryName(runner)}<TeamLegs entry={runner}/></span></li>)}</ul>
      :<p className="rz-empty">{relay?'No team is checked in yet.':'Nobody is checked in yet.'}</p>)}
    {step==='positions' && (finish?<ol className="rz-lead-rows" aria-label="Finishing order">
      {finish.order.map((id,index)=><li key={id} className="rz-lead-row"><span className="rz-lead-row__place">{ordinal(index+1)}</span><span className="rz-lead-row__num">{nameOf(byId.get(id))}</span><span/><TeamLegs entry={byId.get(id)} className="rz-team-legs rz-lead-row__legs"/></li>)}
      {finish.didNotFinish.map(id=><li key={id} className="rz-lead-row"><span className="rz-lead-row__place">–</span><span className="rz-lead-row__num">{nameOf(byId.get(id))}</span><span className="rz-tag rz-tag--dnf">Did not finish</span><TeamLegs entry={byId.get(id)} className="rz-team-legs rz-lead-row__legs"/></li>)}
    </ol>:<p className="rz-empty">{relay?'No team is placed yet.':'Nobody is placed yet.'}</p>)}
    {step==='times' && (rows?<ol className="rz-lead-rows" aria-label="Times">{Array.from({length:rows},(_,index)=>{
      const runner=byId.get(finish?.order[index]||''),time=places[index],warn=wrong.has(index);
      const content=<><span className="rz-lead-row__place">{ordinal(index+1)}</span><span className="rz-lead-row__num">{nameOf(runner)}</span>
        <span className="rz-lead-row__end">{time==null?'No time':formatTime(time)}{onEdit && <> <Icon name="pencil" className="rz-icon--sm"/></>}</span><TeamLegs entry={runner} className="rz-team-legs rz-lead-row__legs"/></>;
      const label=`${ordinal(index+1)}, ${runner?(isTeamEntry(runner)?`${entryName(runner)} · ${legsText(runner.legs)}`:entryName(runner)):relay?'no team':'no wristband'}, ${time==null?'no time yet':formatTime(time)}`;
      return <li key={index}>{onEdit?<button type="button" className={warn?'rz-lead-row rz-lead-row--warn':'rz-lead-row'} style={{width:'100%'}} onClick={onEdit} aria-label={`${label}. Edit`}>{content}</button>
        :<div className={warn?'rz-lead-row rz-lead-row--warn':'rz-lead-row'} aria-label={label}>{content}</div>}</li>;
    })}</ol>:<p className="rz-empty">No times yet.</p>)}
  </>;
}
