import { eventTitle } from '../../shared/day.js';
import { useEffect,useState } from 'react';
import type { DayLeadItem,ResultsRead,ResultsTarget } from '../../shared/lead-results.js';
import { cardProblems,finalMade,groupStatus,leadCardLine,leadSections,medalsToConfirm,raceSections,volunteerFinalLine,type RaceGroup,type RacesRead,type Role,type Step } from '../../shared/race-flow.js';
import { api,homeTabOf,StaleRequest,type HomeTab } from '../api.js';
import { failureLine } from '../../shared/request-failure.js';
import { racesLive,useLive } from '../live.js';
import { Callout,CodeTag,FinalReasonButton,FinalSheet,HeatChips,Icon,Opening } from './parts.js';
import { SlidingTabs } from './SlidingTabs.js';
import { UpdatedAt } from './UpdatedAt.js';
import { useScreenName } from '../shell/addresses.js';
import { NewRaceSheet,type NewRaceChoice } from './NewRaceSheet.js';

const tabs:Array<[HomeTab,string]>=[['races','Races'],['relays','Relays']];
/** Races · Relays, remembered per phone: races and hurdles events are on Races, relays on Relays. The current tab's cell slides. */
export const EventTabs=({tab,onTab}:{tab:HomeTab;onTab:(tab:HomeTab)=>void})=><SlidingTabs set="event-type" label="Event type" className="rz-tabs" tabs={tabs} current={tab} onTab={onTab}/>;
/** A lead's open issues, by event code: the To check items, read while a lead has Races open. */
function useLeadItems(on:boolean) {
  const [items,setItems]=useState<DayLeadItem[]>([]);
  useEffect(()=>{
    if(!on) {setItems([]);return;}
    let live=true;
    const read=()=>{if(document.visibilityState==='visible') api<ResultsRead>('lead').then(next=>{if(live) setItems(next.needsYou);}).catch(error=>{if(!(error instanceof StaleRequest)) {/* the cards keep the last issues */}});};
    read();const timer=window.setInterval(read,5000);
    return ()=>{live=false;clearInterval(timer);};
  },[on]);
  return items;
}
/**
 * Races, the new Home: the event groups of this tab behind Races · Relays, live from the races stream, in
 * Ready for you (a race my step can be worked on now; for a lead it is Action required: a group with open issues or
 * medals waiting on their Confirm), In progress and Done, each in the day's programme.
 * A lead's card with To check problems shows them as buttons (`cardProblems`) in place of its status line.
 * Each card's chips open a race; "+" makes the next heat and a lead's "+ Final", after a confirm, the final. A relay's
 * teams are typed into its heats, so a relay is listed once it has a heat, as any event is.
 */
