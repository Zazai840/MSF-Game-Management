import { stageLocked } from '../../shared/stage-lock.js';
import { ClashNotice } from './ClashNotice.js';
import { hasClash } from '../../shared/race-clashes.js';
import { useState } from 'react';
import { useJobData,useJobDraft } from './useJobData.js';
import { api } from '../api.js';
import { raceLabel,racePickerLabel,raceSummary,runnersText,type RaceRead,type StartLineRead } from '../../shared/races.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { plainWristbandWarning,wristbandWarnings,type WristbandWarning } from '../../shared/wristband-checks.js';
import { Trail,type TrailStep } from '../flow/Trail.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { ActionBar } from '../flow/ActionBar.js';
import { Saved } from '../flow/Saved.js';
import './jobs.css';
type Step='pick'|'section'|'entry'|'check'|'presence'|'presence-check';
type Draft={step:Step;final?:RaceRead;absent?:string[];family:string;eventCode:string;runners:number[];current:string;raceId?:string;
  /** "Heat 2" once the race exists, so the trail and header name it. */
  raceLabel?:string;baseVersion:number;requestId:string;keptWarnings:number[];warnings:Record<string,WristbandWarning[]>;pendingWarnings:WristbandWarning[];
  /** A number refused outright (already in this race): only Fix number. */
  refused?:string};
