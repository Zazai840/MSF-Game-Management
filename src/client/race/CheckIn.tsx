import { useState } from 'react';
import { ordinal } from '../../shared/ordinal.js';
import type { RaceScreenRead } from '../../shared/race-screen.js';
import { runnersOf,type Runner } from '../../shared/races.js';
import { RaceCard } from './RaceCard.js';
import { TakeOver,useRaceWrite,type Offer } from './Hold.js';
import { WristbandEntry } from './WristbandEntry.js';

/**
 * Check-in Wristbands. Opening it takes the check-in hold if nobody has it. The holder types wristband numbers, with
 * Fix number or Keep for a warning, and taps one to fix it (it keeps its place in the order) or take it off; each
 * change sends the whole list. On a final it is the Here / Absent list instead. Everyone else sees it read-only,
 * with Take over.
 */
export function CheckInCard({screen,phoneId,offer}:{screen:RaceScreenRead;phoneId:string;offer:Offer}) {
  const {event,race,stageComplete}=screen,holder=screen.holds['check-in'],mine=holder?.id===phoneId;
  const runners=runnersOf(race.parts.runners.value),wristbands=runners.map(runner=>runner.wristband);
  const {busy,error,write}=useRaceWrite(event.code,offer);
  /** The runner whose number is being fixed or taken off. */
  const [changing,setChanging]=useState<Runner|null>(null);
  const entering=mine && !stageComplete;
  const fixing=changing && runners.some(runner=>runner.id===changing.id)?changing:null;
  async function save(list:Array<{id?:string;wristband:number}>,kept:number[]=[]) {
    const sent=await write('check-in',{raceId:race.id,version:race.parts.runners.version,runners:list,keptWarnings:kept});
    if(sent) setChanging(null);
    return sent;
  }
  const entries=runners.map(({id,wristband})=>({id,wristband}));
  /** The list with the typed number added, or put in place of the one being fixed. */
  const withNumber=(wristband:number)=>fixing?entries.map(entry=>entry.id===fixing.id?{...entry,wristband}:entry):[...entries,{wristband}];
  const doing=race.final?'checking who is here':'checking in',count=race.final?`${runners.length} here`:`${runners.length} in`;
  const status=holder?`${mine?'You are':`${holder.name} is`} ${doing} · ${count}`:runners.length && !race.final?count:stageComplete?'Nobody':'Nobody yet · open to start';
  return <RaceCard title="Check-in Wristbands" status={status} onOpen={()=>{if(!holder && !stageComplete) void write('hold',{job:'check-in'});}}>
    {error && <p role="alert">{error}</p>}
    {race.final?<Attendance final={race.final} marking={entering} busy={busy} onMark={absent=>void write('absent',{raceId:race.id,version:race.parts.runners.version,absent})}/>
    :<>{runners.length?<ul className="race-chips" aria-label="Checked in">{runners.map(runner=>{
      const dot=runner.warnings?.length?<span className="kept-dot" aria-hidden="true"/>:null;
      return <li key={runner.id}>{entering?<button disabled={busy} aria-pressed={fixing?.id===runner.id} aria-label={`Change runner ${runner.wristband}`} onClick={()=>setChanging(fixing?.id===runner.id?null:runner)}>{dot}{runner.wristband}</button>:<>{dot}{runner.wristband}</>}</li>;
    })}</ul>:<p className="race-empty">No runners checked in yet</p>}
    {entering && <>
      <WristbandEntry key={fixing?.id||'new'} event={event} raceId={race.id} busy={busy} label={fixing?`Fix ${fixing.wristband}: wristband number`:'Wristband number'}
        taken={wristbands.filter(number=>number!==fixing?.wristband)} onSave={(wristband,kept)=>save(withNumber(wristband),kept?[wristband]:[])}/>
      {fixing?<div className="race-fixing">
        <button className="button-secondary" disabled={busy} aria-label={`Take ${fixing.wristband} off`} onClick={()=>void save(entries.filter(entry=>entry.id!==fixing.id))}>Take off</button>
        <button className="button-quiet" onClick={()=>setChanging(null)}>Cancel</button>
      </div>:runners.length>0 && <p className="race-hint">Tap a number to fix it or take it off.</p>}
    </>}</>}
    {holder && !mine && !stageComplete && <TakeOver job="check-in" holder={holder.name} busy={busy} onConfirm={()=>void write('take-over',{job:'check-in'})}/>}
  </RaceCard>;
}
/**
 * Check-in on a final: a live Here / Absent list of the seeded qualifiers (and any runner a lead called up or added),
 * with no confirm step. Each tap sends the whole Absent list; only those Here are the final's runners, so one marked
 * Absent leaves the order holder's list at once.
 */
function Attendance({final,marking,busy,onMark}:{final:NonNullable<RaceScreenRead['race']['final']>;marking:boolean;busy:boolean;onMark:(absent:string[])=>void}) {
  const absent=final.entries.filter(entry=>entry.absent).map(entry=>entry.finalEntryId);
  return <ul className="race-attendance" aria-label="Who is here">{final.entries.map(entry=><li key={entry.finalEntryId} className={entry.absent?'is-absent':undefined}>
    <span className="race-seed">{entry.calledUp?'Called up':entry.seed===null?'Added':`${ordinal(entry.seed)} seed`}</span><strong>{entry.wristband}</strong>
    {marking?<span className="race-attend-pair">
      <button className={entry.absent?'button-secondary':undefined} disabled={busy} aria-pressed={!entry.absent} aria-label={`${entry.wristband} Here`} onClick={()=>{if(entry.absent) onMark(absent.filter(id=>id!==entry.finalEntryId));}}>Here</button>
      <button className={entry.absent?'race-absent-on':'button-secondary'} disabled={busy} aria-pressed={entry.absent} aria-label={`${entry.wristband} Absent`} onClick={()=>{if(!entry.absent) onMark([...absent,entry.finalEntryId]);}}>Absent</button>
    </span>:<span className={entry.absent?'race-absent':'race-here'}>{entry.absent?'Absent':'Here'}</span>}
  </li>)}</ul>;
}
