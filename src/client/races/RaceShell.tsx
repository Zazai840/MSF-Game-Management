import { eventTitle } from '../../shared/day.js';
import { useEffect,useRef,useState,type ReactNode,type TouchEvent } from 'react';
import type { DayLeadItem,LeadRaceRead,ResultsRead,ResultsTarget } from '../../shared/lead-results.js';
import { changedLine,finalMade,raceFinishedLine,raceName,roleLabels,roleSteps,stepLabels,stepsOf,usualRunnersPerRace,usualSizeApplies,type RaceFlowRead,type Role,type Step } from '../../shared/race-flow.js';
import { api,homeTabOf,StaleRequest,type HomeTab } from '../api.js';
import { useLive } from '../live.js';
import { RaceActions } from '../lead/RaceActions.js';
import { Callout,FinalReasonButton,FinalSheet,HeatChips,Icon,RaceBar,RoleChip,Sheet,StepStrip } from './parts.js';
import { LeadStep,StepRecord,issueStep } from './LeadStep.js';
import { FinishLine,StartLine,Timer } from './Steps.js';
import { NewRaceSheet,type NewRaceChoice } from './NewRaceSheet.js';
import { useFlowWrite } from './writes.js';
import { failureLine } from '../../shared/request-failure.js';
import { useScreenName,type View } from '../shell/addresses.js';