function emptyDraft():Draft {
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return {step:'pick',family:'',eventCode:'',runners:[],current:'',baseVersion:0,requestId:Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join(''),keptWarnings:[],warnings:{},pendingWarnings:[]};
}
function restore(key:string):Draft {
  try {const value=JSON.parse(localStorage.getItem(key)||'null');if(value && ['pick','section','entry','check','presence','presence-check'].includes(value.step) && Array.isArray(value.runners) && typeof value.current==='string' && typeof value.requestId==='string') return {...value,keptWarnings:value.keptWarnings||[],warnings:value.warnings||{},pendingWarnings:value.pendingWarnings||[]};}
  catch { /* A broken draft must not stop a phone joining the job. */ }
  return emptyDraft();
}
export function StartLine({dayId,onHome}:{dayId:string;onHome:()=>void}) {
  const [draft,setDraft]=useJobDraft(dayId,'start-line',restore);
  const {data,readError,updated,refresh}=useJobData<StartLineRead>('jobs/start-line');
  const [saved,setSaved]=useState<RaceRead|null>(null);
  const [deleting,setDeleting]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  function change(next:Draft) {setDraft(next);setError('');setMessage('');}
  function goTo(step:Step) {change({...draft,step});}
  function reset() {change(emptyDraft());setSaved(null);setDeleting(false);void refresh();}
  /** Choosing the race already being typed carries on with it, so going back never loses entries. */
  function chooseEvent(code:string) {
    if(code===draft.eventCode) {goTo(draft.final?'presence':'entry');return;}
    change({...emptyDraft(),step:'entry',family:draft.family,eventCode:code});
  }
  async function open(race:RaceRead) {
    // A final always reloads: its line-up may have been rebuilt since.
    if(race.id===draft.raceId && !saved && !draft.final) {goTo('entry');return;}
    try {
      const latest=await api<RaceRead>(`races/${race.id}`);
      const base={...emptyDraft(),family:latest.event.name,eventCode:latest.event.code,raceId:latest.id,raceLabel:raceLabel(latest),baseVersion:latest.parts.runners.version};
      if(!latest.stageComplete && latest.final?.hasRun) {setError('The final has already run - ask a lead');return;}
      if(latest.final) {change({...base,step:'presence',final:latest,absent:latest.final.entries.filter(entry=>entry.absent).map(entry=>entry.finalEntryId)});setSaved(null);return;}
      if(!latest.stageComplete && latest.parts.finish.value!==null) {setError('Finishing order already recorded - ask a lead');return;}
      const runners=latest.parts.runners.value||[];
      change({...base,step:'entry',runners:runners.map(runner=>runner.wristband),keptWarnings:runners.filter(runner=>runner.warnings?.some(warning=>warning.kept)).map(runner=>runner.wristband),warnings:Object.fromEntries(runners.filter(runner=>runner.warnings?.length).map(runner=>[runner.wristband,runner.warnings!]))});
      setSaved(null);
    } catch(error) {setError(error instanceof Error?error.message:'Could not connect');}
  }
  function acceptNumber(warnings:WristbandWarning[]=[]) {
    const number=Number(draft.current);
    change({...draft,runners:[...draft.runners,number],current:'',pendingWarnings:[],refused:undefined,keptWarnings:warnings.length?[...draft.keptWarnings,number]:draft.keptWarnings,warnings:warnings.length?{...draft.warnings,[number]:warnings}:draft.warnings});
  }
  function removeRunner(number:number) {
    const warnings={...draft.warnings};delete warnings[number];
    change({...draft,runners:draft.runners.filter(value=>value!==number),keptWarnings:draft.keptWarnings.filter(value=>value!==number),warnings});
  }
  async function next() {
    const number=Number(draft.current);
    if(draft.runners.includes(number)) {change({...draft,refused:`${number} is already in this race. Check the wristband.`});return;}
    const refusal=runnerListRefusal([...draft.runners,number]);
    if(refusal) {setError(refusal);return;}
    const selected=data?.events.find(event=>event.code===draft.eventCode);
    if(!selected) {setError('Choose an event and section');return;}
    setBusy(true);setError('');
    try {
      const local=wristbandWarnings(number,selected.section);
      const response=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:draft.eventCode,wristband:number,...(draft.raceId?{raceId:draft.raceId}:{})});
      const warnings=[...local,...response.warnings.filter(warning=>!local.some(item=>item.kind===warning.kind))];
      if(warnings.length) change({...draft,pendingWarnings:warnings});
      else acceptNumber();
    } catch(error) {setError(error instanceof Error?error.message:'Could not check this number - tap Next again');}
    finally {setBusy(false);}
  }
  async function save() {
    setBusy(true);setError('');setMessage('');
    try {
      const response=draft.final?await api<{status:string;race:RaceRead}>(`races/${draft.raceId}/presence`,{baseVersion:draft.baseVersion,generation:draft.final.final!.generation,lineup:draft.final.final!.entries.map(entry=>entry.finalEntryId),absent:draft.absent||[]}):await api<{status:string;race:RaceRead}>(draft.raceId?`races/${draft.raceId}/runners`:'races/check-in',draft.raceId?{baseVersion:draft.baseVersion,runners:draft.runners,keptWarnings:draft.keptWarnings}:{eventCode:draft.eventCode,runners:draft.runners,requestId:draft.requestId,keptWarnings:draft.keptWarnings});
      setDraft(emptyDraft());setSaved(response.race);void refresh();
    } catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  async function remove(permanent:boolean) {
    if(!saved) return;setBusy(true);setError('');
    try {await api(`races/${saved.id}/delete`,{permanent});reset();setMessage('Saved');}
    catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  const home:TrailStep={label:'Home',onSelect:onHome};
  if(!data) return <section className="race-job"><Trail steps={[home,{label:'Check in runners'}]}/><h1>Check in runners</h1><p>{readError || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh Start line</button></section>;
  const alerts=<>{readError && <p role="alert">{readError}</p>}{error && <p role="alert">{error}</p>}</>;
  const notSaved='Not saved - tap Save again';
  /** A failed save shows beside Save, in one amber box with the reason. */
  const failedSave=message===notSaved && <div className="warning-box save-failed"><p role="status">{notSaved}</p>{error && <p role="alert">{error}</p>}</div>;
  if(saved) {
    const locked=stageLocked(saved,data.completedStages);
    const race=[...data.waiting,...data.recent].find(race=>race.id===saved.id)||saved;
    return <section className="race-job"><Saved race={raceSummary(saved,runnersText(saved.parts.runners.value?.length||0))} nextLabel="Check in the next race" onNext={reset} onHome={onHome}>
      {hasClash(race) && <ClashNotice race={race}/>}
      {alerts}{message && <p role="status">{message}</p>}{locked && <p role="status">Stage complete - ask a lead</p>}
      {deleting ? <><p>Delete {raceLabel(saved)}?</p><button disabled={busy||locked} onClick={()=>void remove(false)}>Move to Deleted races</button><button disabled={busy||locked} onClick={()=>void remove(true)}>Delete permanently</button><button disabled={busy} onClick={()=>setDeleting(false)}>Keep this race</button></>
        : <><button disabled={busy||locked} onClick={()=>void open(saved)}>{saved.kind==='final'?'Check attendance':'Edit runners'}</button>{saved.kind!=='final' && <button disabled={busy||locked} onClick={()=>setDeleting(true)}>Delete this race</button>}</>}
    </Saved></section>;
  }
  const event=data.events.find(event=>event.code===draft.eventCode);
  const choosing=draft.step==='pick' || draft.step==='section';
  // Picking a race is never locked: only the chosen race's own steps are.
  const locked=!choosing && (draft.final?stageLocked(draft.final,data.completedStages)||!data.completedStages.some(item=>item.eventCode===draft.eventCode&&item.stage==='heats'):data.completedStages.some(item=>item.eventCode===draft.eventCode && item.stage!=='final'));
  const family=draft.family||event?.name||'';
  const raceName=`${event?.section||draft.final?.event.section||''}${draft.raceLabel?` · ${draft.raceLabel}`:''}`;
  const pickStep:TrailStep={label:'Check in runners',onSelect:()=>goTo('pick')};
  const raceSteps:TrailStep[]=[home,pickStep,{label:family,onSelect:()=>change({...draft,step:'section',family})},{label:raceName,onSelect:()=>goTo('pick')}];
  const runnersStep:TrailStep={label:`Runners (${draft.runners.length})`,onSelect:()=>goTo('entry')};
  const attendanceStep:TrailStep={label:'Attendance',onSelect:()=>goTo('presence')};
  const trail:TrailStep[]=draft.step==='pick'?[home,{label:'Check in runners'}]:draft.step==='section'?[home,pickStep,{label:draft.family}]
    :draft.step==='entry'?[...raceSteps,runnersStep]:draft.step==='check'?[...raceSteps,runnersStep,{label:'Check'}]
    :draft.step==='presence'?[...raceSteps,attendanceStep]:[...raceSteps,attendanceStep,{label:'Check'}];
  const raceLine=<p className="race-line">{[family,event?.section,draft.raceLabel].filter(Boolean).join(' · ')}</p>;
  const held=draft.pendingWarnings.length>0 || !!draft.refused;
  const pendingNumber=Number(draft.current);
  return <section className="race-job"><Trail steps={trail}/>
    {draft.step!=='pick' && draft.step!=='section' && <ClashNotice race={[...data.waiting,...data.recent].find(race=>race.id===draft.raceId)}/>}
    {!failedSave && <>{alerts}{message && <p role="status" className="calm-note">{message}</p>}</>}
    {locked && <p role="status" className="warning-box">Stage complete - ask a lead</p>}
    <fieldset className="stage-job-fields" disabled={locked}>
    {draft.step==='pick' ? <div>
      <h1>Which race is it?</h1>
      {draft.eventCode && (draft.runners.length>0 || draft.current || draft.final) && <button className="button-secondary carry-on" onClick={()=>goTo(draft.final?'presence':'entry')}>Carry on with {family} {raceName}{draft.runners.length?` · ${runnersText(draft.runners.length)}`:''}</button>}
      {data.waiting.length>0 && <><h3>Already at the start line</h3><div className="job-choices">{data.waiting.map(race=><button key={race.id} onClick={()=>void open(race)}>{racePickerLabel(race)}</button>)}</div></>}
      {!data.eventsConfirmed && <p>Ask the scoring team to confirm the event list</p>}<h3>Check in a new race</h3><div className="job-choices">{[...new Set(data.events.map(event=>event.name))].map(name=><button key={name} onClick={()=>change({...draft,step:'section',family:name})}>{name}</button>)}</div>
    </div> : draft.step==='section' ? <div><h1>{draft.family}: which section?</h1><div className="job-choices">{data.events.filter(event=>event.name===draft.family).map(event=><button key={event.id} onClick={()=>chooseEvent(event.code)}>{event.section} · {event.code}</button>)}</div></div>
    : draft.final ? <div className="final-attendance">{raceLine}{draft.step==='presence'?<><h1>Is everyone here?</h1><p>Tap anyone absent.</p><div className="job-choices">{draft.final.final!.entries.map(entry=><button disabled={busy} key={entry.finalEntryId} aria-pressed={(draft.absent||[]).includes(entry.finalEntryId)} onClick={()=>change({...draft,absent:(draft.absent||[]).includes(entry.finalEntryId)?draft.absent!.filter(id=>id!==entry.finalEntryId):[...(draft.absent||[]),entry.finalEntryId]})}>{entry.wristband} · {(draft.absent||[]).includes(entry.finalEntryId)?'Absent':'Here'}</button>)}</div><ActionBar><button disabled={busy||locked} onClick={()=>goTo('presence-check')}>Check attendance</button></ActionBar></>
      :<><h1>Check attendance</h1><ol className="runner-rows" aria-label="Attendance">{draft.final.final!.entries.map((entry,index)=><li key={entry.finalEntryId}><span className="row-label">Runner {index+1}</span><strong>{entry.wristband}</strong><span className="row-note">{(draft.absent||[]).includes(entry.finalEntryId)?'Absent':'Here'}</span></li>)}</ol>{failedSave}<ActionBar stacked><button disabled={busy||locked} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button><button className="button-secondary" disabled={busy||locked} onClick={()=>goTo('presence')}>Change attendance</button></ActionBar></>}</div>
    : draft.step==='entry' ? <div className="check-in-entry">
      <div className="job-heading">{raceLine}<h1>Runner {draft.runners.length+1}: wristband number?</h1></div>
      {draft.runners.length>0 && <div className="runner-chips">{draft.runners.map(number=><button disabled={busy || held} className="chip" key={number} aria-label={`Remove runner ${number}`} onClick={()=>removeRunner(number)}>{draft.warnings[number]?.length?<span className="kept-dot" aria-hidden="true"/>:null}{number}<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg></button>)}</div>}
      <NumberEntry label="Wristband number" placeholder="e.g. 205" value={draft.current} held={held} busy={busy} onChange={current=>change({...draft,current})} onNext={()=>void next()}
        extraAction={<button className="button-secondary" disabled={busy || held || draft.runners.length===0 || !!draft.current} onClick={()=>goTo('check')}>That's everyone</button>}/>
      {held && <div className="warning-box" role="alert">
        {draft.refused?<p>{draft.refused}</p>:draft.pendingWarnings.map(warning=><p key={warning.kind}>{event?plainWristbandWarning(warning,pendingNumber,event.section):warning.message}</p>)}
        <div className="warning-actions"><button onClick={()=>change({...draft,current:'',pendingWarnings:[],refused:undefined})}>Fix number</button>{!draft.refused && <button className="button-secondary" onClick={()=>acceptNumber(draft.pendingWarnings)}>Keep</button>}</div>
      </div>}
      {draft.runners.length>0 && <p className="job-hint">Tap a number to remove it.</p>}
    </div> : <div className="check-in-check">
      <div className="job-heading">{raceLine}<h1>Check the runners</h1><p className="job-sub">{runnersText(draft.runners.length)} lined up</p></div>
      <ol className="runner-rows" aria-label="Runners">{draft.runners.map((number,index)=><li key={number}><span className="row-label">Runner {index+1}</span><strong>{number}</strong>{draft.warnings[number]?.length?<small className="kept-pill">Kept - lead will check</small>:null}</li>)}</ol>
      {failedSave}
      <ActionBar stacked><button disabled={busy||locked} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button><button className="button-secondary" disabled={busy||locked} onClick={()=>goTo('entry')}>Add another runner</button></ActionBar>
    </div>}
    </fieldset>
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Start line</button></footer>
  </section>;
}
