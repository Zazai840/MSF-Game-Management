import { ClashNotice } from './ClashNotice.js';
import { hasClash } from '../../shared/race-clashes.js';
import { useEffect,useState } from 'react';
import { api,phoneStorage } from '../api.js';
import { raceLabel,type FinishOrderRead,type RaceRead,type Runner } from '../../shared/races.js';
import { runnerListRefusal,wristbandWarnings,type WristbandWarning } from '../../shared/wristband-checks.js';
import './jobs.css';
type Draft={race:RaceRead;step:'place'|'no-place'|'check'|'add';runners:Runner[];order:number[];didNotFinish:number[];didNotRun:number[];added:number[];keptWarnings:number[];current:string;pendingWarnings:WristbandWarning[]};
const ordinal=(number:number)=>`${number}${number===1?'st':number===2?'nd':number===3?'rd':'th'}`;
function fromRace(race:RaceRead):Draft {
  const runners=race.parts.runners.value||[];
  const numberFor=(id:string)=>runners.find(runner=>runner.id===id)!.wristband;
  return {race,step:race.parts.finish.value?'check':'place',runners,order:race.parts.finish.value?.order.map(numberFor)||[],didNotFinish:race.parts.finish.value?.didNotFinish.map(numberFor)||[],didNotRun:[],added:[],keptWarnings:[],current:'',pendingWarnings:[]};
}
function restore(key:string):Draft|null {
  try {const value=JSON.parse(localStorage.getItem(key)||'null');if(value?.race?.id && ['place','no-place','check','add'].includes(value.step) && Array.isArray(value.order) && Array.isArray(value.runners)) return value;}
  catch { /* A broken draft must not stop a phone opening the job. */ }
  return null;
}
export function FinishOrder({dayId}:{dayId:string}) {
  const key=`msf:draft:${phoneStorage.token()}:${dayId}:finish-order`;
  const [draft,setDraft]=useState<Draft|null>(()=>restore(key));
  const [data,setData]=useState<FinishOrderRead|null>(null);
  const [choosing,setChoosing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [readError,setReadError]=useState('');
  const [message,setMessage]=useState('');
  const [updated,setUpdated]=useState('');
  useEffect(()=>{if(draft) localStorage.setItem(key,JSON.stringify(draft));else localStorage.removeItem(key);},[draft,key]);
  async function refresh() {
    try {
      const next=await api<FinishOrderRead>('jobs/finish-order');setData(next);setUpdated(new Date().toLocaleTimeString());setReadError('');
      setDraft(current=>current || (next.waiting[0]?fromRace(next.waiting[0]):null));
    } catch(error) {setReadError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[]);
  function change(next:Draft) {setDraft(next);setError('');setMessage('');}
  async function open(race:RaceRead) {
    setBusy(true);
    try {change(fromRace(await api<RaceRead>(`races/${race.id}`)));setChoosing(false);}
    catch(error) {setError(error instanceof Error?error.message:'Could not open race');}
    finally {setBusy(false);}
  }
  function acceptNumber(warnings:WristbandWarning[]=[]) {
    if(!draft) return;
    const wristband=Number(draft.current);
    change({...draft,step:'place',runners:[...draft.runners,{id:`new-${wristband}`,wristband,addedAtFinish:true,warnings:warnings.map(warning=>({...warning,kept:true}))}],added:[...draft.added,wristband],keptWarnings:warnings.length?[...draft.keptWarnings,wristband]:draft.keptWarnings,current:'',pendingWarnings:[]});
  }
  async function addNumber() {
    if(!draft) return;
    const number=Number(draft.current);
    const refusal=runnerListRefusal([...draft.runners.filter(runner=>!draft.didNotRun.includes(runner.wristband)).map(runner=>runner.wristband),number]);
    if(refusal) {setError(refusal);return;}
    if(draft.runners.some(runner=>runner.wristband===number)) {setError(`${number} is already in this race`);return;}
    setBusy(true);setError('');
    try {
      const local=wristbandWarnings(number,draft.race.event.section);
      const response=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:draft.race.event.code,wristband:number,raceId:draft.race.id});
      const warnings=[...local,...response.warnings.filter(warning=>!local.some(item=>item.kind===warning.kind))];
      if(warnings.length) change({...draft,pendingWarnings:warnings});else acceptNumber();
    } catch(error) {setError(error instanceof Error?error.message:'Could not check number - tap Next again');}
    finally {setBusy(false);}
  }
  function didntRun(number:number) {
    if(!draft) return;
    if(draft.added.includes(number)) change({...draft,runners:draft.runners.filter(runner=>runner.wristband!==number),added:draft.added.filter(value=>value!==number),keptWarnings:draft.keptWarnings.filter(value=>value!==number)});
    else change({...draft,didNotRun:[...draft.didNotRun,number]});
  }
  async function save() {
    if(!draft) return;setBusy(true);setError('');setMessage('');
    try {
      const response=await api<{race:RaceRead}>(`races/${draft.race.id}/finish`,{baseVersion:draft.race.parts.finish.version,runnersVersion:draft.race.parts.runners.version,order:draft.order,didNotFinish:draft.didNotFinish,didNotRun:draft.didNotRun,added:draft.added,keptWarnings:draft.keptWarnings});
      setDraft(fromRace(response.race));setMessage(hasClash(response.race)?'':'Saved');void refresh();
    } catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  if(!data) return <section><h1>Finish order</h1><p>{readError || 'Opening…'}</p><button onClick={()=>void refresh()}>Refresh Finish order</button></section>;
  const unplaced=draft?.runners.filter(runner=>![...draft.order,...draft.didNotFinish,...draft.didNotRun].includes(runner.wristband))||[];
  const step=draft?.step==='no-place' && unplaced.length===0?'check':draft?.step;
  function move(index:number,direction:number) {
    if(!draft) return;const order=[...draft.order];[order[index],order[index+direction]]=[order[index+direction],order[index]];change({...draft,order});
  }
  return <section className="race-job"><h1>Finish order</h1>
    <ClashNotice race={draft?[...data.waiting,...data.recent].find(race=>race.id===draft.race.id)||draft.race:null}/>
    {readError && <p role="alert">{readError}</p>}{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button disabled={busy} onClick={()=>setChoosing(!choosing)}>Other race</button>
    {choosing || !draft ? <div><h2>Also waiting</h2>{data.waiting.length===0 && <p>No races waiting</p>}<div className="job-actions">{data.waiting.map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{race.event.name} {race.event.section} ({race.event.code}) · {raceLabel(race)}</button>)}</div>
      <h2>Recent races</h2><div className="job-actions">{data.recent.map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{race.event.name} {race.event.section} ({race.event.code}) · {raceLabel(race)}</button>)}</div>{draft && <button onClick={()=>setChoosing(false)}>Back to this race</button>}
    </div> : <div>
      <p className="race-header">{draft.race.event.name} {draft.race.event.section} ({draft.race.event.code}) · {raceLabel(draft.race)} · {draft.runners.length-draft.didNotRun.length} runners · checked in {new Date(draft.race.checkedInAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
      {step==='add' ? <><h2>Runner not on the list: wristband number?</h2><output className={draft.pendingWarnings.length?'warning-number':''} aria-label="Wristband number">{draft.current || '—'}</output>
        {draft.pendingWarnings.length>0 ? <div className="number-warning" role="alert">{draft.pendingWarnings.map(warning=><p key={warning.kind}>{warning.message}</p>)}<div className="job-actions"><button onClick={()=>change({...draft,pendingWarnings:[]})}>Fix number</button><button onClick={()=>acceptNumber(draft.pendingWarnings)}>Keep</button></div></div> : <><div className="number-keypad">{['1','2','3','4','5','6','7','8','9'].map(digit=><button disabled={busy} key={digit} onClick={()=>change({...draft,current:draft.current+digit})}>{digit}</button>)}<button disabled={busy} aria-label="Delete last digit" onClick={()=>change({...draft,current:draft.current.slice(0,-1)})}>⌫</button><button disabled={busy} onClick={()=>change({...draft,current:draft.current+'0'})}>0</button><button disabled={busy || !draft.current} onClick={()=>void addNumber()}>{busy?'Checking…':'Next'}</button></div><button disabled={busy} onClick={()=>change({...draft,step:'place',current:''})}>Back to order</button></>}
      </> : step==='check' ? <><h2>Check the order</h2><ol className="finish-review">{draft.order.map((number,index)=><li key={number}><span>{number}{draft.runners.find(runner=>runner.wristband===number)?.addedAtFinish && <small> · added at the finish</small>}</span><div><button disabled={busy || index===0} aria-label={`Move ${number} up`} onClick={()=>move(index,-1)}>↑</button><button disabled={busy || index===draft.order.length-1} aria-label={`Move ${number} down`} onClick={()=>move(index,1)}>↓</button></div></li>)}</ol>
        {draft.didNotFinish.map(number=><p key={number}>{number} · Did not finish</p>)}{draft.didNotRun.map(number=><p key={number}>{number} · Didn't run · taken off this race</p>)}
        {draft.runners.filter(runner=>runner.warnings?.length).map(runner=><div key={runner.id} className="kept-warning">{runner.warnings?.map(warning=><p key={warning.kind}>{warning.message} · Warning kept</p>)}</div>)}
        <div className="job-actions"><button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button><button disabled={busy} onClick={()=>change({...draft,step:'place',order:[],didNotFinish:[],didNotRun:[]})}>Change order</button><button disabled={busy} onClick={()=>change({...draft,step:'add'})}>+ Runner not on the list</button></div>
      </> : <><div className="runner-chips" aria-label="Places so far">{draft.order.map((number,index)=><button key={number} onClick={()=>change({...draft,step:'place',order:draft.order.slice(0,index)})}>{ordinal(index+1)}: {number}</button>)}</div>
        {step==='no-place' ? <><h2>{unplaced[0]?.wristband} has no place. What happened?</h2><div className="job-actions"><button onClick={()=>change({...draft,didNotFinish:[...draft.didNotFinish,unplaced[0].wristband]})}>Did not finish</button><button onClick={()=>didntRun(unplaced[0].wristband)}>Didn't run</button></div></> : <><h2>{unplaced.length?`Who came ${ordinal(draft.order.length+1)}?`:'Everyone has a place'}</h2><div className="finish-numbers">{unplaced.map(runner=><button key={runner.id} onClick={()=>change({...draft,order:[...draft.order,runner.wristband]})}>{runner.wristband}</button>)}</div><div className="job-actions"><button onClick={()=>change({...draft,step:unplaced.length?'no-place':'check'})}>{unplaced.length?'Nobody else crossed the line':'Check the order'}</button></div></>}
        <div className="job-actions"><button onClick={()=>change({...draft,step:'add'})}>+ Runner not on the list</button></div>
      </>}
    </div>}
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Finish order</button></footer>
  </section>;
}