/** What a done mark hands back for the toast on Races: the step, the part version it was marked at, its words, and the Races-home tab holding its event. */
export interface SavedStep { raceId:string; step:Step; version:number; message:string; tab:HomeTab }
/** This race's open lead items (To check), read while a lead has it open. */
function useRaceIssues(raceId:string,on:boolean) {
  const [items,setItems]=useState<DayLeadItem[]>([]);
  const refresh=()=>api<ResultsRead>('lead').then(read=>setItems(read.needsYou.filter(item=>item.raceId===raceId || item.tie?.raceIds.includes(raceId)))).catch(error=>{if(!(error instanceof StaleRequest)) {/* keep the last */}});
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
export function RaceShell({raceId,step:opened,role,avatar,onRole,onBack,onGone,onRace,onSaved,onResults,onOpen}:{raceId:string;step?:Step;role:Role;avatar:ReactNode;onRole:()=>void;onBack:()=>void;
  onGone:(line:string)=>void;onRace:(id:string,step?:Step)=>void;onSaved:(saved:SavedStep)=>void;onResults:(target:ResultsTarget)=>void;onOpen:(view:View)=>void}) {
  const {snapshot,error,gone,offer}=useLive<RaceFlowRead>(`live/races/${raceId}`);
  // A race a lead removed for good (an unrun final, a permanent delete) has nothing left to show: back to Races.
  useEffect(()=>{if(gone) onGone(snapshot?`A lead removed ${snapshot.group.event.section} ${raceName(snapshot.race)}`:'That race is gone');},[gone]);
  const flow=useFlowWrite(raceId,offer);
  const lead=role==='lead',issues=useRaceIssues(raceId,lead);
  const [tab,setTab]=useState<Step>(opened??'runners');
  // Another role's step, opened read-only from the step strip.
  const [viewing,setViewing]=useState<Step|null>(null);
  const [actions,setActions]=useState(false);
  const [confirmingFinal,setConfirmingFinal]=useState(false);
  // "+" asks first, in New race's sheet: the heat it offers, as a Races card's "+" does.
  const [adding,setAdding]=useState<NewRaceChoice|null>(null);
  const [failure,setFailure]=useState('');
  // "Show latest" starts the step's body afresh from what the server has.
  const [fresh,setFresh]=useState(0);
  const swipe=useRef<{x:number;y:number}|null>(null);
  // "Back to Heat 2" on a lead screen opened from here (Open in Results).
  useScreenName(snapshot?raceName(snapshot.race):'Race');
  if(!snapshot) return <><RaceBar title="Race" code="" role={role} onBack={onBack}><RoleChip role={role} onOpen={onRole}/>{avatar}</RaceBar>
    <main className="rz-main">{error?<Callout message={error}/>:<p className="rz-empty">Opening…</p>}</main></>;
  const {race,group}=snapshot,event=group.event,shown=stepsOf(race),own=lead?null:roleSteps[role];
  const step=lead?(shown.includes(tab)?tab:'runners'):viewing && shown.includes(viewing)?viewing:own!;
  const looking=own!==null && step!==own;
  // A final has no Times step, so the Timer gets a plain line, not the step's body.
  const noStep=own!==null && !shown.includes(own);
  const roleFor=(at:Step)=>roleLabels[(Object.keys(roleSteps) as Array<keyof typeof roleSteps>).find(key=>roleSteps[key]===at)!];
  const summary=group.races.find(item=>item.id===race.id)!,index=group.races.indexOf(summary);
  const locked=race.state==='saved' || race.stageComplete===true;
  async function markDone(done:Step) {
    // Read before the write: a lead correcting a step already done stays on the race.
    const already=snapshot!.steps[done]?.state==='done';
    const answer=await flow.write(`steps/${done}/done`,{});
    if(typeof answer!=='object' || (lead && already)) return;
    onSaved({raceId:race.id,step:done,version:answer.steps[done]!.version,message:`${stepLabels[done]} saved · ${event.section} ${raceName(race)}`,tab:homeTabOf(event)});
  }
  async function create(kind:'heat'|'final',number=group.nextHeat) {
    setFailure('');
    try {const made=await api<RaceFlowRead>('races',{eventCode:event.code,kind,number});setAdding(null);onRace(made.race.id);}
    catch(failure) {setFailure(failureLine(failure,'save'));}
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
  const props={read:snapshot,flow,onDone:(done:Step)=>void markDone(done),locked};
  return <>
    <RaceBar title={eventTitle(event)} code={event.code} role={role} onBack={onBack}>
      <RoleChip role={role} onOpen={onRole}/>
      {lead && <button type="button" className="rz-iconbtn" aria-label="Race actions" onClick={()=>setActions(true)}><Icon name="more"/></button>}
      {avatar}
    </RaceBar>
    <nav className="rz-heats-nav" aria-label="Heats"><HeatChips races={group.races} role={role} current={race.id} nextHeat={group.nextHeat} onRace={onRace}
      onAdd={group.heatsOpen?()=>setAdding({eventCode:event.code,kind:'heat',number:group.nextHeat,direct:true}):undefined} onFinal={lead && group.finalAvailable?()=>setConfirmingFinal(true):undefined}
      finalReason={lead && group.finalReason?<FinalReasonButton group={group} onRace={(id,at)=>id===race.id?setTab(at):onRace(id,at)} onResults={onResults}/>:undefined}/></nav>
    <StepStrip race={summary} role={role} label={`${raceName(race)} ${lead?'steps':'progress'}`} selected={step} onSelect={lead?setTab:at=>setViewing(at===own?null:at)} notes={notes} relay={event.relay}/>
    <div style={{display:'contents'}} onTouchStart={touch=>{const at=touch.touches[0];swipe.current=at?{x:at.clientX,y:at.clientY}:null;}} onTouchEnd={swiped}>
      {(error || failure || flow.changed || locked) && <div className="rz-main" style={{flex:'none',paddingBottom:0}}>
        {error && <p className="rz-note" role="status">{error}</p>}
        {failure && !adding && <Callout message={failure}/>}
        {flow.changed && <div className="rz-callout rz-callout--status" role="status"><p className="rz-callout__msg"><Icon name="warning"/><span>{changedLine(flow.changed.by)}.</span></p>
          <div className="rz-callout__actions"><button type="button" className="rz-btn rz-btn--primary" onClick={()=>{flow.clearChanged();setFresh(fresh+1);}}>Show latest</button></div></div>}
        {race.stageComplete?<p className="rz-note" role="status">{raceFinishedLine({kind:race.kind,event})}</p>:race.state==='saved' && !lead && <p className="rz-note" role="status">{raceName(race)} is saved. Ask a lead to change it.</p>}
      </div>}
      {noStep?<main className="rz-main">
        <div className="rz-readonly" role="status">
          <p className="rz-readonly__text"><Icon name="eye"/><span>The final has no times: it's decided by finishing order. Pick a heat above, or switch job to help here.</span></p>
          <div className="rz-readonly__actions"><button type="button" className="rz-btn rz-btn--small" onClick={onRole}>Switch job</button></div>
        </div>
      </main>
      :looking?<main className="rz-main" role="tabpanel" aria-label={`${stepLabels[step]}, read-only`}>
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
    {adding && <NewRaceSheet groups={[group]} relays={event.relay} role={role} choice={adding} onRace={onRace} onResults={onResults} failure={failure}
      onClose={()=>{setAdding(null);setFailure('');}} onCreate={choice=>{
        if(choice.kind==='final' && !finalMade(group)) {setAdding(null);setConfirmingFinal(true);} else void create(choice.kind,choice.number);
      }}/>}
    {confirmingFinal && <FinalSheet group={group} onClose={()=>setConfirmingFinal(false)} onMake={()=>{setConfirmingFinal(false);void create('final');}}/>}
    {actions && <LeadRaceActions raceId={race.id} onOpen={onOpen} onClose={()=>{setActions(false);void issues.refresh();}}/>}
  </>;
}
/** Race actions over the race screen: the lead's read of the race (its corrections need it), then the sheet. */
function LeadRaceActions({raceId,onOpen,onClose}:{raceId:string;onOpen:(view:View)=>void;onClose:()=>void}) {
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState('');
  const load=()=>api<LeadRaceRead>(`lead/races/${raceId}`).then(next=>{setRead(next);setError('');}).catch(failure=>setError(failureLine(failure,'read')));
  useEffect(()=>{void load();},[raceId]);
  // Opening takes a moment; one sheet opens with what it offers, rather than a second sheet replacing a first.
  if(!read) return error?<Sheet title="Race actions" onClose={onClose}><Callout message={error}/></Sheet>:null;
  return <RaceActions read={read} where="screen" onOpen={onOpen} onClose={onClose}/>;
}
