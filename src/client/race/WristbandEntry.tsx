import { useState,type ReactNode } from 'react';
import { api } from '../api.js';
import type { DayEvent } from '../../shared/day.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { plainWristbandWarning,wristbandWarnings,type WristbandWarning } from '../../shared/wristband-checks.js';
import { NumberEntry } from '../flow/NumberEntry.js';

/**
 * One wristband typed on the phone's number pad, with check-in's warnings: a number already in the race is refused
 * (Fix number only), and any other warning waits for Fix number or Keep. `onSave` sends it; once the server has it the
 * input clears for the next number, and one that could not be sent stays to send again.
 */
export function WristbandEntry({event,raceId,taken,busy,label='Wristband number',onSave,extraAction}:{event:DayEvent;raceId:string|null;
  /** The wristbands already in this race. */
  taken:number[];busy:boolean;label?:string;onSave:(wristband:number,kept:boolean)=>Promise<unknown>;extraAction?:ReactNode}) {
  const [current,setCurrent]=useState('');
  const [pending,setPending]=useState<WristbandWarning[]>([]);
  /** A number refused outright (already in this race): only Fix number. */
  const [refused,setRefused]=useState('');
  const [error,setError]=useState('');
  const [checking,setChecking]=useState(false);
  const held=pending.length>0 || !!refused;
  async function save(kept:boolean) {
    if(await onSave(Number(current),kept)) {setCurrent('');setPending([]);}
  }
  async function next() {
    const number=Number(current);setError('');
    if(taken.includes(number)) {setRefused(`${number} is already in this race. Check the wristband.`);return;}
    const refusal=runnerListRefusal([number]);
    if(refusal) {setError(refusal);return;}
    // The input stays read-only from the check until the number is saved, so nothing typed meanwhile is lost.
    setChecking(true);
    try {
      const local=wristbandWarnings(number,event.section);
      const response=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:event.code,wristband:number,...(raceId?{raceId}:{})});
      const warnings=[...local,...response.warnings.filter(warning=>!local.some(item=>item.kind===warning.kind))];
      if(warnings.length) setPending(warnings);
      else await save(false);
    } catch(failure) {setError(failure instanceof Error?failure.message:'Could not check this number - tap Next again');}
    finally {setChecking(false);}
  }
  const fix=()=>{setCurrent('');setPending([]);setRefused('');};
  return <>
    {error && <p role="alert">{error}</p>}
    <NumberEntry inline label={label} placeholder="e.g. 205" value={current} held={held} busy={busy || checking} extraAction={extraAction} onChange={digits=>{setCurrent(digits);setError('');}} onNext={()=>void next()}/>
    {held && <div className="warning-box" role="alert">
      {refused?<p>{refused}</p>:pending.map(warning=><p key={warning.kind}>{plainWristbandWarning(warning,Number(current),event.section)}</p>)}
      <div className="warning-actions"><button onClick={fix}>Fix number</button>{!refused && <button className="button-secondary" disabled={busy} onClick={()=>void save(true)}>Keep</button>}</div>
    </div>}
  </>;
}
