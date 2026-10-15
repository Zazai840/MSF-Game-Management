import { useState } from 'react';
import { api } from '../api.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import type { WristbandWarning } from '../../shared/wristband-checks.js';
/**
 * A lead corrects one runner's wristband on the phone's own number pad (as on check-in):
 * Check number, then Fix number (clears it and reopens the keyboard) or Keep for any warning, then Save.
 */
export function RunnerNumber({row,eventCode,onSaved,onClose,onBusyChange}:{row:LeaderboardRow;eventCode:string;onSaved:(next:EventResultsRead)=>void;onClose:()=>void;onBusyChange:(busy:boolean)=>void}) {
  const [original]=useState(row.wristband);
  const [number,setNumber]=useState('');
  const [step,setStep]=useState<'input'|'warning'|'check'>('input');
  const [warnings,setWarnings]=useState<WristbandWarning[]>([]);
  const [kept,setKept]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  function working(value:boolean) {setBusy(value);onBusyChange(value);}
  async function check() {
    working(true);setError('');
    try {
      const data=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode,wristband:Number(number),raceId:row.raceId});
      const warnings=data.warnings.filter(warning=>row.race.kind!=='final'||warning.kind!=='already-ran');
      setWarnings(warnings);setKept(false);setStep(warnings.length?'warning':'check');
    } catch(error) {setError(error instanceof Error?error.message:'Could not check the number');}
    finally {working(false);}
  }
  async function save() {
    working(true);setError('');
    try {onSaved(await api<EventResultsRead>(`lead/races/${row.raceId}/runners/${row.entryId}/correct-number`,{expectedWristband:original,wristband:Number(number),keepWarnings:kept}));}
    catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {working(false);}
  }
  function fix() {setNumber('');setStep('input');setError('');}
  return <div className="lead-number sheet-stack">{error && <p role="alert">{error}</p>}
    {step!=='check'?<>
      <NumberEntry label="New wristband number" placeholder={`Instead of ${original}`} value={number} onChange={setNumber} onNext={()=>void check()} held={step==='warning'} busy={busy} nextLabel="Check number"/>
      {step==='warning' && <div className="warning-box">{warnings.map(warning=><p key={warning.kind}>{warning.message}</p>)}
        <div className="warning-actions"><button disabled={busy} onClick={fix}>Fix number</button><button className="button-secondary" disabled={busy} onClick={()=>{setKept(true);setStep('check');}}>Keep</button></div></div>}
    </>:<><p>Change {original} to <strong>{number}</strong>?</p>{warnings.map(warning=><p className="warning-box" key={warning.kind}>{warning.message} · Warning kept</p>)}<button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save correction'}</button><button disabled={busy} className="button-secondary" onClick={()=>{setStep('input');setError('');}}>Change number</button></>}
    <button className="button-secondary" disabled={busy} onClick={onClose}>Cancel correction</button></div>;
}
