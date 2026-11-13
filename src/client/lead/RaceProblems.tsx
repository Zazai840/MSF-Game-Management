import { Fragment,useState } from 'react';
import type { DayLeadItem,EventResultsRead } from '../../shared/lead-results.js';
import type { RaceRead } from '../../shared/races.js';
import type { ResultEntry } from '../../shared/results-rules.js';
import { failureLine } from '../../shared/request-failure.js';
import { acceptable,itemTeams,problemFix,raceCallouts,toCheckWording } from '../../shared/to-check.js';
import { api } from '../api.js';
import { Callout } from '../races/parts.js';
import type { View } from '../shell/addresses.js';
/**
 * Open To check items as callouts, in the To check wording, a relay's teams with their four children (from the
 * event's result `rows`). Every problem has the one button `problemFix` gives it, and `onOpen` moves to its screen.
 * With `race` (a race page) a kind that can be accepted has "It's right" too: it clears the problem, records who
 * accepted it, and hands `onAccepted` the event's results as saved. With no `race` (an event's problems, of several
 * races) each problem has its one button only.
 */
export function RaceProblems({items,rows,race,onOpen,onAccepted}:{items:readonly DayLeadItem[];rows:readonly ResultEntry[];race?:Pick<RaceRead,'id'|'kind'|'event'|'parts'>;onOpen:(view:View)=>void;onAccepted?:(next:EventResultsRead)=>void}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  async function accept(item:DayLeadItem) {
    if(!race || !onAccepted) return;
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
  /** A problem's one button: its words and the screen it opens. */
  const fixOf=(item:DayLeadItem)=>{
    const {label,opens}=problemFix(item,race && {kind:race.kind,relay:race.event.relay}),code=item.event.code,raceId=item.raceId!;
    return {label,open:()=>onOpen(opens==='tie'?{kind:'tie',code,tieId:item.tieId!}:opens==='race-page'?{kind:'race-page',code,raceId}
      :opens==='choose-result'?{kind:'runner',code,raceId,entryId:item.entryId!,screen:opens}:{kind:'correction',code,raceId,action:opens})};
  };
  const callout=(item:DayLeadItem)=>{const words=toCheckWording(item),{label,open}=fixOf(item);
    return <Callout key={item.id} message={<><span><strong>{words.title}.</strong> {words.explanation}</span>{itemTeams(item,rows).map(team=><span key={team} className="rz-callout__team">{team}</span>)}</>}
      actions={<>{race && acceptable(item) && <button type="button" className="rz-btn" disabled={busy===item.id} onClick={()=>void accept(item)}>It's right</button>}
        <button type="button" className="rz-btn rz-btn--primary" onClick={open}>{label}</button></>}/>;};
  // An event's problems (no `race`): those that open the same race share one callout and its one button.
  return <>{error && <Callout message={error}/>}{race?items.map(callout):raceCallouts(items).map(group=>{
    if(!group.title) return callout(group.items[0]);
    const {label,open}=fixOf(group.items[0]);
    return <Callout key={group.items[0].id} message={<><span><strong>{group.title}.</strong></span>{group.lines!.map((line,index)=><Fragment key={group.items[index].id}><span className="rz-callout__team">{line}</span>
        {itemTeams(group.items[index],rows).map(team=><span key={team} className="rz-callout__team">{team}</span>)}</Fragment>)}</>}
      actions={<button type="button" className="rz-btn rz-btn--primary" onClick={open}>{label}</button>}/>;})}</>;
}
