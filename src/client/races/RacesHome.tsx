import { useEffect,useState } from 'react';
import { clockWithSeconds } from '../../shared/clock.js';
import type { DayLeadItem,ResultsRead } from '../../shared/lead-results.js';
import { groupDone,groupStatus,raceName,raceSections,type RaceGroup,type RacesRead,type Role } from '../../shared/race-flow.js';
import { toCheckWording } from '../../shared/to-check.js';
import { api,StaleRequest,type HomeTab } from '../api.js';
import { useLive } from '../live.js';
import { HeatChips,Icon } from './parts.js';
import { NewRaceSheet,type NewRaceChoice } from './NewRaceSheet.js';
import type { SavedStep } from './RaceShell.js';
import { Toast } from './Toast.js';

const tabs:Array<[HomeTab,string]>=[['races','Races'],['hurdles','Hurdles'],['relays','Relays']];
/** Races · Hurdles · Relays, remembered per phone. */
export function EventTabs({tab,onTab}:{tab:HomeTab;onTab:(tab:HomeTab)=>void}) {
  return <nav className="rz-tabs" aria-label="Event type">{tabs.map(([key,label])=><button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>onTab(key)}>
    {label}{key==='relays' && <span className="rz-beta">Beta</span>}</button>)}</nav>;
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
/** A lead's status line for a group with issues: "Heat 3: A time looks wrong". */
const issueLine=(items:readonly DayLeadItem[])=>items.slice(0,2).map(item=>`${item.race?raceName(item.race):'Event'}: ${toCheckWording(item).title}`).join(' · ')+(items.length>2?` · ${items.length-2} more`:'');
/**
 * Races, the new Home: the event groups of this tab behind Races · Hurdles · Relays, live from the races stream, in
 * Ready for you (a race my step can be worked on now; for a lead, a group with open issues), In progress and Done.
 * Each card's chips open a race; "+" makes the next heat and "+ Final" the final. Relays keep today's list (App).
 */
export function RacesHome({tab,onTab,role,onRace,saved,onSavedShown}:{tab:Exclude<HomeTab,'relays'>;onTab:(tab:HomeTab)=>void;role:Role;onRace:(id:string)=>void;
  saved:SavedStep|null;onSavedShown:()=>void}) {
  const {snapshot,error,offer}=useLive<RacesRead>('live/races');
  const [arrived,setArrived]=useState('');
  useEffect(()=>{if(snapshot) setArrived(clockWithSeconds(new Date()));},[snapshot]);
  const [creating,setCreating]=useState<NewRaceChoice|null>(null);
  const [failure,setFailure]=useState('');
  const issues=useLeadItems(role==='lead');
  const groups=(snapshot?.groups||[]).filter(group=>group.event.type===tab);
  async function make(choice:Required<NewRaceChoice>) {
    setFailure('');
    try {const made=await api<{race:{id:string}}>('races',choice);onRace(made.race.id);}
    catch(failure) {setFailure(failure instanceof Error?failure.message:'Could not connect - please try again');}
  }
  const card=(group:RaceGroup)=>{
    const own=issues.filter(item=>item.event.code===group.event.code);
    return <article key={group.event.id} className="rz-racecard" aria-label={`${group.event.name} · ${group.event.section}`}>
      <div className="rz-racecard__head"><h3 className="rz-racecard__title">{group.event.name} · {group.event.section}</h3>{role==='lead' && <span className="rz-code-tag">{group.event.code}</span>}</div>
      <p className="rz-racecard__status">{role==='lead'?own.length?issueLine(own):groupDone(group)?'Every race saved':'No issues':groupStatus(group,role)}</p>
      <HeatChips races={group.races} role={role} nextHeat={group.nextHeat} onRace={onRace}
        onAdd={group.heatsOpen?()=>setCreating({eventCode:group.event.code,kind:'heat',number:group.nextHeat,direct:true}):undefined}
        onFinal={group.finalAvailable?()=>void make({eventCode:group.event.code,kind:'final',number:0,direct:true}):undefined}/>
    </article>;
  };
  const sections=role==='lead'?leadSections(groups,issues):raceSections(groups,role);
  return <>
    <EventTabs tab={tab} onTab={onTab}/>
    <main className="rz-main rz-main--cards">
      {!snapshot?<p className={error?'rz-error':'rz-empty'} role={error?'alert':undefined}>{error||'Opening…'}</p>:error && <p className="rz-note" role="status">{error}</p>}
      {failure && <p className="rz-error" role="alert">{failure}</p>}
      {snapshot && !groups.some(group=>group.races.length) && <p className="rz-empty">No races yet. Tap New race when a race lines up.</p>}
      {sections.ready.length>0 && <><h2 className="rz-section">Ready for you</h2>{sections.ready.map(card)}</>}
      {sections.inProgress.length>0 && <><h2 className="rz-section">In progress</h2>{sections.inProgress.map(card)}</>}
      {sections.done.length>0 && <details className="rz-disclosure"><summary>Done ({sections.done.length})</summary><div className="rz-disclosure__cards">{sections.done.map(card)}</div></details>}
    </main>
    <footer className="rz-footer rz-footer--sticky rz-footer--home">
      <p className="rz-refresh" aria-live="polite">Updated at {arrived||'…'} <button className="rz-btn rz-btn--small" type="button" onClick={()=>void api<RacesRead>('races').then(offer).catch(()=>{})}>Refresh</button></p>
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>setCreating({})}><Icon name="plus"/>New race</button>
    </footer>
    {saved && <Toast key={`${saved.raceId}:${saved.step}:${saved.version}`} saved={saved} race={snapshot?.groups.flatMap(group=>group.races).find(race=>race.id===saved.raceId)} onOpen={onRace} onClose={onSavedShown}/>}
    {creating && snapshot && <NewRaceSheet groups={groups} role={role} choice={creating} onClose={()=>setCreating(null)} onCreate={choice=>{setCreating(null);void make(choice);}}/>}
  </>;
}
/** A lead's sections: groups with open issues are ready for them, newest issue first; the rest as for everyone. */
function leadSections(groups:readonly RaceGroup[],issues:readonly DayLeadItem[]) {
  const listed=groups.filter(group=>group.races.length),newest=(a:RaceGroup,b:RaceGroup)=>b.updatedAt.localeCompare(a.updatedAt);
  const latest=(group:RaceGroup)=>issues.filter(item=>item.event.code===group.event.code).map(item=>item.at).sort().at(-1);
  const ready=listed.filter(latest).sort((a,b)=>latest(b)!.localeCompare(latest(a)!));
  const rest=listed.filter(group=>!ready.includes(group));
  return {ready,inProgress:rest.filter(group=>!groupDone(group)).sort(newest),done:rest.filter(groupDone).sort(newest)};
}
