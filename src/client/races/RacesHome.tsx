import { useEffect,useState } from 'react';
import { clockWithSeconds } from '../../shared/clock.js';
import type { DayLeadItem,ResultsRead,ResultsTarget } from '../../shared/lead-results.js';
import { finalMade,groupStatus,leadLine,leadSections,medalsToConfirm,raceSections,volunteerFinalLine,type RaceGroup,type RacesRead,type Role,type Step } from '../../shared/race-flow.js';
import { teamListOf,teamsReadyLine,teamsRow } from '../../shared/teams.js';
import { api,StaleRequest,type HomeTab } from '../api.js';
import { useLive } from '../live.js';
import { Callout,CodeTag,FinalReasonButton,FinalSheet,HeatChips,Icon } from './parts.js';
import { NewRaceSheet,type NewRaceChoice } from './NewRaceSheet.js';
import type { SavedStep } from './RaceShell.js';
import { TeamSheet } from './TeamSheet.js';
import { Toast } from './Toast.js';

const tabs:Array<[HomeTab,string]>=[['races','Races'],['relays','Relays']];
/** Races · Relays, remembered per phone: races and hurdles events are on Races, relays on Relays. */
export function EventTabs({tab,onTab}:{tab:HomeTab;onTab:(tab:HomeTab)=>void}) {
  return <nav className="rz-tabs" aria-label="Event type">{tabs.map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>onTab(key)}>
    {label}</button>)}</nav>;
}
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
 * Ready for you (a race my step can be worked on now; for a lead, a group with open issues or medals waiting on their
 * Confirm), In progress and Done, each in the day's programme.
 * Each card's chips open a race; "+" makes the next heat and a lead's "+ Final", after a confirm, the final. A relay's
 * card also has its Teams row, which opens its teams sheet, and Relays lists a relay with teams but no heats under Teams
 * ready, no heats yet. `me` is this person's profile id: a team another profile set asks before it is changed.
 */
