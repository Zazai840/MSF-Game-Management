import { useEffect,useRef,useState,type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DayLeadItem,EventResultsRead,ResultsRead,ResultsTarget } from '../../shared/lead-results.js';
import { raceName,roleLabels,roleSteps,stepLabels,stepsOf,usualRunnersPerRace,usualSizeApplies,type RaceFlowRead,type Role,type Step } from '../../shared/race-flow.js';
import { api,StaleRequest } from '../api.js';
import { useLive } from '../live.js';
import { RacePage } from '../lead/RacePage.js';
import { FinalSheet,HeatChips,Icon,RaceBar,RoleChip,StepStrip } from './parts.js';
import { LeadStep,StepRecord,issueStep } from './LeadStep.js';
import { FinishLine,StartLine,Timer } from './Steps.js';
import { useFlowWrite } from './writes.js';

/** What a done mark hands back for the toast on Races: the step, the part version it was marked at, and its words. */
export interface SavedStep { raceId:string; step:Step; version:number; message:string }
/** This race's open lead items (To check), read while a lead has it open. */
function useRaceIssues(raceId:string,on:boolean) {
  const [items,setItems]=useState<DayLeadItem[]>([]);
  const refresh=()=>api<ResultsRead>('lead').then(read=>setItems(read.needsYou.filter(item=>item.raceId===raceId || item.tieId && item.race?.id===raceId))).catch(error=>{if(!(error instanceof StaleRequest)) {/* keep the last */}});
  useEffect(()=>{
    if(!on) return;
    void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    return ()=>clearInterval(timer);
  },[raceId,on]);
  return {items,refresh};
}
/**
 * The race screen, one route per race (/races/:raceId), the same shell for every role: the app bar, the event group's
 * heat chips (swipe the body to move between heats), the three steps, and only the body for my role. A lead gets the
 * steps as tabs, each editable, with problems on the row they are about, and "⋯" for the race actions.
 */
