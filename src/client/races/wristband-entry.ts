import { useState } from 'react';
import type { DayEvent } from '../../shared/day.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandWarnings,type WristbandWarning } from '../../shared/wristband-checks.js';
import { api } from '../api.js';
import { failureLine } from './writes.js';
/**
 * The typing and checks behind a wristband entry, for any screen to draw: `type` the digits, `next` checks the number
 * (refused outright if already in this race, else the shared warnings and the server's), and saves it when nothing is
 * odd; `fix` drops the warning and keeps the number to edit, and `keep` saves it with its warnings kept.
 */
export function useWristbandEntry(event:DayEvent,raceId:string|null,taken:readonly number[],onSave:(wristband:number,kept:boolean)=>Promise<unknown>) {
  const [current,setCurrent]=useState('');
  const [pending,setPending]=useState<WristbandWarning[]>([]);
  /** A number refused outright (already in this race): only Fix number. */
  const [refused,setRefused]=useState('');
  const [error,setError]=useState('');
  const [checking,setChecking]=useState(false);
  async function save(kept:boolean) {
    if(await onSave(Number(current),kept)) {setCurrent('');setPending([]);}
  }
  async function next() {
    if(!current) return;
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
    } catch(failure) {setError(failureLine(failure));}
    finally {setChecking(false);}
  }
  return {current,pending,refused,error,checking,held:pending.length>0 || !!refused,
    type:(digits:string)=>{setCurrent(digits);setError('');},next,
    fix:()=>{setPending([]);setRefused('');},keep:()=>save(true)};
}
