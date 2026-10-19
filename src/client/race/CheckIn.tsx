import { useState } from 'react';
import type { RaceScreenRead } from '../../shared/race-screen.js';
import type { Runner } from '../../shared/races.js';
import { RaceCard } from './RaceCard.js';
import { TakeOver,useRaceWrite,type Offer } from './Hold.js';
import { WristbandEntry } from './WristbandEntry.js';

/**
 * Check-in Wristbands. Opening it takes the check-in hold if nobody has it. The holder types wristband numbers, with
 * Fix number or Keep for a warning, and taps one to fix it (it keeps its place in the order) or take it off; each
 * change sends the whole list. Everyone else sees it read-only, with Take over.
 */
export function CheckInCard({screen,phoneId,offer}:{screen:RaceScreenRead;phoneId:string;offer:Offer}) {
  const {event,race,stageComplete}=screen,holder=screen.holds['check-in'],mine=holder?.id===phoneId;
  const runners=race.parts.runners.value||[],wristbands=runners.map(runner=>runner.wristband);
  const {busy,error,write}=useRaceWrite(event.code,offer);
  /** The runner whose number is being fixed or taken off. */
  const [changing,setChanging]=useState<Runner|null>(null);
  // The final's Here / Absent list comes later; until then its check-in is read-only here.
  const entering=mine && !stageComplete && race.kind!=='final';
  const fixing=changing && runners.some(runner=>runner.id===changing.id)?changing:null;
  async function save(list:Array<{id?:string;wristband:number}>,kept:number[]=[]) {
    const sent=await write('check-in',{raceId:race.id,version:race.parts.runners.version,runners:list,keptWarnings:kept});
    if(sent) setChanging(null);
    return sent;
  }
  const entries=runners.map(({id,wristband})=>({id,wristband}));
  /** The list with the typed number added, or put in place of the one being fixed. */
  const withNumber=(wristband:number)=>fixing?entries.map(entry=>entry.id===fixing.id?{...entry,wristband}:entry):[...entries,{wristband}];
  const status=holder?`${mine?'You are':`${holder.name} is`} checking in · ${runners.length} in`:runners.length?`${runners.length} in`:stageComplete?'Nobody':'Nobody yet · open to start';
  return <RaceCard title="Check-in Wristbands" status={status} onOpen={()=>{if(!holder && !stageComplete) void write('hold',{job:'check-in'});}}>
    {error && <p role="alert">{error}</p>}
    {runners.length?<ul className="race-chips" aria-label="Checked in">{runners.map(runner=>{
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
    </>}
    {holder && !mine && !stageComplete && <TakeOver job="check-in" holder={holder.name} busy={busy} onConfirm={()=>void write('take-over',{job:'check-in'})}/>}
  </RaceCard>;
}
