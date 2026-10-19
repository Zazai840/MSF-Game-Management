import { useState } from 'react';
import { api } from '../api.js';
import type { RaceScreenRead } from '../../shared/race-screen.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { plainWristbandWarning,wristbandWarnings,type WristbandWarning } from '../../shared/wristband-checks.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { RaceCard } from './RaceCard.js';
import { TakeOver,useRaceWrite,type Offer } from './Hold.js';

/**
 * Check-in Wristbands. Opening it takes the check-in hold if nobody has it. The holder types wristband numbers, with
 * Fix number or Keep for a warning, and taps one to take it off; each change sends the whole list. Everyone else
 * sees it read-only, with Take over.
 */
export function CheckInCard({screen,phoneId,offer}:{screen:RaceScreenRead;phoneId:string;offer:Offer}) {
  const {event,race,stageComplete}=screen,holder=screen.holds['check-in'],mine=holder?.id===phoneId;
  const runners=race.parts.runners.value||[],wristbands=runners.map(runner=>runner.wristband);
  const {busy,error,setError,write}=useRaceWrite(event.code,offer);
  const [current,setCurrent]=useState('');
  const [pending,setPending]=useState<WristbandWarning[]>([]);
  /** A number refused outright (already in this race): only Fix number. */
  const [refused,setRefused]=useState('');
  const [checking,setChecking]=useState(false);
  // The final's Here / Absent list comes later; until then its check-in is read-only here.
  const entering=mine && !stageComplete && race.kind!=='final',held=pending.length>0 || !!refused;
  async function save(numbers:number[],kept:number[]=[]) {
    const sent=await write('check-in',{raceId:race.id,version:race.parts.runners.version,runners:numbers,keptWarnings:kept});
    // A refused number is gone: the list shows what the server has. One that could not be sent stays to send again.
    if(sent) {setCurrent('');setPending([]);}
  }
  async function next() {
    const number=Number(current);setError('');
    if(wristbands.includes(number)) {setRefused(`${number} is already in this race. Check the wristband.`);return;}
    const refusal=runnerListRefusal([number]);
    if(refusal) {setError(refusal);return;}
    // The input stays read-only from the check until the list is saved, so nothing typed meanwhile is lost.
    setChecking(true);
    try {
      const local=wristbandWarnings(number,event.section);
      const response=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:event.code,wristband:number,...(race.id?{raceId:race.id}:{})});
      const warnings=[...local,...response.warnings.filter(warning=>!local.some(item=>item.kind===warning.kind))];
      if(warnings.length) setPending(warnings);
      else await save([...wristbands,number]);
    } catch(failure) {setError(failure instanceof Error?failure.message:'Could not check this number - tap Next again');}
    finally {setChecking(false);}
  }
  const fix=()=>{setCurrent('');setPending([]);setRefused('');};
  const status=holder?`${mine?'You are':`${holder.name} is`} checking in · ${runners.length} in`:runners.length?`${runners.length} in`:stageComplete?'Nobody':'Nobody yet · open to start';
  return <RaceCard title="Check-in Wristbands" status={status} onOpen={()=>{if(!holder && !stageComplete) void write('hold',{job:'check-in'});}}>
    {error && <p role="alert">{error}</p>}
    {runners.length?<ul className="race-chips" aria-label="Checked in">{runners.map(runner=>{
      const dot=runner.warnings?.length?<span className="kept-dot" aria-hidden="true"/>:null;
      return <li key={runner.id}>{entering?<button disabled={busy || held} aria-label={`Remove runner ${runner.wristband}`} onClick={()=>void save(wristbands.filter(number=>number!==runner.wristband))}>{dot}{runner.wristband}<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>:<>{dot}{runner.wristband}</>}</li>;
    })}</ul>:<p className="race-empty">No runners checked in yet</p>}
    {entering && <>
      <NumberEntry label="Wristband number" placeholder="e.g. 205" value={current} held={held} busy={busy || checking} onChange={digits=>{setCurrent(digits);setError('');}} onNext={()=>void next()}/>
      {held && <div className="warning-box" role="alert">
        {refused?<p>{refused}</p>:pending.map(warning=><p key={warning.kind}>{plainWristbandWarning(warning,Number(current),event.section)}</p>)}
        <div className="warning-actions"><button onClick={fix}>Fix number</button>{!refused && <button className="button-secondary" disabled={busy} onClick={()=>void save([...wristbands,Number(current)],[Number(current)])}>Keep</button>}</div>
      </div>}
      {runners.length>0 && <p className="race-hint">Tap a number to take it off.</p>}
    </>}
    {holder && !mine && !stageComplete && <TakeOver job="check-in" holder={holder.name} busy={busy} onConfirm={()=>void write('take-over',{job:'check-in'})}/>}
  </RaceCard>;
}
