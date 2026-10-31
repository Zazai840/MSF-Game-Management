import { useState } from 'react';
import { api } from '../api.js';
import { toastLine } from '../../shared/toast-lines.js';
import { useToast } from '../races/Toast.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import type { EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { legRefusal,legWarnings } from '../../shared/teams.js';
/**
 * A lead corrects one runner's wristband on the phone's own number pad (as on check-in):
 * Check number, then Fix number (clears it and reopens the keyboard) or Keep for any warning, then Save.
 * On a team, the lead first picks the child, and the number is checked as the teams sheet checks a box.
 */
export function RunnerNumber({row,eventCode,onSaved,onClose,onBusyChange}:{row:LeaderboardRow;eventCode:string;onSaved:(next:EventResultsRead)=>void;onClose:()=>void;onBusyChange:(busy:boolean)=>void}) {
  const [team]=useState(row.team);
  const [leg,setLeg]=useState<number|null>(team?null:0);
  const original=team?(leg===null?null:team.wristbands[leg]):row.wristband;
  const [number,setNumber]=useState('');
  const [step,setStep]=useState<'input'|'warning'|'check'>('input');
  const [warnings,setWarnings]=useState<Array<{message:string}>>([]);
  const [kept,setKept]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const toast=useToast();
  function working(value:boolean) {setBusy(value);onBusyChange(value);}
  /** A team's box is checked against its relay's team list as it stands: a refusal stops it, a warning needs Keep. */
  async function teamWarnings() {
    const read=await api<LeadRaceRead>(`lead/races/${row.raceId}`),legs=team!.wristbands.map((wristband,at)=>at===leg?Number(number):wristband);
    const refusal=legRefusal(read.teams||[],team!.id,legs,leg!);
    if(refusal) throw new Error(refusal);
    return legWarnings(Number(number),read.race.event,read.relays||[]);
  }
  async function check() {
    working(true);setError('');
    try {
      const warnings=team?await teamWarnings():(await api<{warnings:Array<{kind:string;message:string}>}>('wristband-check',{eventCode,wristband:Number(number),raceId:row.raceId})).warnings.filter(warning=>row.race.kind!=='final'||warning.kind!=='already-ran');
      setWarnings(warnings);setKept(false);setStep(warnings.length?'warning':'check');
    } catch(error) {setError(error instanceof Error?error.message:'Could not check the number');}
    finally {working(false);}
  }
  async function save() {
    working(true);setError('');
    try {
      onSaved(await api<EventResultsRead>(`lead/races/${row.raceId}/runners/${row.entryId}/correct-number`,{expectedWristband:original,wristband:Number(number),keepWarnings:kept,...(team?{leg}:{})}));
      toast({message:toastLine({kind:'number-saved',who:number,race:row.race})});
    }
    catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {working(false);}
  }
  function fix() {setNumber('');setStep('input');setError('');}
  if(team && leg===null) return <div className="lead-number sheet-stack"><p>Which child's number is wrong?</p>
    {team.wristbands.map((wristband,index)=>wristband!==null && <button key={index} className="button-secondary" onClick={()=>setLeg(index)}>{ordinal(index+1)} leg · {wristband}</button>)}
    <button className="button-secondary" onClick={onClose}>Cancel correction</button></div>;
  return <div className="lead-number sheet-stack">{error && <p role="alert">{error}</p>}
    {step!=='check'?<>
      <NumberEntry label="New wristband number" placeholder={`Instead of ${original}`} value={number} onChange={setNumber} onNext={()=>void check()} held={step==='warning'} busy={busy} nextLabel="Check number"/>
      {step==='warning' && <div className="warning-box">{warnings.map(warning=><p key={warning.message}>{warning.message}</p>)}
        <div className="warning-actions"><button disabled={busy} onClick={fix}>Fix number</button><button className="button-secondary" disabled={busy} onClick={()=>{setKept(true);setStep('check');}}>Keep</button></div></div>}
    </>:<><p>Change {original} to <strong>{number}</strong>{team && ` in Team ${team.number}`}?</p>{warnings.map(warning=><p className="warning-box" key={warning.message}>{warning.message} · Warning kept</p>)}<button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save correction'}</button><button disabled={busy} className="button-secondary" onClick={()=>{setStep('input');setError('');}}>Change number</button></>}
    <button className="button-secondary" disabled={busy} onClick={onClose}>Cancel correction</button></div>;
}
