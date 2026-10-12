import { useEffect,useState } from 'react';
import { api,phoneStorage } from '../api.js';
import { raceLabel,type RaceRead,type StartLineRead } from '../../shared/races.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import './jobs.css';
type Draft={step:'pick'|'section'|'entry'|'check';family:string;eventCode:string;runners:number[];current:string;raceId?:string;baseVersion:number;requestId:string};
function emptyDraft():Draft {
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return {step:'pick',family:'',eventCode:'',runners:[],current:'',baseVersion:0,requestId:Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('')};
}
function restore(key:string):Draft {
  try {const value=JSON.parse(localStorage.getItem(key)||'null');if(value && ['pick','section','entry','check'].includes(value.step) && Array.isArray(value.runners) && typeof value.current==='string' && typeof value.requestId==='string') return value;}
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
      if(latest.parts.finish.value!==null) {setError('Finishing order already recorded - ask a lead');return;}
      change({...emptyDraft(),step:'entry',eventCode:latest.event.code,runners:(latest.parts.runners.value||[]).map(runner=>runner.wristband),raceId:latest.id,baseVersion:latest.parts.runners.version});
      setSaved(null);
    } catch(error) {setError(error instanceof Error?error.message:'Could not connect');}
  }
  function next() {
    const number=Number(draft.current);
    const refusal=runnerListRefusal([...draft.runners,number]);
    if(refusal) {setError(refusal);return;}
    change({...draft,runners:[...draft.runners,number],current:''});
  }
  async function save() {
    setBusy(true);setError('');setMessage('');
    try {
      const response=await api<{status:string;race:RaceRead}>(draft.raceId?`races/${draft.raceId}/runners`:'races/check-in',draft.raceId?{baseVersion:draft.baseVersion,runners:draft.runners}:{eventCode:draft.eventCode,runners:draft.runners,requestId:draft.requestId});
      localStorage.removeItem(key);setDraft(emptyDraft());setSaved(response.race);setMessage('Saved');void refresh();
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
  return <section className="race-job"><h1>Start line</h1>
    {readError && <p role="alert">{readError}</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {saved ? <div><h2>{raceLabel(saved)} saved</h2><p>{saved.event.name} {saved.event.section} ({saved.event.code})</p><p>{saved.parts.runners.value?.map(runner=>runner.wristband).join(' · ')}</p>
      {deleting ? <div className="job-actions"><p>Delete {raceLabel(saved)}?</p><button disabled={busy} onClick={()=>void remove(false)}>Move to Deleted races</button><button disabled={busy} onClick={()=>void remove(true)}>Delete permanently</button><button disabled={busy} onClick={()=>setDeleting(false)}>Keep this race</button></div> : <div className="job-actions"><button onClick={()=>void open(saved)}>Edit runners</button><button onClick={()=>setDeleting(true)}>Delete this race</button><button onClick={reset}>Check in another race</button></div>}
    </div> : draft.step==='pick' ? <div><h2>Which race is it?</h2>
      {data.waiting.length>0 && <><h3>Already at the start line</h3><div className="job-actions">{data.waiting.map(race=><button key={race.id} onClick={()=>void open(race)}>{race.event.name} {race.event.section} ({race.event.code}) · {raceLabel(race)}</button>)}</div></>}
      {!data.eventsConfirmed ? <p>Ask the scoring team to confirm the event list</p> : <><h3>Check in a new race</h3><div className="job-actions">{[...new Set(data.events.map(event=>event.name))].map(name=><button key={name} onClick={()=>change({...draft,step:'section',family:name})}>{name}</button>)}</div></>}
    </div> : draft.step==='section' ? <div><h2>{draft.family}: which section?</h2><div className="job-actions">{data.events.filter(event=>event.name===draft.family).map(event=><button key={event.id} onClick={()=>change({...draft,step:'entry',eventCode:event.code})}>{event.section} · {event.code}</button>)}<button onClick={reset}>Choose another event</button></div></div> : <div>
      <p className="race-header">{event?.name} {event?.section} ({draft.eventCode}){draft.raceId?' · Correct runners':''}</p>
      {draft.step==='entry' ? <><h2>{draft.runners.length===6?'6 runners checked in':`Runner ${draft.runners.length+1}: wristband number?`}</h2>
        <div className="runner-chips">{draft.runners.map((number,index)=><button key={`${number}-${index}`} aria-label={`Remove runner ${number}`} onClick={()=>change({...draft,runners:draft.runners.filter((_,i)=>i!==index)})}>{number} ×</button>)}</div>
        <output aria-label="Wristband number">{draft.current || '—'}</output>
        <div className="number-keypad">{['1','2','3','4','5','6','7','8','9'].map(digit=><button key={digit} onClick={()=>change({...draft,current:draft.current+digit})}>{digit}</button>)}<button aria-label="Delete last digit" onClick={()=>change({...draft,current:draft.current.slice(0,-1)})}>⌫</button><button onClick={()=>change({...draft,current:draft.current+'0'})}>0</button><button disabled={!draft.current} onClick={next}>Next</button></div>
        <div className="job-actions"><button disabled={draft.runners.length===0 || !!draft.current} onClick={()=>change({...draft,step:'check'})}>That's everyone</button><button onClick={reset}>Choose another race</button></div>
      </> : <><h2>{draft.runners.length} {draft.runners.length===1?'runner':'runners'}. Is that right?</h2><ol>{draft.runners.map(number=><li key={number}>{number}</li>)}</ol><div className="job-actions"><button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button><button disabled={busy} onClick={()=>change({...draft,step:'entry'})}>Change runners</button></div></>}
    </div>}
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Start line</button></footer>
  </section>;
}