export function RacesHome({tab,me,onTab,role,onRace,onResults,saved,onSavedShown}:{tab:HomeTab;me:string;onTab:(tab:HomeTab)=>void;role:Role;
  onRace:(id:string,step?:Step)=>void;onResults:(target:ResultsTarget)=>void;
  saved:SavedStep|null;onSavedShown:()=>void}) {
  const {snapshot,error,offer}=useLive<RacesRead>('live/races');
  const [arrived,setArrived]=useState('');
  useEffect(()=>{if(snapshot) setArrived(clockWithSeconds(new Date()));},[snapshot]);
  const [creating,setCreating]=useState<NewRaceChoice|null>(null);
  // The event code whose final a lead is asked to confirm; the sheet reads its group live.
  const [confirming,setConfirming]=useState<string|null>(null);
  const [failure,setFailure]=useState('');
  // The relay (event code) whose teams sheet is open, and whether it opened on New team; null code: which relay New team is for.
  const [teamsOf,setTeamsOf]=useState<{code:string|null;start:'list'|'new'}|null>(null);
  const issues=useLeadItems(role==='lead');
  const all=snapshot?.groups||[],groups=all.filter(group=>group.event.relay===(tab==='relays'));
  const finalFor=all.find(group=>group.event.code===confirming);
  const relayGroups=all.filter(group=>group.teams),teamsFor=relayGroups.find(group=>group.event.code===teamsOf?.code);
  const relays=relayGroups.map(teamListOf);
  /** + New team at the foot of Relays: straight to the leg boxes with one relay, else which relay first. */
  const newTeam=()=>setTeamsOf({code:relayGroups.length===1?relayGroups[0].event.code:null,start:'new'});
  async function make(choice:Required<NewRaceChoice>) {
    setFailure('');
    try {
      const made=await api<{race:{id:string}}>('races',choice);
      onRace(made.race.id);
    }
    catch(failure) {setFailure(failure instanceof Error?failure.message:'Could not connect - please try again');}
  }
  const card=(group:RaceGroup)=>{
    const confirm=role==='lead'?medalsToConfirm(group,issues):null;
    return <article key={group.event.id} className="rz-racecard" aria-label={`${group.event.name} · ${group.event.section}`}>
      <div className="rz-racecard__head"><h3 className="rz-racecard__title">{group.event.name} · {group.event.section}</h3><CodeTag code={group.event.code} role={role}/></div>
      <p className="rz-racecard__status">{!group.races.length?teamsReadyLine(group.teams||[]):role!=='lead'?groupStatus(group,role):leadLine(group,issues)}</p>
      {confirm && <button type="button" className="rz-btn rz-btn--primary rz-btn--block" onClick={()=>onResults({event:group.event,stage:confirm})}>Confirm the medals</button>}
      {group.races.length>0 && <HeatChips races={group.races} role={role} nextHeat={group.nextHeat} onRace={onRace}
        onAdd={group.heatsOpen?()=>setCreating({eventCode:group.event.code,kind:'heat',number:group.nextHeat,direct:true}):undefined}
        onFinal={role==='lead' && group.finalAvailable?()=>setConfirming(group.event.code):undefined}
        finalReason={role==='lead' && group.finalReason?<FinalReasonButton group={group} onRace={onRace} onResults={onResults}/>:undefined}/>}
      {role!=='lead' && group.races.length>0 && volunteerFinalLine(group) && <p className="rz-field__hint">{volunteerFinalLine(group)}</p>}
      {group.teams && <button type="button" className="rz-racecard__teams" onClick={()=>setTeamsOf({code:group.event.code,start:'list'})}>{teamsRow(group.teams)}<Icon name="chevron-right"/></button>}
    </article>;
  };
  const sections=role==='lead'?leadSections(groups,issues):raceSections(groups,role);
  return <>
    <EventTabs tab={tab} onTab={onTab}/>
    <main className="rz-main rz-main--cards">
      {!snapshot?error?<Callout message={error}/>:<p className="rz-empty">Opening…</p>:error && <p className="rz-note" role="status">{error}</p>}
      {snapshot && !groups.some(group=>group.races.length || group.teams?.length) && <p className="rz-empty">{tab==='relays'?'No relay teams yet. Tap New team to type the first.':'No races yet. Tap New race when a race lines up.'}</p>}
      {sections.ready.length>0 && <><h2 className="rz-section">Ready for you</h2>{sections.ready.map(card)}</>}
      {sections.inProgress.length>0 && <><h2 className="rz-section">In progress</h2>{sections.inProgress.map(card)}</>}
      {sections.teamsReady.length>0 && <><h2 className="rz-section">Teams ready, no heats yet</h2>{sections.teamsReady.map(card)}</>}
      {sections.done.length>0 && <details className="rz-disclosure"><summary>Done ({sections.done.length})</summary><div className="rz-disclosure__cards">{sections.done.map(card)}</div></details>}
    </main>
    <footer className="rz-footer rz-footer--sticky rz-footer--home">
      <p className="rz-refresh" aria-live="polite">Updated at {arrived||'…'} <button className="rz-btn rz-btn--small" type="button" onClick={()=>void api<RacesRead>('races').then(offer).catch(()=>{})}>Refresh</button></p>
      {tab==='relays'?<div className="rz-footer__pair rz-footer__pair--home">
        <button type="button" className="rz-btn" disabled={!relayGroups.length} onClick={newTeam}><Icon name="plus"/>New team</button>
        <button type="button" className="rz-btn rz-btn--display" onClick={()=>setCreating({})}><Icon name="plus"/>New relay</button>
      </div>:<button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>setCreating({})}><Icon name="plus"/>New race</button>}
    </footer>
    {saved && <Toast key={`${saved.raceId}:${saved.step}:${saved.version}`} saved={saved} race={snapshot?.groups.flatMap(group=>group.races).find(race=>race.id===saved.raceId)} onOpen={onRace} onClose={onSavedShown}/>}
    {creating && snapshot && <NewRaceSheet groups={groups} relays={tab==='relays'} role={role} choice={creating} onRace={onRace} onResults={onResults} failure={failure} onClose={()=>{setCreating(null);setFailure('');}} onCreate={choice=>{
      const group=all.find(item=>item.event.code===choice.eventCode),made=group && finalMade(group);
      if(choice.kind==='final' && !made) {setCreating(null);setConfirming(choice.eventCode);} else void make(choice);
    }}/>}
    {teamsOf && !teamsOf.code && snapshot && <NewRaceSheet groups={relayGroups} relays role={role} choice={{}} onRace={onRace} onResults={onResults} failure="" onClose={()=>setTeamsOf(null)}
      onTeam={code=>setTeamsOf({code,start:'new'})} onCreate={()=>{}}/>}
    {teamsFor && <TeamSheet key={`${teamsFor.event.code}:${teamsOf!.start}`} group={teamsFor} relays={relays} me={me} start={teamsOf!.start} offer={offer} onClose={()=>setTeamsOf(null)}/>}
    {finalFor && <FinalSheet group={finalFor} failure={failure} onClose={()=>{setConfirming(null);setFailure('');}} onMake={()=>void make({eventCode:finalFor.event.code,kind:'final',number:0,direct:true})}/>}
  </>;
}
