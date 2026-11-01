import type { EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { runnerListRefusal } from '../../shared/runner-list.js';
import type { WristbandWarning } from '../../shared/wristband-checks.js';
import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionSheet } from './ActionSheet.js';
import { RaceTeamsEditor } from './RaceTeams.js';
import { api } from '../api.js';
import { raceLabel,replacedByRerun,runnersOf } from '../../shared/races.js';
import { raceName } from '../../shared/race-flow.js';
import { Sheet } from '../races/parts.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { useToast } from '../races/Toast.js';
import { toastLine } from '../../shared/toast-lines.js';
import type { RaceAction,RaceCorrection,View } from '../shell/addresses.js';
import './race-page.css';
type Correction='runners'|'teams';
/** A race not saved yet, in Race actions and on its race page: where its steps are finished. */
export const notSavedLine=(race:LeadRaceRead['race'],where:'page'|'screen')=>`${raceName(race)} is not saved yet. ${where==='page'?'Open it to finish its steps.':'Finish its steps on this screen first.'}`;
/**
 * Race actions, the one sheet "⋯" opens on a race page (`where="page"`) and on the race screen: the corrections, Re-run,
 * then a red Delete set apart; on a deleted race Restore and a red Delete for good; on a race not saved yet, where its
 * steps are finished and Delete. Re-run, Delete, Restore, Correct times and Correct finishing order open their screens; the
 * other corrections open today's editor in the sheet's place. `onSaved` takes a correction's answer and re-reads the race, so an editor that saves each change
 * at once works on the latest versions.
 */
export function RaceActions({read,where,onOpen,onClose,onSaved,onRace}:{read:LeadRaceRead;where:'page'|'screen';onOpen:(view:View)=>void;onClose:()=>void;onSaved:(next:EventResultsRead)=>void|Promise<void>;onRace?:()=>void}) {
  const {race}=read,name=raceName(race);
  const [editing,setEditing]=useState<Correction|null>(null);
  if(editing) return <CorrectionEditor read={read} part={editing} onSaved={onSaved} onClose={onClose}/>;
  const screen=(action:RaceAction)=>onOpen({kind:'race-action',...(where==='page'?{code:race.event.code}:{}),raceId:race.id,action});
  const correct=(action:RaceCorrection)=>onOpen({kind:'correction',...(where==='page'?{code:race.event.code}:{}),raceId:race.id,action});
  const button=(label:string,onClick:()=>void,kind='')=><button type="button" className={`rz-btn rz-btn--block${kind}`} onClick={onClick}>{label}</button>;
  const remove=(label:string)=>button(label,()=>screen('delete'),' rz-btn--danger rz-sheet__apart');
  return <Sheet title={`${name} · actions`} onClose={onClose}>
    {race.state!=='saved' && !race.deleted && <p className="rz-sheet__text">{notSavedLine(race,where)}</p>}
    <div className="rz-sheet__actions">
      {race.deleted?<>{!replacedByRerun(race) && button(`Restore ${name}`,()=>screen('restore'),' rz-btn--primary')}{remove('Delete for good')}</>
        :race.state!=='saved'?<>{where==='page' && onRace && button(`Open ${name}`,onRace)}{remove(`Delete ${name}`)}</>
        :<>
          {race.kind!=='final' && button('Correct times',()=>correct('correct-times'))}
          {race.parts.finish.value && button('Correct finishing order',()=>correct('correct-finishing-order'))}
          {race.event.relay?button('Correct teams',()=>setEditing('teams')):button('Correct runner list',()=>setEditing('runners'))}
          {button('Re-run race',()=>screen('re-run'))}
          {remove(`Delete ${name}`)}
        </>}
    </div>
  </Sheet>;
}
const correctionTitles:Record<Correction,string>={runners:'Correct runner list',teams:'Correct teams'};
/**
 * Today's correction editor, in the older look until #279 and #280 make each a screen: outside the race flow's screen
 * root, so its look stays. Correct teams saves each change at once and stays open.
 */