export function RacesHome({tab,onTab,role,gone,onRace,onResults}:{tab:HomeTab;onTab:(tab:HomeTab)=>void;role:Role;gone:string;
  onRace:(id:string,step?:Step)=>void;onResults:(target:ResultsTarget)=>void}) {
  // Races seen before opens at once with what it showed last; the stream then brings it up to date.
  const {snapshot,arrived,error,refresh}=useLive<RacesRead>(racesLive,{remember:true});
  const [creating,setCreating]=useState<NewRaceChoice|null>(null);
  // The event code whose final a lead is asked to confirm; the sheet reads its group live.
  const [confirming,setConfirming]=useState<string|null>(null);
  const [failure,setFailure]=useState('');
  const issues=useLeadItems(role==='lead');
  useScreenName('Races');
  const all=snapshot?.groups||[],groups=all.filter(group=>homeTabOf(group.event)===tab);
  const finalFor=all.find(group=>group.event.code===confirming);
  async function make(choice:Required<NewRaceChoice>) {
    setFailure('');
    try {
      const made=await api<{race:{id:string}}>('races',choice);
      onRace(made.race.id);
    }
    catch(failure) {setFailure(failureLine(failure,'save'));}
  }
  const card=(group:RaceGroup)=>{
    const confirm=role==='lead'?medalsToConfirm(group,issues):null,problems=role==='lead'?cardProblems(group,issues):null;
    return <article key={group.event.id} className="rz-racecard" aria-label={eventTitle(group.event)}>
      <div className="rz-racecard__head"><h3 className="rz-racecard__title">{eventTitle(group.event)}</h3><CodeTag code={group.event.code} role={role}/></div>
      {!problems?.buttons.length && <p className="rz-racecard__status">{role==='lead'?leadCardLine(group,issues):groupStatus(group,role)}</p>}
      {problems?.buttons.map((button,index)=><button key={index} type="button" className="rz-btn rz-btn--primary rz-btn--block" onClick={()=>onResults(button.target)}>{button.label.replace(' · ',' · ')/* words that take two rows break after the dot, not before it */}</button>)}
      {problems && problems.more>0 && <button type="button" className="rz-heat-reason" onClick={()=>onResults({event:group.event})}>{problems.more} more</button>}
      {confirm && <button type="button" className="rz-btn rz-btn--primary rz-btn--block" onClick={()=>onResults({event:group.event,stage:confirm})}>Confirm the medals</button>}
      {group.races.length>0 && <HeatChips races={group.races} role={role} nextHeat={group.nextHeat} onRace={onRace}
        onAdd={group.heatsOpen?()=>setCreating({eventCode:group.event.code,kind:'heat',number:group.nextHeat,direct:true}):undefined}
        onFinal={role==='lead' && group.finalAvailable?()=>setConfirming(group.event.code):undefined}
        finalHeld={role==='lead' && !!group.finalReason} finalReason={problems?.finalReason?<FinalReasonButton group={group} onRace={onRace} onResults={onResults}/>:undefined}/>}
      {role!=='lead' && group.races.length>0 && volunteerFinalLine(group) && <p className="rz-field__hint">{volunteerFinalLine(group)}</p>}
    </article>;
  };
  const sections=role==='lead'?leadSections(groups,issues):raceSections(groups,role);
  return <>
    <EventTabs tab={tab} onTab={onTab}/>
    <main className="rz-main rz-main--cards">
      {gone && <Callout status message={gone}/>}
      {!snapshot?error?<Callout message={error}/>:<Opening/>:error && <p className="rz-note" role="status">{error}</p>}
      {snapshot && !groups.some(group=>group.races.length) && <p className="rz-empty">{tab==='relays'?'No relays yet. Tap New relay when a relay lines up.':'No races yet. Tap New race when a race lines up.'}</p>}
      {sections.ready.length>0 && <><h2 className="rz-section">{role==='lead'?'Action required':'Ready for you'}</h2>{sections.ready.map(card)}</>}
      {sections.inProgress.length>0 && <><h2 className="rz-section">In progress</h2>{sections.inProgress.map(card)}</>}
      {sections.done.length>0 && <details className="rz-disclosure"><summary>Done ({sections.done.length})</summary><div className="rz-disclosure__cards">{sections.done.map(card)}</div></details>}
    </main>
    <footer className="rz-footer rz-footer--sticky rz-footer--home">
      <UpdatedAt time={arrived} onRefresh={refresh}/>
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>setCreating({})}><Icon name="plus"/>{tab==='relays'?'New relay':'New race'}</button>
    </footer>
    {creating && snapshot && <NewRaceSheet groups={groups} relays={tab==='relays'} role={role} choice={creating} onRace={onRace} onResults={onResults} failure={failure} onClose={()=>{setCreating(null);setFailure('');}} onCreate={choice=>{
      const group=all.find(item=>item.event.code===choice.eventCode),made=group && finalMade(group);
      if(choice.kind==='final' && !made) {setCreating(null);setConfirming(choice.eventCode);} else void make(choice);
    }}/>}
    {finalFor && <FinalSheet group={finalFor} failure={failure} onClose={()=>{setConfirming(null);setFailure('');}} onMake={()=>void make({eventCode:finalFor.event.code,kind:'final',number:0,direct:true})}/>}
  </>;
}