export function RaceShell({raceId,step:opened,role,onRole,onBack,onRace,onSaved,onResults}:{raceId:string;step?:Step;role:Role;onRole:()=>void;onBack:()=>void;
  onRace:(id:string,step?:Step)=>void;onSaved:(saved:SavedStep)=>void;onResults:(target:ResultsTarget)=>void}) {
  const {snapshot,error,offer}=useLive<RaceFlowRead>(`live/races/${raceId}`);
  const flow=useFlowWrite(raceId,offer);
  const lead=role==='lead',issues=useRaceIssues(raceId,lead);
  const [tab,setTab]=useState<Step>(opened??'runners');
  // Another role's step, opened read-only from the step strip.
  const [viewing,setViewing]=useState<Step|null>(null);
  const [actions,setActions]=useState(false);
  const [confirmingFinal,setConfirmingFinal]=useState(false);
  const [failure,setFailure]=useState('');
  // "Show latest" starts the step's body afresh from what the server has.
  const [fresh,setFresh]=useState(0);
  const swipe=useRef<{x:number;y:number}|null>(null);
  if(!snapshot) return <><RaceBar title="Race" code="" role={role} onBack={onBack}><RoleChip role={role} onOpen={onRole}/></RaceBar>
    <main className="rz-main"><p className={error?'rz-error':'rz-empty'} role={error?'alert':undefined}>{error||'Opening…'}</p></main></>;
  const {race,group}=snapshot,event=group.event,shown=stepsOf(race),own=lead?null:roleSteps[role];
  const step=lead?(shown.includes(tab)?tab:'runners'):viewing && shown.includes(viewing)?viewing:own!;
  const looking=own!==null && step!==own;
  const roleFor=(at:Step)=>roleLabels[(Object.keys(roleSteps) as Array<keyof typeof roleSteps>).find(key=>roleSteps[key]===at)!];
  const summary=group.races.find(item=>item.id===race.id)!,index=group.races.indexOf(summary);
  const locked=race.state==='saved' || race.stageComplete===true;
  async function markDone(done:Step) {
    const answer=await flow.write(`steps/${done}/done`,{});
    if(typeof answer!=='object') return;
    // A lead marking a step done stays on the race; everyone else goes back to Races with the toast.
    if(lead) return;
    onSaved({raceId:race.id,step:done,version:answer.steps[done]!.version,message:`${stepLabels[done]} saved · ${event.section} ${raceName(race)}`});
  }
  async function create(kind:'heat'|'final') {
    setFailure('');
    try {const made=await api<RaceFlowRead>('races',{eventCode:event.code,kind,number:group.nextHeat});onRace(made.race.id);}
    catch(failure) {setFailure(failure instanceof Error?failure.message:'Could not connect - please try again');}
  }
  function swiped(touch:TouchEvent) {
    const start=swipe.current,end=touch.changedTouches[0];swipe.current=null;
    if(!start || !end) return;
    const dx=end.clientX-start.x,dy=end.clientY-start.y;
    if(Math.abs(dx)<70 || Math.abs(dy)>Math.abs(dx)/2) return;
    const next=group.races[index+(dx<0?1:-1)];
    if(next) onRace(next.id);
  }
  const notes:Partial<Record<Step,string>>={};
  if(lead) {
    for(const item of issues.items) {const at=issueStep(item);notes[at]=`${issues.items.filter(other=>issueStep(other)===at).length} to check`;}
    if(!notes.runners && usualSizeApplies(event) && (race.parts.runners.value?.length||0)>usualRunnersPerRace) notes.runners='More than usual';
  }
  const reason=lead?group.finalReason:null;
  const props={read:snapshot,flow,onDone:(done:Step)=>void markDone(done),locked};
  return <>
    <RaceBar title={`${event.name} · ${event.section}`} code={event.code} role={role} onBack={onBack}>
      <RoleChip role={role} onOpen={onRole}/>
      {lead && <button type="button" className="rz-iconbtn" aria-label="Race actions: re-run, delete, correct, disqualify" onClick={()=>setActions(true)}><Icon name="more"/></button>}
    </RaceBar>
    <nav className="rz-heats-nav" aria-label="Heats"><HeatChips races={group.races} role={role} current={race.id} nextHeat={group.nextHeat} onRace={onRace}
      onAdd={group.heatsOpen?()=>void create('heat'):undefined} onFinal={lead && group.finalAvailable?()=>setConfirmingFinal(true):undefined}
      finalReason={reason?{line:reason.line,onOpen:()=>reason.step===null?onResults({event}):reason.raceId===race.id?setTab(reason.step):onRace(reason.raceId,reason.step)}:undefined}/></nav>
    <StepStrip race={summary} role={role} label={`${raceName(race)} ${lead?'steps':'progress'}`} selected={step} onSelect={lead?setTab:at=>setViewing(at===own?null:at)} notes={notes}/>
    <div style={{display:'contents'}} onTouchStart={touch=>{const at=touch.touches[0];swipe.current=at?{x:at.clientX,y:at.clientY}:null;}} onTouchEnd={swiped}>
      {(error || failure || flow.changed || locked) && <div className="rz-main" style={{flex:'none',paddingBottom:0}}>
        {error && <p className="rz-note" role="status">{error}</p>}
        {failure && <p className="rz-error" role="alert">{failure}</p>}
        {flow.changed && <div className="rz-callout rz-callout--status" role="status"><p className="rz-callout__msg"><Icon name="warning"/><span>{flow.changed.by?`${flow.changed.by} changed this a moment ago.`:'Someone changed this a moment ago.'}</span></p>
          <div className="rz-callout__actions"><button type="button" className="rz-btn rz-btn--primary" onClick={()=>{flow.clearChanged();setFresh(fresh+1);}}>Show latest</button></div></div>}
        {race.stageComplete?<p className="rz-note" role="status">Stage complete - ask a lead</p>:race.state==='saved' && !lead && <p className="rz-note" role="status">{raceName(race)} is saved. Ask a lead to change it.</p>}
      </div>}
      {looking?<main className="rz-main" role="tabpanel" aria-label={`${stepLabels[step]}, read-only`}>
        <div className="rz-readonly" role="status">
          <p className="rz-readonly__text"><Icon name="eye"/><span>Viewing {stepLabels[step]} · read-only. It's the {roleFor(step)}'s step; you're the {roleLabels[role]}.</span></p>
          <div className="rz-readonly__actions"><button type="button" className="rz-btn rz-btn--small rz-btn--primary" onClick={()=>setViewing(null)}>Back to {stepLabels[own!]}</button>
            <button type="button" className="rz-btn rz-btn--small" onClick={onRole}>Switch job</button></div>
        </div>
        <StepRecord read={snapshot} step={step}/>
      </main>
      :lead?<LeadStep key={`${race.id}:${step}:${fresh}`} step={step} {...props} issues={issues.items} onIssue={()=>void issues.refresh()} onResults={onResults} onActions={()=>setActions(true)}/>
        :step==='runners'?<StartLine key={`${race.id}:${fresh}`} {...props}/>:step==='positions'?<FinishLine key={`${race.id}:${fresh}`} {...props}/>:<Timer key={`${race.id}:${fresh}`} {...props}/>}
    </div>
    {confirmingFinal && <FinalSheet group={group} onClose={()=>setConfirmingFinal(false)} onMake={()=>{setConfirmingFinal(false);void create('final');}}/>}
    {actions && <LeadRaceSheet raceId={race.id} eventCode={event.code} onClose={()=>{setActions(false);void issues.refresh();}} onRemoved={()=>{setActions(false);onBack();}}/>}
  </>;
}
/**
 * The lead's race actions (Re-run, Delete, Correct times, order or runners, Disqualify a runner): today's lead race
 * page, over the race screen. It keeps the older look, so it opens outside the race flow's screen.
 */
function LeadRaceSheet({raceId,eventCode,onClose,onRemoved}:{raceId:string;eventCode:string;onClose:()=>void;onRemoved:()=>void}) {
  const [results,setResults]=useState<EventResultsRead|null>(null);
  useEffect(()=>{void api<EventResultsRead>(`lead/events/${encodeURIComponent(eventCode)}/results`).then(setResults).catch(()=>{});},[eventCode]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape') onClose();};addEventListener('keydown',key);return ()=>removeEventListener('keydown',key);},[]);
  return createPortal(<div className="lead-race-overlay" role="dialog" aria-modal="true" aria-label="Race actions">
    <div className="lead-race-panel"><div className="lead-race-head"><h2>Race actions</h2><button className="button-secondary" onClick={onClose}>Close</button></div>
      <RacePage raceId={raceId} onSaved={setResults} onClose={onRemoved} actionableRunners={results?.results.actionableRunners}/>
    </div>
  </div>,document.body);
}
