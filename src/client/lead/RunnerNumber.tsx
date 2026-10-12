import { useEffect,useId,useRef,useState } from 'react';
import { api } from '../api.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import type { WristbandWarning } from '../../shared/wristband-checks.js';
export function RunnerNumber({row,eventCode,onSaved,onClose,onBusyChange}:{row:LeaderboardRow;eventCode:string;onSaved:(next:EventResultsRead)=>void;onClose:()=>void;onBusyChange:(busy:boolean)=>void}) {
  const id=useId();
  const region=useRef<HTMLDivElement>(null);
  const [original]=useState(row.wristband);
  const [number,setNumber]=useState('');
  const [step,setStep]=useState<'input'|'warning'|'check'>('input');
  const [warnings,setWarnings]=useState<WristbandWarning[]>([]);
  const [kept,setKept]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{region.current?.querySelector<HTMLElement>('input,button')?.focus();},[step]);
  function working(value:boolean) {setBusy(value);onBusyChange(value);}
  async function check(event:React.FormEvent) {
    event.preventDefault();working(true);setError('');
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
  return <div ref={region}>{error && <p role="alert">{error}</p>}{step==='input'?<form onSubmit={event=>void check(event)}><label htmlFor={id}>New wristband number</label><input id={id} inputMode="numeric" pattern="[0-9]+" required value={number} onChange={event=>setNumber(event.target.value)} disabled={busy}/><button disabled={busy}>{busy?'Checking…':'Check number'}</button></form>:step==='warning'?<div className="runner-number-warning">{warnings.map(warning=><p key={warning.kind}>{warning.message}</p>)}<button disabled={busy} onClick={()=>{setStep('input');setError('');}}>Fix number</button><button disabled={busy} onClick={()=>{setKept(true);setStep('check');}}>Keep</button></div>:<><p>Change {original} to <strong>{number}</strong>?</p>{warnings.map(warning=><p key={warning.kind}>{warning.message} · Warning kept</p>)}<button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save correction'}</button><button disabled={busy} className="secondary" onClick={()=>{setStep('input');setError('');}}>Change number</button></>}
  <button className="secondary" disabled={busy} onClick={onClose}>Cancel correction</button></div>;
}