function CorrectionEditor({read,part,onSaved,onClose}:{read:LeadRaceRead;part:Correction;onSaved:(next:EventResultsRead)=>void|Promise<void>;onClose:()=>void}) {
  const {race}=read;
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const toast=useToast(),named={section:race.event.section,kind:race.kind,number:race.number};
  async function command(command:string,body:unknown,stay=false) {
    if(busy) return;setBusy(true);setError('');
    try {
      const answer=await api<EventResultsRead>(`lead/races/${race.id}/${command}`,body);
      toast({message:toastLine({kind:'corrected',part,race:named})});await onSaved(answer);
      if(!stay) onClose();
    }
    catch(error) {setError(error instanceof Error?error.message:'Not saved - try again');}
    finally {setBusy(false);}
  }
  return createPortal(<ActionSheet title={`${correctionTitles[part]} · ${raceLabel(race)}`} busy={busy} onClose={onClose}><h3>{raceLabel(race)}</h3>{error && <p role="alert">{error}</p>}
    {part==='teams'?<RaceTeamsEditor race={race} teams={read.teams||[]} relays={read.relays||[]} busy={busy} onSave={body=>command('teams',body,true)} onClose={onClose}/>
      :<RaceRunnersEditor race={race} busy={busy} onSave={body=>void command('runners',body)} onClose={onClose}/>}
  </ActionSheet>,document.body);
}
/**
 * Keeps the place or runner being retyped in sight inside the sheet (clear of its sticky buttons, see race-page.css),
 * also when the sheet shrinks as the number bar and the phone's keyboard open.
 */
function useInSight(editing:number|null) {
  const rows=useRef<HTMLOListElement>(null);
  useEffect(()=>{
    const block=rows.current?.querySelector('.lead-editing'),sheet=rows.current?.closest('[role=dialog]');
    if(editing===null || !block || !sheet) return;
    const observer=new ResizeObserver(()=>block.scrollIntoView({block:'nearest'}));
    observer.observe(sheet);return ()=>observer.disconnect();
  },[editing]);
  return rows;
}
const pencil=<svg className="time-edit" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>;
/**
 * The lead's runner list correction: tapping a runner retypes their number on the phone's own number pad
 * (they keep their place and time); Add runner and Review runner list stay on screen however long the list.
 */
