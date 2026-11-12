import { ordinal } from '../../shared/ordinal.js';
import { raceName,type Step } from '../../shared/race-flow.js';
import { entryName,isTeamEntry,type RaceEntry } from '../../shared/races.js';
import { entryCount,legsText } from '../../shared/teams.js';
import { formatTime } from '../../shared/time-entry.js';
import { wrongTimes } from '../../shared/wrong-times.js';
import type { StepProps } from './Steps.js';
/** A relay team's four children on the line under its name, in a chip or across a row; nothing for a child. */
const TeamLegs=({entry,className='rz-team-legs'}:{entry:RaceEntry|undefined;className?:string})=>entry && isTeamEntry(entry)?<span className={className}>{legsText(entry.legs)}</span>:null;
const nameOf=(entry:RaceEntry|undefined)=>entry?entryName(entry):'–';
/** A kept warning on a child, or on any child of a relay team. */
const kept=(entry:RaceEntry)=>isTeamEntry(entry)?entry.legs.some(leg=>leg.warnings.length):!!entry.warnings?.length;
/**
 * A step's record, read-only, for a volunteer looking at another role's step: the runners, the finishing order, or
 * the times joined to wristbands by place. A lead reads a saved race on its race page.
 */
export function StepRecord({read,step}:{read:StepProps['read'];step:Step}) {
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
      const label=`${ordinal(index+1)}, ${runner?(isTeamEntry(runner)?`${entryName(runner)} · ${legsText(runner.legs)}`:entryName(runner)):relay?'no team':'no wristband'}, ${time==null?'no time yet':formatTime(time)}`;
      return <li key={index}><div className={warn?'rz-lead-row rz-lead-row--warn':'rz-lead-row'} aria-label={label}><span className="rz-lead-row__place">{ordinal(index+1)}</span><span className="rz-lead-row__num">{nameOf(runner)}</span>
        <span className="rz-lead-row__end">{time==null?'No time':formatTime(time)}</span><TeamLegs entry={runner} className="rz-team-legs rz-lead-row__legs"/></div></li>;
    })}</ol>:<p className="rz-empty">No times yet.</p>)}
  </>;
}
