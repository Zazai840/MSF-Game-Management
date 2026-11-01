import { useState } from 'react';
import type { FinalResults } from '../../shared/finals.js';
import { resultName,type LeaderboardRow,type ResultEntry } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { api } from '../api.js';
import { ordinal } from '../../shared/ordinal.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import { isTeamEntry,type RaceEntry } from '../../shared/races.js';
import { entryNoun,type RelayTeam } from '../../shared/teams.js';
import { resultLabel,teamWristbands } from './ResultName.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';
import { useToast } from '../races/Toast.js';
import { Callout,Icon,Sheet,Star } from '../races/parts.js';
import type { DayEvent } from '../../shared/day.js';
/** Whose result it is, in a line: "2003", or "Team 3 · 2301 · 2302 · 2303 · 2304". */
const who=(entry:Pick<ResultEntry,'wristband'|'team'>)=>entry.team?`Team ${entry.team.number} · ${teamWristbands(entry.team)}`:String(entry.wristband??'-');
/**
 * A heats event's Final tab, above the Day export line and Confirm the medals: the final's order with gold stars on the
 * medal places, "Line-up, fastest first", Call up while a seed is free, and on a relay "Add a team to the final" (a sheet
 * of the relay's teams not in it). Both save at once with a toast. A row opens the runner sheet (`onRunner`).
 */
export function Final({event,teams=[],final,onSaved,onRunner}:{event:DayEvent;teams?:readonly RelayTeam[];final:FinalResults;onSaved:(next:EventResultsRead)=>void;onRunner:(row:LeaderboardRow)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState(false);
  const toast=useToast(),race={section:event.section,kind:'final',number:0} as const;
  async function send(what:'call-up'|'add-team',body:object,saved:ToastSave) {
    setBusy(true);setError('');
    try {onSaved(await api<EventResultsRead>(`lead/events/${encodeURIComponent(event.code)}/${what}`,body));toast({message:toastLine(saved)});setAdding(false);}
    catch(error) {setError(error instanceof Error?error.message:'Could not save - try again');}
    finally {setBusy(false);}
  }
  // Teams in the final's line-up, Absent ones included, are not added again.
  const lineup=[...final.runners,...final.entries.flatMap(entry=>entry.runner?[entry.runner]:[]),...(final.additionalEntries||[]).map(entry=>entry.runner)];
  const addable=teams.filter(team=>!lineup.some(entry=>isTeamEntry(entry) && entry.team.id===team.id)),open=final.heatsComplete && !final.hasRun;
  // A line-up entry as it is in the final now, else as it was when last there (an Absent one).
  const finalist=(id:string,copy?:RaceEntry)=>{const runner=final.runners.find(runner=>runner.id===id)??copy;return runner && resultEntry({id:final.raceId},runner);};
  const absent=(entry:{absent:boolean})=>entry.absent?'Absent · no final place':'';
  return <>
    {error && !adding && <Callout message={error}/>}
    {final.leaderboard.length?<ol className="rz-lead-rows" aria-label="Final leaderboard">{final.leaderboard.map(row=><li key={row.entryId}>
      <button type="button" className="rz-lead-row" aria-label={`${resultLabel(row)} · Final`} onClick={()=>onRunner(row)}>
        <span className="rz-lead-row__place">{row.medalPlace?<span className="rz-lead-row__medal"><Star/><span>{row.position}</span></span>:row.position?ordinal(row.position):'-'}</span>
        <span className="rz-lead-row__num">{resultName(row)}</span>
        <span className="rz-lead-row__end">{row.status!=='Finished' && <span className="rz-tag rz-tag--dnf">{row.status}</span>}{row.flags.some(flag=>!flag.checked) && <span className="rz-tag rz-tag--warn">Check</span>}</span>
        {row.team && <span className="rz-team-legs rz-lead-row__legs">{teamWristbands(row.team)}</span>}
      </button></li>)}</ol>
      :<p className="rz-empty">The final's order appears here once its finishing order is saved.</p>}
    <details className="rz-disclosure"><summary>Line-up, fastest first</summary>
      <div className="rz-disclosure__body" role="list" aria-label="Line-up, fastest first">
        {final.entries.map(entry=>{
          const current=finalist(entry.finalEntryId,entry.runner);
          const ranAs=current && !current.team && current.wristband!==entry.heatWristband?`ran the heats as ${entry.heatWristband}`:'';
          return <span role="listitem" key={entry.finalEntryId}>{[entry.kind==='call-up'?`Called up from heat rank ${entry.heatRank}`:`${ordinal(entry.seed)} fastest`,who(current??{wristband:entry.heatWristband}),ranAs,absent(entry)].filter(Boolean).join(' · ')}</span>;
        })}
        {final.additionalEntries?.map(entry=><span role="listitem" key={entry.runner.id}>{['Added',who(finalist(entry.runner.id,entry.runner)!),absent(entry)].filter(Boolean).join(' · ')}</span>)}
      </div></details>
    {open && final.vacancy && <>{final.nextCallUp
      ?<button type="button" className="rz-btn rz-btn--block" disabled={busy} onClick={()=>void send('call-up',{expectedHeatEntryId:final.nextCallUp!.entryId},{kind:'called-up',who:resultName(final.nextCallUp!),race})}>{busy?'Saving…':`Call up next-ranked ${entryNoun(event.relay)}: ${resultName(final.nextCallUp)} (${ordinal(final.nextCallUp.position!)})`}</button>
      :<p className="rz-empty">No further ranked heat {entryNoun(event.relay)} to call up.</p>}
      <p className="rz-empty">The final can run short.</p></>}
    {event.relay && open && <button type="button" className="rz-btn rz-btn--block" onClick={()=>{setError('');setAdding(true);}}>Add a team to the final</button>}
    {adding && <Sheet title="Add a team to the final" onClose={()=>{setAdding(false);setError('');}}>
      {error && <Callout message={error}/>}
      {addable.length?<ul className="rz-list">{addable.map(team=><li key={team.id}><button type="button" className="rz-listrow" disabled={busy} onClick={()=>void send('add-team',{teamId:team.id},{kind:'team-added',team:team.number,race})}>
        <span className="rz-listrow__main"><span className="rz-listrow__label">Team {team.number}</span><span className="rz-listrow__meta">{team.legs.map(leg=>leg.wristband??'-').join(' · ')}</span></span><Icon name="plus" className="rz-icon--bold"/></button></li>)}</ul>
        :<p className="rz-sheet__text">Every team is in the final.</p>}
    </Sheet>}
  </>;
}
