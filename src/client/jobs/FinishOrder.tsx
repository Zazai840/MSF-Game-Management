import { stageLocked } from '../../shared/stage-lock.js';
import { ClashNotice } from './ClashNotice.js';
import { hasClash } from '../../shared/race-clashes.js';
import { useState } from 'react';
import { useRaceJob } from './useJobData.js';
import { api } from '../api.js';
import { raceLabel,type FinishOrderRead,type RaceRead,type Runner } from '../../shared/races.js';
import { plainWristbandWarning,runnerListRefusal,wristbandWarnings,type WristbandWarning } from '../../shared/wristband-checks.js';
import { ordinal } from '../../shared/ordinal.js';
import { Trail,type TrailStep } from '../flow/Trail.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { ActionBar } from '../flow/ActionBar.js';
import { Saved } from '../flow/Saved.js';
import { SortableList } from '../flow/SortableList.js';
import './jobs.css';
type Draft={race:RaceRead;step:'place'|'no-place'|'check'|'add';runners:Runner[];order:number[];didNotFinish:number[];didNotRun:number[];added:number[];keptWarnings:number[];current:string;pendingWarnings:WristbandWarning[];
  /** A number refused outright (already in this race): only Fix number. */
  refused?:string};
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
/** True when the draft holds places that are not on the server yet. */
function changed(draft:Draft) {
  const fresh=fromRace(draft.race),pick=(value:Draft)=>JSON.stringify([value.order,value.didNotFinish,value.didNotRun,value.added]);
  return pick(draft)!==pick(fresh);
}
const raceName=(race:RaceRead)=>`${race.event.name} ${race.event.section} ${raceLabel(race)}`;
const pickerLabel=(race:RaceRead)=>`${race.event.name} ${race.event.section} (${race.event.code}) · ${raceLabel(race)}`;
export function FinishOrder({dayId,onHome}:{dayId:string;onHome:()=>void}) {
  const {draft,setDraft,data,choosing,setChoosing,busy,setBusy,error,setError,readError,updated,refresh,open:openRace}=useRaceJob<FinishOrderRead,Draft>(dayId,'finish-order',restore,fromRace);
  const [message,setMessage]=useState('');
  const [saved,setSaved]=useState<RaceRead|null>(null);
  function change(next:Draft) {setDraft(next);setError('');setMessage('');}
  /** Choosing the race already being placed carries on with it, so going back never loses places. */
  async function open(race:RaceRead) {
    if(draft && race.id===draft.race.id && changed(draft)) {setChoosing(false);setMessage('');return;}
    await openRace(race);setMessage('');setSaved(null);
  }
  async function nextRace() {
    const waiting=data?.waiting.find(race=>race.id!==saved?.id);
    if(waiting) {await openRace(waiting);setSaved(null);return;}
    setDraft(null);setChoosing(false);setSaved(null);setMessage('');setError('');void refresh();
  }
  function acceptNumber(warnings:WristbandWarning[]=[]) {
    if(!draft) return;
    const wristband=Number(draft.current);
    change({...draft,step:'place',runners:[...draft.runners,{id:`new-${wristband}`,wristband,addedAtFinish:true,warnings:warnings.map(warning=>({...warning,kept:true}))}],added:[...draft.added,wristband],keptWarnings:warnings.length?[...draft.keptWarnings,wristband]:draft.keptWarnings,current:'',pendingWarnings:[],refused:undefined});
  }
  async function addNumber() {
    if(!draft) return;
    const number=Number(draft.current);
    if(draft.runners.some(runner=>runner.wristband===number)) {change({...draft,refused:`${number} is already in this race. Check the wristband.`});return;}
    const refusal=runnerListRefusal([...draft.runners.filter(runner=>!draft.didNotRun.includes(runner.wristband)).map(runner=>runner.wristband),number]);
    if(refusal) {setError(refusal);return;}
    setBusy(true);setError('');
    try {
      const local=wristbandWarnings(number,draft.race.event.section);
      const response=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:draft.race.event.code,wristband:number,raceId:draft.race.id});
      const warnings=[...local,...response.warnings.filter(warning=>!local.some(item=>item.kind===warning.kind))];
      if(warnings.length) change({...draft,pendingWarnings:warnings});else acceptNumber();
    } catch(error) {setError(error instanceof Error?error.message:'Could not check this number - tap Next again');}
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
      setDraft(fromRace(response.race));setSaved(response.race);void refresh();
    } catch(error) {setMessage('Not saved - tap Save again');setError(error instanceof Error?error.message:'Could not connect');}
    finally {setBusy(false);}
  }
  const home:TrailStep={label:'Home',onSelect:onHome};
  const jobStep:TrailStep={label:'Finishing order',onSelect:()=>{setChoosing(true);setError('');setMessage('');}};
  if(!data) return <section className="race-job"><Trail steps={[home,{label:'Finishing order'}]}/><h1>Record the finishing order</h1><p>{readError || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh Finish order</button></section>;
  const latest=(race:RaceRead)=>[...data.waiting,...data.recent].find(item=>item.id===race.id)||race;
  if(saved) {
    const first=fromRace(saved).order[0];
    const race=latest(saved);
    return <section className="race-job"><Saved race={`${saved.event.name} ${saved.event.section} · ${raceLabel(saved)} · ${first===undefined?'No finishers':`1st: ${first}`}`} nextLabel="Next race" onNext={()=>void nextRace()} onHome={onHome}>
      {hasClash(race) && <ClashNotice race={race}/>}{error && <p role="alert">{error}</p>}
    </Saved></section>;
  }
  const alerts=<>{readError && <p role="alert">{readError}</p>}{error && <p role="alert">{error}</p>}</>;
  const notSaved='Not saved - tap Save again';
  /** A failed save shows beside Save, in one amber box with the reason. */
  const failedSave=message===notSaved && <div className="warning-box save-failed"><p role="status">{notSaved}</p>{error && <p role="alert">{error}</p>}</div>;
  if(choosing || !draft) {
    return <section className="race-job"><Trail steps={[home,{label:'Finishing order'}]}/>{alerts}
      <h1>Which race is it?</h1>
      {draft && <button className="button-secondary carry-on" disabled={busy} onClick={()=>setChoosing(false)}>Carry on with {raceName(draft.race)}</button>}
      <h3>Waiting for a finishing order</h3>
      {data.waiting.length===0?<p className="job-hint">No races waiting</p>:<div className="job-choices">{data.waiting.map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{pickerLabel(race)}</button>)}</div>}
      {data.recent.length>0 && <><h3>Recent races</h3><div className="job-choices">{data.recent.map(race=><button disabled={busy} key={race.id} onClick={()=>void open(race)}>{pickerLabel(race)}</button>)}</div></>}
      <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Finish order</button></footer>
    </section>;
  }
  const unplaced=draft.runners.filter(runner=>![...draft.order,...draft.didNotFinish,...draft.didNotRun].includes(runner.wristband));
  const step=draft.step==='no-place' && unplaced.length===0?'check':draft.step;
  const locked=stageLocked(draft.race,data.completedStages);
  const toPlaces=()=>change({...draft,step:'place',current:'',pendingWarnings:[],refused:undefined});
  const raceStep:TrailStep={label:raceName(draft.race),onSelect:toPlaces};
  const trail:TrailStep[]=step==='add'?[home,jobStep,raceStep,{label:'Runner not on the list'}]:step==='check'?[home,jobStep,raceStep,{label:'Check'}]:[home,jobStep,{label:raceStep.label}];
  const runnerCount=draft.runners.length-draft.didNotRun.length;
  const raceLine=<p className="race-line">{[draft.race.event.name,draft.race.event.section,raceLabel(draft.race),`${runnerCount} ${runnerCount===1?'runner':'runners'}`].join(' · ')}</p>;
  const held=draft.pendingWarnings.length>0 || !!draft.refused;
  const addRunner=<button className="button-secondary" disabled={busy} onClick={()=>change({...draft,step:'add'})}>+ Runner not on the list</button>;
  return <section className="race-job"><Trail steps={trail}/>
    <ClashNotice race={latest(draft.race)}/>
    {!failedSave && alerts}
    {locked && <p role="status" className="warning-box">Stage complete - ask a lead</p>}
    <fieldset className="stage-job-fields" disabled={locked}>
    {step==='add' ? <div className="check-in-entry">
      <div className="job-heading">{raceLine}<h1>Runner not on the list: wristband number?</h1></div>
      <NumberEntry label="Wristband number" placeholder="e.g. 205" value={draft.current} held={held} busy={busy} onChange={current=>change({...draft,current})} onNext={()=>void addNumber()}
        extraAction={<button className="button-secondary" disabled={busy} onClick={toPlaces}>Back to order</button>}/>
      {held && <div className="warning-box" role="alert">
        {draft.refused?<p>{draft.refused}</p>:draft.pendingWarnings.map(warning=><p key={warning.kind}>{plainWristbandWarning(warning,Number(draft.current),draft.race.event.section)}</p>)}
        <div className="warning-actions"><button onClick={()=>change({...draft,current:'',pendingWarnings:[],refused:undefined})}>Fix number</button>{!draft.refused && <button className="button-secondary" onClick={()=>acceptNumber(draft.pendingWarnings)}>Keep</button>}</div>
      </div>}
    </div> : step==='check' ? <div className="finish-check">
      <div className="job-heading">{raceLine}<h1>Check the order</h1><p className="job-sub">Wrong place? Drag the handle on the right to move a runner.</p></div>
      <SortableList label="Finishing order" items={draft.order} itemKey={number=>number} itemName={String} disabled={busy||locked} onReorder={order=>change({...draft,order})}
        renderItem={(number,place)=><><span className="row-place">{ordinal(place)}</span><span className="row-runner"><strong>{number}</strong>{draft.added.includes(number) || draft.runners.find(runner=>runner.wristband===number)?.addedAtFinish?<small className="row-note">Added at the finish</small>:null}</span></>}/>
      {draft.didNotFinish.length+draft.didNotRun.length>0 && <ul className="finish-others" aria-label="No place">
        {draft.didNotFinish.map(number=><li key={number}><strong>{number}</strong><span>Did not finish</span></li>)}
        {draft.didNotRun.map(number=><li key={number}><strong>{number}</strong><span>Didn't run · taken off this race</span></li>)}
      </ul>}
      {draft.runners.filter(runner=>runner.warnings?.length).map(runner=><div key={runner.id} className="kept-warning">{runner.warnings?.map(warning=><p key={warning.kind}>{plainWristbandWarning(warning,runner.wristband,draft.race.event.section)} · Warning kept</p>)}</div>)}
      <button className="button-small button-secondary change-order" disabled={busy} onClick={()=>change({...draft,step:'place',order:[],didNotFinish:[],didNotRun:[]})}>Change order</button>
      {failedSave}
      <ActionBar stacked><button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save'}</button>{addRunner}</ActionBar>
    </div> : <div className="finish-place">
      {draft.order.length>0 && <div className="runner-chips" aria-label="Places so far">{draft.order.map((number,index)=><button className="chip" key={number} onClick={()=>change({...draft,step:'place',order:draft.order.slice(0,index)})}>{ordinal(index+1)}: {number}</button>)}</div>}
      {step==='no-place' ? <><div className="job-heading">{raceLine}<h1>{unplaced[0]?.wristband} has no place. What happened?</h1></div>
        <div className="job-choices"><button onClick={()=>change({...draft,didNotFinish:[...draft.didNotFinish,unplaced[0].wristband]})}>Did not finish</button><button onClick={()=>didntRun(unplaced[0].wristband)}>Didn't run</button></div>
        <ActionBar>{addRunner}</ActionBar></>
      : <><div className="job-heading">{raceLine}<h1>{unplaced.length?`Who came ${ordinal(draft.order.length+1)}?`:'Everyone has a place'}</h1>{unplaced.length>0 && <p className="job-sub">Tap runners in the order they crossed the line.</p>}</div>
        <div className="finish-numbers">{unplaced.map(runner=><button key={runner.id} onClick={()=>change({...draft,order:[...draft.order,runner.wristband]})}>{runner.wristband}</button>)}</div>
        <ActionBar stacked><button onClick={()=>change({...draft,step:unplaced.length?'no-place':'check'})}>{unplaced.length?'Nobody else crossed the line':'Check the order'}</button>{addRunner}</ActionBar></>}
    </div>}
    </fieldset>
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Finish order</button></footer>
  </section>;
}
