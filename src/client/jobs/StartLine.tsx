import { stageLocked } from '../../shared/stage-lock.js';
import { ClashNotice } from './ClashNotice.js';
import { hasClash } from '../../shared/race-clashes.js';
import { useEffect,useState } from 'react';
import { api,phoneStorage } from '../api.js';
import { raceLabel,type RaceRead,type StartLineRead } from '../../shared/races.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import { wristbandWarnings,type WristbandWarning } from '../../shared/wristband-checks.js';
import './jobs.css';
type Draft={step:'pick'|'section'|'entry'|'check';family:string;eventCode:string;runners:number[];current:string;raceId?:string;baseVersion:number;requestId:string;keptWarnings:number[];warnings:Record<string,WristbandWarning[]>;pendingWarnings:WristbandWarning[]};
function emptyDraft():Draft {
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return {step:'pick',family:'',eventCode:'',runners:[],current:'',baseVersion:0,requestId:Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join(''),keptWarnings:[],warnings:{},pendingWarnings:[]};
}
function restore(key:string):Draft {
  try {const value=JSON.parse(localStorage.getItem(key)||'null');if(value && ['pick','section','entry','check'].includes(value.step) && Array.isArray(value.runners) && typeof value.current==='string' && typeof value.requestId==='string') return {...value,keptWarnings:value.keptWarnings||[],warnings:value.warnings||{},pendingWarnings:value.pendingWarnings||[]};}
  catch { /* A broken draft must not stop a phone joining the job. */ }
  return emptyDraft();
}
export function StartLine({dayId}:{dayId:string}) {
  const key=`msf:draft:${phoneStorage.token()}:${dayId}:start-line`;
  const [draft,setDraft]=useState<Draft>(()=>restore(key));
  const [data,setData]=useState<StartLineRead|null>(null);
  const [saved,setSaved]=useState<RaceRead|null>(null);
  const [deleting,setDeleting]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [readError,setReadError]=useState('');
  const [message,setMessage]=useState('');
  const [updated,setUpdated]=useState('');
  useEffect(()=>{localStorage.setItem(key,JSON.stringify(draft));},[draft,key]);
  async function refresh() {
    try {setData(await api<StartLineRead>('jobs/start-line'));setUpdated(new Date().toLocaleTimeString());setReadError('');}
    catch(error) {setReadError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[]);
  function change(next:Draft) {setDraft(next);setError('');setMessage('');}
  function reset() {change(emptyDraft());setSaved(null);setDeleting(false);void refresh();}
  async function open(race:RaceRead) {
    try {
      const latest=await api<RaceRead>(`races/${race.id}`);
      if(latest.stageComplete) {setSaved(latest);return;}
      if(latest.parts.finish.value!==null) {setError('Finishing order already recorded - ask a lead');return;}
      const runners=latest.parts.runners.value||[];
      change({...emptyDraft(),step:'entry',eventCode:latest.event.code,runners:runners.map(runner=>runner.wristband),raceId:latest.id,baseVersion:latest.parts.runners.version,keptWarnings:runners.filter(runner=>runner.warnings?.some(warning=>warning.kept)).map(runner=>runner.wristband),warnings:Object.fromEntries(runners.filter(runner=>runner.warnings?.length).map(runner=>[runner.wristband,runner.warnings!]))});
      setSaved(null);
    } catch(error) {setError(error instanceof Error?error.message:'Could not connect');}
  }
  function acceptNumber(warnings:WristbandWarning[]=[]) {
    const number=Number(draft.current);
    change({...draft,runners:[...draft.runners,number],current:'',pendingWarnings:[],keptWarnings:warnings.length?[...draft.keptWarnings,number]:draft.keptWarnings,warnings:warnings.length?{...draft.warnings,[number]:warnings}:draft.warnings});
  }
  function removeRunner(number:number) {
    const warnings={...draft.warnings};delete warnings[number];
    change({...draft,runners:draft.runners.filter(value=>value!==number),keptWarnings:draft.keptWarnings.filter(value=>value!==number),warnings});
  }
  async function next() {
    const number=Number(draft.current);
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
      const response=await api<{status:string;race:RaceRead}>(draft.raceId?`races/${draft.raceId}/runners`:'races/check-in',draft.raceId?{baseVersion:draft.baseVersion,runners:draft.runners,keptWarnings:draft.keptWarnings}:{eventCode:draft.eventCode,runners:draft.runners,requestId:draft.requestId,keptWarnings:draft.keptWarnings});
      localStorage.removeItem(key);setDraft(emptyDraft());setSaved(response.race);setMessage(hasClash(response.race)?'':'Saved');void refresh();
    } catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  async function remove(permanent:boolean) {
    if(!saved) return;setBusy(true);setError('');
    try {await api(`races/${saved.id}/delete`,{permanent});reset();setMessage('Saved');}
    catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  if(!data) return <section><h1>Start line</h1><p>{readError || 'Opening…'}</p><button onClick={()=>void refresh()}>Refresh Start line</button></section>;
  const event=data.events.find(event=>event.code===draft.eventCode);
  const locked=saved?stageLocked(saved,data.completedStages):data.completedStages.some(item=>item.eventCode===draft.eventCode && item.stage!=='final');
  return <section className="race-job"><h1>Start line</h1><ClashNotice race={[...data.waiting,...data.recent].find(race=>race.id===(saved?.id||draft.raceId))||saved}/>
    {readError && <p role="alert">{readError}</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {locked && <><p role="status">Stage complete - ask a lead</p><button onClick={reset}>Choose another race</button></>}
    <fieldset className="stage-job-fields" disabled={locked}>
    {saved ? <div><h2>{raceLabel(saved)} saved</h2><p>{saved.event.name} {saved.event.section} ({saved.event.code})</p><p>{saved.parts.runners.value?.map(runner=>runner.wristband).join(' · ')}</p>
      {deleting ? <div className="job-actions"><p>Delete {raceLabel(saved)}?</p><button disabled={busy} onClick={()=>void remove(false)}>Move to Deleted races</button><button disabled={busy} onClick={()=>void remove(true)}>Delete permanently</button><button disabled={busy} onClick={()=>setDeleting(false)}>Keep this race</button></div> : <div className="job-actions"><button onClick={()=>void open(saved)}>Edit runners</button><button onClick={()=>setDeleting(true)}>Delete this race</button><button onClick={reset}>Check in another race</button></div>}
    </div> : draft.step==='pick' ? <div><h2>Which race is it?</h2>
      {data.waiting.length>0 && <><h3>Already at the start line</h3><div className="job-actions">{data.waiting.map(race=><button key={race.id} onClick={()=>void open(race)}>{race.event.name} {race.event.section} ({race.event.code}) · {raceLabel(race)}</button>)}</div></>}
      {!data.eventsConfirmed ? <p>Ask the scoring team to confirm the event list</p> : <><h3>Check in a new race</h3><div className="job-actions">{[...new Set(data.events.map(event=>event.name))].map(name=><button key={name} onClick={()=>change({...draft,step:'section',family:name})}>{name}</button>)}</div></>}
    </div> : draft.step==='section' ? <div><h2>{draft.family}: which section?</h2><div className="job-actions">{data.events.filter(event=>event.name===draft.family).map(event=><button key={event.id} onClick={()=>change({...draft,step:'entry',eventCode:event.code})}>{event.section} · {event.code}</button>)}<button onClick={reset}>Choose another event</button></div></div> : <div>
      <p className="race-header">{event?.name} {event?.section} ({draft.eventCode}){draft.raceId?' · Correct runners':''}</p>
      {draft.step==='entry' ? <><h2>{draft.runners.length===6?'6 runners checked in':`Runner ${draft.runners.length+1}: wristband number?`}</h2>
        <div className="runner-chips">{draft.runners.map(number=><button disabled={busy || draft.pendingWarnings.length>0} className={draft.warnings[number]?.length?'warning-chip':''} key={number} aria-label={`Remove runner ${number}`} onClick={()=>removeRunner(number)}>{number} ×</button>)}</div>
        <output className={draft.pendingWarnings.length?'warning-number':''} aria-label="Wristband number">{draft.current || '—'}</output>
        {draft.pendingWarnings.length>0 ? <div className="number-warning" role="alert">{draft.pendingWarnings.map(warning=><p key={warning.kind}>{warning.message}</p>)}<div className="job-actions"><button onClick={()=>change({...draft,pendingWarnings:[]})}>Fix number</button><button onClick={()=>acceptNumber(draft.pendingWarnings)}>Keep</button></div></div> : <>
          <div className="number-keypad">{['1','2','3','4','5','6','7','8','9'].map(digit=><button disabled={busy} key={digit} onClick={()=>change({...draft,current:draft.current+digit})}>{digit}</button>)}<button disabled={busy} aria-label="Delete last digit" onClick={()=>change({...draft,current:draft.current.slice(0,-1)})}>⌫</button><button disabled={busy} onClick={()=>change({...draft,current:draft.current+'0'})}>0</button><button disabled={!draft.current || busy} onClick={()=>void next()}>{busy?'Checking…':'Next'}</button></div>
          <div className="job-actions"><button disabled={busy || draft.runners.length===0 || !!draft.current} onClick={()=>change({...draft,step:'check'})}>That's everyone</button><button disabled={busy} onClick={reset}>Choose another race</button></div>
        </>}
      </> : <><h2>{draft.runners.length} {draft.runners.length===1?'runner':'runners'}. Is that right?</h2><ol>{draft.runners.map(number=><li className={draft.warnings[number]?.length?'kept-warning':''} key={number}><strong>{number}</strong>{draft.warnings[number]?.map(warning=><p key={warning.kind}>{warning.message} · Warning kept</p>)}</li>)}</ol><div className="job-actions"><button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button><button disabled={busy} onClick={()=>change({...draft,step:'entry'})}>Change runners</button></div></>}
    </div>}
    </fieldset>
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Start line</button></footer>
  </section>;
}
