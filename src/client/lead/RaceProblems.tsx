import { useEffect,useState } from 'react';
import type { DayLeadItem,EventResultsRead,ResultsRead } from '../../shared/lead-results.js';
import type { RaceRead } from '../../shared/races.js';
import { failureLine } from '../../shared/request-failure.js';
import { itemTeams,toCheckWording } from '../../shared/to-check.js';
import { api,StaleRequest } from '../api.js';
import { Callout } from '../races/parts.js';
/** This race's open To check items (its own, and each tie it is in), read every 5 s while a lead has it open. */
export function useRaceIssues(raceId:string) {
  const [items,setItems]=useState<DayLeadItem[]>([]);
  const refresh=()=>api<ResultsRead>('lead').then(read=>setItems(read.needsYou.filter(item=>item.raceId===raceId || item.tie?.raceIds.includes(raceId)))).catch(error=>{if(!(error instanceof StaleRequest)) {/* keep the last */}});
  useEffect(()=>{
    void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    return ()=>clearInterval(timer);
  },[raceId]);
  return {items,refresh};
}
/** The kinds "It's right" accepts. A child who ran twice and a tie are settled on their own screens. */
const acceptable=(item:DayLeadItem)=>item.kind==='warning' || item.kind==='two-relays' || item.kind==='ran-short' || item.kind==='added-at-finish' || item.kind==='times-out-of-order';
/** A problem's way to settle it: the button's words and what it opens. */
export interface ProblemFix { label:string; open:()=>void }
/**
 * A race's open To check items as callouts, in the To check wording, a relay's teams with their four children. A kind
 * that can be accepted has "It's right": it clears the problem, records who accepted it, and hands `onAccepted` the
 * event's results as saved. Every problem has the button `fix` gives it.
 */
export function RaceProblems({items,race,fix,onAccepted}:{items:readonly DayLeadItem[];race:Pick<RaceRead,'id'|'parts'>;fix:(item:DayLeadItem)=>ProblemFix;onAccepted:(next:EventResultsRead)=>void}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  async function accept(item:DayLeadItem) {
    setBusy(item.id);setError('');
    try {
      if(item.kind==='times-out-of-order') {
        const count=race.parts.runners.value?.length||0,places=[...(race.parts.times.value?.places||[])];
        while(places.length<count) places.push(null);
        onAccepted(await api<EventResultsRead>(`lead/races/${race.id}/times`,{baseVersion:race.parts.times.version,places,acceptOutOfOrder:true}));
      } else onAccepted(await api<EventResultsRead>(`lead/races/${item.raceId}/runners/${item.entryId}/${item.kind==='added-at-finish'?'mark-added-checked':'mark-warning-checked'}`,{}));
    } catch(failure) {setError(failureLine(failure,'save'));}
    finally {setBusy('');}
  }
  return <>{error && <Callout message={error}/>}{items.map(item=>{const words=toCheckWording(item),{label,open}=fix(item);
    return <Callout key={item.id} message={<><span><strong>{words.title}.</strong> {words.explanation}</span>{itemTeams(item,race.parts.runners.value||[]).map(team=><span key={team} className="rz-callout__team">{team}</span>)}</>}
      actions={<>{acceptable(item) && <button type="button" className="rz-btn" disabled={busy===item.id} onClick={()=>void accept(item)}>It's right</button>}
        <button type="button" className="rz-btn rz-btn--primary" onClick={open}>{label}</button></>}/>;})}</>;
}