function RaceRunnersEditor({race,busy,onSave,onClose}:{race:LeadRaceRead['race'];busy:boolean;onSave:(body:unknown)=>void;onClose:()=>void}) {
  const [original]=useState(race);
  const [entries,setEntries]=useState(()=>(runnersOf(race.parts.runners.value).map(runner=>({entryId:runner.id as string|undefined,number:String(runner.wristband)}))));
  const [editing,setEditing]=useState<number|null>(null);
  const rows=useInSight(editing);
  const [step,setStep]=useState<'input'|'warnings'|'review'>('input');
  const region=useRef<HTMLDivElement>(null);
  const opened=useRef(false);
  // A new step puts focus on its first control (the sheet itself focuses the first one on opening).
  useEffect(()=>{if(opened.current) region.current?.querySelector<HTMLElement>('input,button,textarea')?.focus();opened.current=true;},[step]);
  const [warnings,setWarnings]=useState<Array<{number:number;message:string}>>([]);
  const [checking,setChecking]=useState(false),[error,setError]=useState(''),[kept,setKept]=useState<number[]>([]);
  const [newDidNotFinish,setNewDidNotFinish]=useState(false),[comment,setComment]=useState('');
  const additions=entries.some(entry=>!entry.entryId);
  async function check(event:React.FormEvent) {
    event.preventDefault();setError('');
    const blank=entries.findIndex(entry=>entry.number==='');
    if(blank>=0) {setEditing(blank);setError(`Type a wristband number for runner ${blank+1}, or remove that runner`);return;}
    setEditing(null);const numbers=entries.map(entry=>Number(entry.number));
    const refusal=runnerListRefusal(numbers);if(refusal && numbers.length) {setError(refusal);return;}
    setChecking(true);
    try {
      const warnings:Array<{number:number;message:string}>=[];
      for(const entry of entries) {
        const number=Number(entry.number),old=runnersOf(original.parts.runners.value).find(runner=>runner.id===entry.entryId);
        if(old?.wristband===number) continue;
        const data=await api<{warnings:WristbandWarning[]}>('wristband-check',{eventCode:original.event.code,wristband:number,raceId:original.id});
        for(const warning of data.warnings.filter(warning=>original.kind!=='final'||warning.kind!=='already-ran')) warnings.push({number,message:warning.message});
      }
      setWarnings(warnings);setKept([]);setStep(warnings.length?'warnings':'review');
    } catch(error) {setError(error instanceof Error?error.message:'Could not check the runners');}
    finally {setChecking(false);}
  }
  function save() {
    const runners=entries.map(entry=>({...(entry.entryId?{entryId:entry.entryId}:{}),wristband:Number(entry.number)}));
    let finish:undefined|{order:number[];didNotFinish:number[]};
    if(additions && newDidNotFinish && original.parts.finish.value) {
      const numberFor=(id:string)=>runners.find(runner=>runner.entryId===id)?.wristband;
      finish={order:original.parts.finish.value.order.map(numberFor).filter((number):number is number=>number!==undefined),didNotFinish:[...original.parts.finish.value.didNotFinish.map(numberFor).filter((number):number is number=>number!==undefined),...runners.filter(runner=>!runner.entryId).map(runner=>runner.wristband)]};
    }
    onSave({baseVersion:original.parts.runners.version,finishVersion:original.parts.finish.version,runners,keptWarnings:kept,comment,...(finish?{finish}:{})});
  }
  function add() {setError('');setEntries(previous=>[...previous,{entryId:undefined,number:''}]);setEditing(entries.length);}
  function remove(index:number) {setError('');setEditing(null);setEntries(previous=>previous.filter((_old,at)=>at!==index));}
  const disabled=busy || checking;
  return <div ref={region} className="sheet-stack">{error && <p role="alert">{error}</p>}{step==='input'?<form className="sheet-stack" onSubmit={event=>void check(event)}>
    <p className="sheet-hint">Tap a runner to change their number: they keep their place and time. Remove or add a runner only when the runners themselves changed.</p>
    <ol ref={rows} className="lead-runner-rows" aria-label="Runners">{entries.map((entry,index)=><li key={entry.entryId||`new-${index}`}>{editing===index?<div className="lead-editing">
      <NumberEntry label={`Wristband for runner ${index+1}`} placeholder="e.g. 2045" value={entry.number} busy={disabled} nextLabel="Done" selectKey={index}
        onChange={digits=>setEntries(previous=>previous.map((old,at)=>at===index?{...old,number:digits}:old))} onNext={()=>setEditing(null)}/>
    </div>:<>
      <button type="button" disabled={disabled} className="lead-runner-row" aria-label={`Runner ${index+1} · ${entry.number||'Number needed'}`} onClick={()=>setEditing(index)}>
        <span className="row-label">Runner {index+1}</span><strong>{entry.number||'Number needed'}</strong>{pencil}</button>
      <button type="button" disabled={disabled} className="lead-remove" aria-label={`Remove runner ${index+1}`} onClick={()=>remove(index)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </>}</li>)}</ol>
    {entries.length===0 && <p className="sheet-hint">No runners</p>}
    <div className="sheet-actions"><button type="button" className="button-secondary" disabled={disabled} onClick={add}>Add runner</button><button disabled={disabled}>{checking?'Checking…':'Review runner list'}</button></div>
    </form>:step==='warnings'?<div className="warning-box">{warnings.map((warning,index)=><p key={index}>{warning.message}</p>)}<div className="warning-actions"><button disabled={busy} onClick={()=>setStep('input')}>Fix runners</button><button className="button-secondary" disabled={busy} onClick={()=>{setKept([...new Set(warnings.map(warning=>warning.number))]);setStep('review');}}>Keep warnings</button></div></div>:<><h4>{entries.length} runners. Is that right?</h4><p>{entries.map(entry=>entry.number).join(' · ')||'No runners'}</p>{warnings.map((warning,index)=><p className="warning-box" key={index}>{warning.message} · Warning kept</p>)}{additions && original.parts.finish.value && <><p>Finish order must be recorded again for new runners, unless they did not finish.</p><label className="lead-checkbox"><input type="checkbox" checked={newDidNotFinish} disabled={busy} onChange={event=>setNewDidNotFinish(event.target.checked)}/>New runners did not finish</label></>}
      <label>Comment (optional)<textarea disabled={busy} maxLength={1000} value={comment} onChange={event=>setComment(event.target.value)}/></label><button disabled={busy} onClick={save}>{busy?'Saving…':'Save runner list'}</button><button className="button-secondary" disabled={busy} onClick={()=>setStep('input')}>Change runner list</button>
    </>}
    <button className="button-secondary" disabled={disabled} onClick={onClose}>Cancel correction</button></div>;
}
