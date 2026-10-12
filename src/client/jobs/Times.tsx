import { stageLocked } from '../../shared/stage-lock.js';
import { ClashNotice } from './ClashNotice.js';
import { hasClash } from '../../shared/race-clashes.js';
import { useState } from 'react';
import { useRaceJob } from './useJobData.js';
import { api } from '../api.js';
import { raceLabel,type RaceRead,type TimesRead } from '../../shared/races.js';
import { digitsForTime,formatTimeDigits,parseTimeDigits,timesOutOfOrder } from '../../shared/time-entry.js';
import { raceRecording } from '../../shared/recording.js';
import './jobs.css';
type Draft={race:RaceRead;slots:Array<string|null>;index:number;step:'entry'|'check';replace:boolean;warning:boolean};
const ordinal=(number:number)=>`${number}${number===1?'st':number===2?'nd':number===3?'rd':'th'}`;
function fromRace(race:RaceRead):Draft {
  const recorded=race.parts.times.value?.places;
  const slots=Array.from({length:Math.max(race.parts.runners.value?.length||0,recorded?.length||0)},(_,index)=>{
    const time=recorded?.[index];
    return time===null?null:time!==undefined?digitsForTime(time):race.parts.finish.value && index>=race.parts.finish.value.order.length?null:'';
  });
  const first=slots.indexOf('');
  return {race,slots,index:Math.max(first,0),step:first<0?'check':'entry',replace:true,warning:false};
}
function restore(key:string):Draft|null {
  try {const value=JSON.parse(localStorage.getItem(key)||'null');if(value?.race?.id && Array.isArray(value.slots) && ['entry','check'].includes(value.step)) return value;}
  catch { /* A broken draft must not stop opening the job. */ }
  return null;
}
export function Times({dayId}:{dayId:string}) {
  const {draft,setDraft,data,choosing,setChoosing,busy,setBusy,error,setError,readError,updated,refresh,open:openRace}=useRaceJob<TimesRead,Draft>(dayId,'times',restore,fromRace);
  const [message,setMessage]=useState('');
  function change(next:Draft) {setDraft(next);setError('');setMessage('');}
  async function open(race:RaceRead) {await openRace(race);setMessage('');}
  function edit(index:number) {if(draft) change({...draft,index,step:'entry',replace:true,warning:false});}
  function digit(value:string) {
    if(!draft) return;const slots=[...draft.slots];slots[draft.index]=draft.replace?value:(slots[draft.index]||'')+value;change({...draft,slots,replace:false});
  }
  function advance() {
    if(!draft) return;
    const next=draft.index+1;
    change({...draft,index:next,step:next>=draft.slots.length || draft.slots[next]===null?'check':'entry',replace:true,warning:false});
  }
  function next() {
    if(!draft) return;
    if(parseTimeDigits(draft.slots[draft.index]||'')===null) {setError('Enter a time in digits');return;}
    if(timesOutOfOrder(draft.slots.map(value=>value===null || value===''?null:parseTimeDigits(value)))) change({...draft,warning:true});else advance();
  }
  function noMoreFinishers() {if(draft) change({...draft,slots:draft.slots.map((slot,index)=>index>=draft.index?null:slot),step:'check',warning:false});}
  function undoNoFinisher() {
    if(!draft) return;const index=draft.slots.indexOf(null);if(index<0) return;
    const slots=[...draft.slots];slots[index]='';change({...draft,slots,index,step:'entry',replace:true,warning:false});
  }
  async function save() {
    if(!draft) return;
    const blank=draft.slots.findIndex(value=>value!==null && parseTimeDigits(value)===null);
    if(blank>=0) {edit(blank);setError('Enter a time or No finisher for every place');return;}
    setBusy(true);setError('');setMessage('');
    try {
      const response=await api<{race:RaceRead}>(`races/${draft.race.id}/times`,{baseVersion:draft.race.parts.times.version,places:draft.slots.map(value=>value===null?null:parseTimeDigits(value))});
      setDraft(fromRace(response.race));setMessage(hasClash(response.race)?'':'Saved');void refresh();
    } catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  if(!data) return <section><h1>Times</h1><p>{readError || 'Opening…'}</p><button onClick={()=>void refresh()}>Refresh Times</button></section>;
  const latest=draft?[...data.waiting,...data.recent].find(race=>race.id===draft.race.id)||draft.race:null;
  const places=draft?.slots.map(value=>value===null || value===''?null:parseTimeDigits(value))||[];
  const complete=draft?.slots.every(value=>value===null || parseTimeDigits(value)!==null);
  const mismatch=latest?raceRecording({...latest,parts:{...latest.parts,times:complete?{version:latest.parts.times.version,value:{places,outOfOrder:timesOutOfOrder(places)}}:latest.parts.times}}).countMismatch:null;
  const firstNoFinisher=draft?.slots.indexOf(null)??-1;
  const locked=!!draft && stageLocked(draft.race,data.completedStages);
  return <section className="race-job"><h1>Times</h1><ClashNotice race={latest}/>{readError && <p role="alert">{readError}</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button disabled={busy} onClick={()=>setChoosing(!choosing)}>Other race</button>
    {choosing || !draft ? <div><h2>Also waiting</h2>{data.waiting.length===0 && <p>No races waiting</p>}<div className="job-actions">{data.waiting.map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{race.event.name} {race.event.section} ({race.event.code}) · {raceLabel(race)}{race.recording.countMismatch && <small> · Finishers and times don't agree</small>}</button>)}</div><h2>Recent races</h2><div className="job-actions">{data.recent.filter(race=>!data.waiting.some(item=>item.id===race.id)).map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{race.event.name} {race.event.section} ({race.event.code}) · {raceLabel(race)}</button>)}</div>{draft && <button onClick={()=>setChoosing(false)}>Back to this race</button>}</div> : <fieldset className="stage-job-fields" disabled={locked}>
      {locked && <p role="status">Stage complete - ask a lead</p>}
      <p className="race-header">{draft.race.event.name} {draft.race.event.section} ({draft.race.event.code}) · {raceLabel(draft.race)} · {draft.race.parts.runners.value?.length||0} runners · checked in {new Date(draft.race.checkedInAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
      {mismatch && <p className="count-mismatch" role="alert">{mismatch}</p>}
      {draft.step==='entry' ? <><h2>{ordinal(draft.index+1)} place time?</h2><div className="place-slots" aria-label="Times by place">{draft.slots.map((slot,index)=><button disabled={busy || slot===null} className={index===draft.index?'current-place':''} key={index} aria-label={`${ordinal(index+1)} place${slot===null?' · No finisher':slot?` · ${formatTimeDigits(slot)}`:''}`} onClick={()=>edit(index)}>{ordinal(index+1)}<small>{slot===null?'No finisher':slot?formatTimeDigits(slot):'—'}</small></button>)}</div>
        <output className={draft.warning?'warning-number':''} aria-label="Place time">{formatTimeDigits(draft.slots[draft.index]||'')}</output><p className="time-example">Type digits only: 1234 → 12.34 · 13240 → 1:32.40</p>
        {draft.warning ? <div className="number-warning" role="alert"><p>A later place is faster than an earlier one - check the times</p><div className="job-actions"><button onClick={()=>change({...draft,warning:false,replace:true})}>Fix time</button><button onClick={advance}>Keep</button></div></div> : <><div className="number-keypad">{['1','2','3','4','5','6','7','8','9'].map(value=><button disabled={busy} key={value} onClick={()=>digit(value)}>{value}</button>)}<button disabled={busy} aria-label="Delete last digit" onClick={()=>{const slots=[...draft.slots];slots[draft.index]=(slots[draft.index]||'').slice(0,-1);change({...draft,slots,replace:false});}}>⌫</button><button disabled={busy} onClick={()=>digit('0')}>0</button><button disabled={busy} onClick={next}>Next</button></div><div className="job-actions"><button disabled={busy || draft.index===0} onClick={()=>edit(draft.index-1)}>Back</button><button disabled={busy} onClick={noMoreFinishers}>No more finishers</button></div></>}
      </> : <><h2>Check the times</h2>{draft.slots.length===0 && <p>No runners remain in this race. Save the empty times record.</p>}<div className="job-actions time-review">{draft.slots.map((slot,index)=>slot===null?<p key={index}>{ordinal(index+1)} place · No finisher</p>:<button disabled={busy} key={index} onClick={()=>edit(index)}>{ordinal(index+1)} place · {slot?formatTimeDigits(slot):'Time needed'}</button>)}</div>
        {timesOutOfOrder(places) && <p className="number-warning">Times out of order - kept for a lead to check</p>}
        <div className="job-actions">{firstNoFinisher>=0 && <button disabled={busy} onClick={undoNoFinisher}>{ordinal(firstNoFinisher+1)} did finish</button>}<button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button></div>
      </>}
    </fieldset>}
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Times</button></footer>
  </section>;
}
