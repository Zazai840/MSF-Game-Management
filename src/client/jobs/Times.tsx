import { stageLocked } from '../../shared/stage-lock.js';
import { ClashNotice } from './ClashNotice.js';
import { useState } from 'react';
import { useRaceJob } from './useJobData.js';
import { api } from '../api.js';
import { raceLine,raceName,racePickerLabel,raceSummary,type RaceRead,type TimesRead } from '../../shared/races.js';
import { digitsForTime,formatTimeDigits,parseTimeDigits,timesOutOfOrder } from '../../shared/time-entry.js';
import { raceRecording } from '../../shared/recording.js';
import { ordinal } from '../../shared/ordinal.js';
import { wrongTimes,wrongTimesBanner } from '../../shared/wrong-times.js';
import { Trail,type TrailStep } from '../flow/Trail.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { ActionBar } from '../flow/ActionBar.js';
import { Saved } from '../flow/Saved.js';
import { TimeCount,WrongTimeIcon,WrongTimeReason,wrongTimesByPlace } from '../flow/WrongTime.js';
import './jobs.css';
import { clock } from '../../shared/clock.js';
type Draft={race:RaceRead;slots:Array<string|null>;index:number;step:'entry'|'check';
  /** A Fix time / Keep choice is waiting for the place just typed. */
  warning:boolean;
  /** Places whose wrong time the timer chose to keep as typed (v1's Keep). */
  keptWrong:number[];
  /** The place is being retyped from the check screen, so Next goes back there. */
  fromCheck?:boolean};
const placesOf=(slots:Array<string|null>)=>slots.map(value=>value===null || value===''?null:parseTimeDigits(value));
const wrongIndexes=(slots:Array<string|null>)=>wrongTimes(placesOf(slots)).map(wrong=>wrong.index);
function fromRace(race:RaceRead):Draft {
  const recorded=race.parts.times.value?.places;
  const slots=Array.from({length:Math.max(race.parts.runners.value?.length||0,recorded?.length||0)},(_,index)=>{
    const time=recorded?.[index];
    return time===null?null:time!==undefined?digitsForTime(time):race.parts.finish.value && index>=race.parts.finish.value.order.length?null:'';
  });
  const first=slots.indexOf('');
  // Saved times were already kept by whoever saved them.
  return {race,slots,index:Math.max(first,0),step:first<0?'check':'entry',warning:false,keptWrong:wrongIndexes(slots)};
}
function restore(key:string):Draft|null {
  try {
    const value=JSON.parse(localStorage.getItem(key)||'null');
    // Drafts from before Keep was remembered only reached a wrong time through Keep.
    if(value?.race?.id && Array.isArray(value.slots) && ['entry','check'].includes(value.step)) return {...value,warning:!!value.warning,keptWrong:Array.isArray(value.keptWrong)?value.keptWrong:wrongIndexes(value.slots)};
  }
  catch { /* A broken draft must not stop opening the job. */ }
  return null;
}
const timesText=(count:number)=>`${count} ${count===1?'time':'times'}`;
export function Times({dayId,onHome}:{dayId:string;onHome:()=>void}) {
  const {draft,setDraft,data,choosing,setChoosing,busy,setBusy,error,setError,readError,updated,refresh,open:openRace}=useRaceJob<TimesRead,Draft>(dayId,'times',restore,fromRace);
  const [message,setMessage]=useState('');
  const [saved,setSaved]=useState<RaceRead|null>(null);
  function change(next:Draft) {setDraft(next);setError('');setMessage('');}
  async function open(race:RaceRead) {await openRace(race);setMessage('');setSaved(null);}
  function edit(index:number,fromCheck=false) {if(draft) change({...draft,index,step:'entry',warning:false,fromCheck});}
  function type(digits:string) {
    if(!draft) return;const slots=[...draft.slots];slots[draft.index]=digits;change({...draft,slots});
  }
  function advance(next:Draft) {
    const index=next.index+1;
    change({...next,index,step:index>=next.slots.length || next.slots[index]===null?'check':'entry',warning:false,fromCheck:false});
  }
  function next() {
    if(!draft) return;
    if(parseTimeDigits(draft.slots[draft.index]||'')===null) {setError('Enter a time in digits');return;}
    const wrong=wrongIndexes(draft.slots);
    // A retyped time is new, so it is no longer kept; the check screen asks again.
    const keptWrong=draft.keptWrong.filter(index=>index!==draft.index && wrong.includes(index));
    if(draft.fromCheck) {change({...draft,keptWrong,step:'check',warning:false,fromCheck:false});return;}
    if(wrong.some(index=>!keptWrong.includes(index))) change({...draft,keptWrong,warning:true});
    else advance({...draft,keptWrong});
  }
  function keep() {if(draft) advance({...draft,keptWrong:wrongIndexes(draft.slots)});}
  function fixTime() {if(!draft) return;const slots=[...draft.slots];slots[draft.index]='';change({...draft,slots,warning:false});}
  function noMoreFinishers() {if(draft) change({...draft,slots:draft.slots.map((slot,index)=>index>=draft.index?null:slot),step:'check',warning:false,fromCheck:false});}
  function undoNoFinisher() {
    if(!draft) return;const index=draft.slots.indexOf(null);if(index<0) return;
    const slots=[...draft.slots];slots[index]='';change({...draft,slots,index,step:'entry',warning:false,fromCheck:false});
  }
  async function save() {
    if(!draft) return;
    const blank=draft.slots.findIndex(value=>value!==null && parseTimeDigits(value)===null);
    if(blank>=0) {edit(blank);setError('Enter a time or No finisher for every place');return;}
    setBusy(true);setError('');setMessage('');
    try {
      const response=await api<{race:RaceRead}>(`races/${draft.race.id}/times`,{baseVersion:draft.race.parts.times.version,places:placesOf(draft.slots)});
      setDraft(fromRace(response.race));setSaved(response.race);void refresh();
    } catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  function nextRace() {
    const following=data?.waiting.find(race=>race.id!==saved?.id);
    setSaved(null);
    if(following) void open(following);else {setDraft(null);setChoosing(true);}
  }
  const home:TrailStep={label:'Home',onSelect:onHome};
  if(!data) return <section className="race-job"><Trail steps={[home,{label:'Times'}]}/><h1>Times</h1><p>{readError || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh</button></section>;
  const alerts=<>{readError && <p role="alert">{readError}</p>}{error && message!=='Not saved - tap Save again' && <p role="alert">{error}</p>}</>;
  const latestOf=(race:RaceRead)=>[...data.waiting,...data.recent].find(item=>item.id===race.id)||race;
  if(saved) {
    const latest=latestOf(saved);
    return <section className="race-job"><Saved race={raceSummary(saved,timesText(saved.parts.times.value?.places.filter(time=>time!==null).length||0))} nextLabel="Next race" onNext={nextRace} onHome={onHome}>
      <ClashNotice race={latest}/>{latest.recording.countMismatch && <p className="warning-box">{latest.recording.countMismatch}</p>}
      <button disabled={busy} onClick={()=>setSaved(null)}>Change times</button>
    </Saved></section>;
  }
  const timesStep:TrailStep={label:'Times',onSelect:()=>setChoosing(true)};
  if(choosing || !draft) return <section className="race-job"><Trail steps={[home,{label:'Times'}]}/>{alerts}
    <h1>Which race is it?</h1>
    {draft && <button className="button-secondary carry-on" disabled={busy} onClick={()=>setChoosing(false)}>Carry on with {raceName(draft.race)}</button>}
    <h3>Waiting for times</h3>{data.waiting.length===0 && <p>No races waiting</p>}<div className="job-choices">{data.waiting.map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{racePickerLabel(race)}{race.recording.countMismatch && <small className="choice-note"> · Finishers and times don't agree</small>}</button>)}</div>
    <h3>Recent races</h3><div className="job-choices">{data.recent.filter(race=>!data.waiting.some(item=>item.id===race.id)).map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{racePickerLabel(race)}</button>)}</div>
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh</button></footer>
  </section>;
  const latest=latestOf(draft.race);
  const places=placesOf(draft.slots);
  const complete=draft.slots.every(value=>value===null || parseTimeDigits(value)!==null);
  const mismatch=raceRecording({...latest,parts:{...latest.parts,times:complete?{version:latest.parts.times.version,value:{places,outOfOrder:timesOutOfOrder(places)}}:latest.parts.times}}).countMismatch;
  const wrong=wrongTimesByPlace(places);
  const unkept=[...wrong.values()].filter(item=>!draft.keptWrong.includes(item.index));
  const firstNoFinisher=draft.slots.indexOf(null);
  const locked=stageLocked(draft.race,data.completedStages);
  const raceStep:TrailStep={label:raceName(draft.race),onSelect:()=>setChoosing(true)};
  const lastTimed=draft.slots.reduce((last,slot,index)=>slot===null?last:index,-1);
  const checkStep:TrailStep={label:'Check',onSelect:()=>change({...draft,step:'check',warning:false,fromCheck:false})};
  const trail:TrailStep[]=draft.step==='entry'?[home,timesStep,raceStep,...(draft.fromCheck?[checkStep]:[]),{label:`${ordinal(draft.index+1)} place`}]
    :[home,timesStep,raceStep,...(lastTimed>=0?[{label:`${ordinal(lastTimed+1)} place`,onSelect:()=>edit(lastTimed)}]:[]),{label:'Check'}];
  const runners=draft.race.parts.runners.value?.length||0;
  const raceHeading=<p className="race-line">{raceLine(draft.race,runners)} · checked in {clock(draft.race.checkedInAt)}</p>;
  const notSaved='Not saved - tap Save again';
  const failedSave=message===notSaved && <div className="warning-box save-failed"><p role="status">{notSaved}</p>{error && <p role="alert">{error}</p>}</div>;
  const timeLabel=(index:number,slot:string|null)=>`${ordinal(index+1)} place · ${slot===null?'No finisher':slot?formatTimeDigits(slot):'Time needed'}${wrong.get(index)?` · ${wrong.get(index)!.reason}`:''}`;
  const typed=draft.slots[draft.index]||'';
  return <section className="race-job"><Trail steps={trail}/><ClashNotice race={latest}/>{alerts}
    {locked && <p role="status" className="warning-box">Stage complete - ask a lead</p>}
    {mismatch && <p className="count-mismatch" role="alert">{mismatch}</p>}
    <fieldset className="stage-job-fields" disabled={locked}>
    {draft.step==='entry' ? <div className="times-entry">
      <div className="job-heading">{raceHeading}<h1>{ordinal(draft.index+1)} place time?</h1></div>
      <div className="place-chips" role="group" aria-label="Times by place">{draft.slots.map((slot,index)=><button type="button" disabled={busy || slot===null || draft.warning} key={index}
        className={[index===draft.index?'current-place':'',wrong.get(index)?'time-wrong':''].join(' ').trim() || undefined} aria-label={timeLabel(index,slot)} onClick={()=>edit(index,draft.fromCheck)}>
        <span className="chip-place">{ordinal(index+1)}</span><span className="chip-time">{slot===null?'No finisher':slot?formatTimeDigits(slot):'-'}</span><WrongTimeReason wrong={wrong.get(index)}/></button>)}</div>
      <NumberEntry label="Place time" placeholder="Digits only, e.g. 1234" value={typed} held={draft.warning} busy={busy} onChange={type} onNext={next} selectKey={`${draft.race.id}:${draft.index}:${draft.fromCheck?'check':'entry'}`}
        display={<p className="time-shows">Shows as <strong>{formatTimeDigits(typed)}</strong></p>}
        extraAction={<><button className="button-secondary" disabled={busy || draft.warning || draft.index===0} onClick={()=>edit(draft.index-1,draft.fromCheck)}>Back</button><button className="button-secondary" disabled={busy || draft.warning} onClick={noMoreFinishers}>No more finishers</button></>}/>
      {draft.warning && <div className="warning-box" role="alert">
        <p>{wrongTimesBanner(wrong.get(draft.index) && !draft.keptWrong.includes(draft.index)?[wrong.get(draft.index)!]:unkept)} Fix it, or keep it if the timer really shows that.</p>
        <div className="warning-actions"><button onClick={fixTime}>Fix time</button><button className="button-secondary" onClick={keep}>Keep</button></div>
      </div>}
      <p className="job-hint">Type digits only: 1234 shows as 12.34, 13240 as 1:32.40. Tap a place to retype it.</p>
    </div> : <div className="times-check">
      <div className="job-heading">{raceHeading}<div className="times-check-title"><h1>Check the times</h1><TimeCount times={places.filter(time=>time!==null).length} finishers={latest.parts.finish.value?.order.length??null} mismatch={mismatch}/></div></div>
      {draft.slots.length===0 && <p>No runners remain in this race. Save the empty times record.</p>}
      {unkept.length>0 ? <div className="warning-box" role="alert"><p>{wrongTimesBanner(unkept)} Tap it to retype, or keep it if the timer really shows that.</p><button className="keep-as-is" disabled={busy} onClick={()=>change({...draft,keptWrong:[...wrong.keys()]})}>Keep as it is</button></div>
        : wrong.size>0 && <p className="calm-note">Kept as typed. A zone lead will check it.</p>}
      <ol className="time-rows" aria-label="Times">{draft.slots.map((slot,index)=><li key={index}>{slot===null
        ?<div className="time-row time-row-none"><span className="time-place">{ordinal(index+1)}</span><span className="time-value">No finisher</span></div>
        :<button type="button" disabled={busy} className={wrong.get(index)?'time-row time-wrong':'time-row'} aria-label={timeLabel(index,slot)} onClick={()=>edit(index,true)}>
          <span className="time-place">{ordinal(index+1)}</span><span className="time-value"><strong>{slot?formatTimeDigits(slot):'Time needed'}</strong><WrongTimeReason wrong={wrong.get(index)}/></span>
          {wrong.get(index) && <WrongTimeIcon/>}<svg className="time-edit" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>
        </button>}</li>)}</ol>
      <p className="job-hint">Tap a time to retype it.</p>
      {failedSave}
      <ActionBar stacked><button disabled={busy || locked || unkept.length>0} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button>{firstNoFinisher>=0 && <button className="button-secondary" disabled={busy || locked} onClick={undoNoFinisher}>{ordinal(firstNoFinisher+1)} did finish</button>}</ActionBar>
    </div>}
    </fieldset>
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh</button></footer>
  </section>;
}
