import { useState } from 'react';
import { callUpLabel,openCallUp,placeFree,type FinalResults } from '../../shared/finals.js';
import { needsCheck,resultLabel,resultName,teamLine,teamWristbands,type LeaderboardRow,type ResultEntry } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { api } from '../api.js';
import { ordinal } from '../../shared/ordinal.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import type { RaceEntry } from '../../shared/races.js';
import { entryNoun } from '../../shared/teams.js';
import { toastLine } from '../../shared/toast-lines.js';
import { useToast } from '../races/Toast.js';
import { ErrorCallout,Star } from '../races/parts.js';
import { resultAuditNotes } from '../../shared/result-notes.js';
import { clock } from '../../shared/clock.js';
import type { AuditNote } from '../../shared/rulings.js';
import type { DayEvent } from '../../shared/day.js';
/** Whose result it is, in a line: "2003", or "Team 3 · 2301 · 2302 · 2303 · 2304". */
const who=(entry:Pick<ResultEntry,'wristband'|'team'>)=>entry.team?teamLine(entry.team):String(entry.wristband??'-');
/**
 * A heats event's Final tab, above the Day export line and Confirm the medals: the final's order with gold stars on the
 * medal places, "Line-up, fastest first" and Call up while a place and a seed are free, which saves at once with a
 * toast. A row opens the runner sheet (`onRunner`). A final's runners and teams are added and replaced at its start
 * line; until its order is saved, each line-up row shows its audit notes (`notes`) as the Notes tab does.
 */
export function Final({event,final,notes,onSaved,onRunner}:{event:DayEvent;final:FinalResults;notes:readonly AuditNote[];onSaved:(next:EventResultsRead)=>void;onRunner:(row:LeaderboardRow)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
  const toast=useToast();
  async function callUp(body:object,name:string) {
    setBusy(true);setError(null);
    try {onSaved(await api<EventResultsRead>(`lead/events/${encodeURIComponent(event.code)}/call-up`,body));toast({message:toastLine({kind:'called-up',who:name})});}
    catch(error) {setError(error);}
    finally {setBusy(false);}
  }
  const next=openCallUp(final);
  // A line-up entry as it is in the final now, else as it was when last there (an Absent one).
  const finalist=(id:string,copy?:RaceEntry)=>{const runner=final.runners.find(runner=>runner.id===id)??copy;return runner && resultEntry({id:final.raceId},runner);};
  const absent=(entry:{absent:boolean})=>entry.absent?'Absent · no final place':'';
  /** A line-up row: its words, then (until the final's order is saved, when its result carries them) its audit notes. */
  const lineupRow=(entryId:string,name:string,words:string[])=>{
    const own=final.leaderboard.length?[]:resultAuditNotes({auditNotes:[...notes]},final.raceId,entryId);
    return <div role="listitem" key={entryId}>{words.filter(Boolean).join(' · ')}
      {own.length>0 && <ol className="rz-notes" aria-label={`Notes on ${name}`}>{own.map(note=><li key={note.id}><time dateTime={note.at}>{clock(note.at)}</time><span>{note.message}</span></li>)}</ol>}</div>;
  };
  return <>
    {error!==null && <ErrorCallout error={error} action="save"/>}
    {final.leaderboard.length?<ol className="rz-lead-rows" aria-label="Final leaderboard">{final.leaderboard.map(row=><li key={row.entryId}>
      <button type="button" className="rz-lead-row" aria-label={`${resultLabel(row)} · Final`} onClick={()=>onRunner(row)}>
        <span className="rz-lead-row__place">{row.medalPlace?<span className="rz-lead-row__medal"><Star/><span>{row.position}</span></span>:row.position?ordinal(row.position):'-'}</span>
        <span className="rz-lead-row__num">{resultName(row)}</span>
        <span className="rz-lead-row__end">{row.status!=='Finished' && <span className="rz-tag rz-tag--dnf">{row.status}</span>}{needsCheck(row) && <span className="rz-tag rz-tag--warn">Check</span>}</span>
        {row.team && <span className="rz-team-legs rz-lead-row__legs">{teamWristbands(row.team)}</span>}
      </button></li>)}</ol>
      :<p className="rz-empty">The final's order appears here once its finishing order is saved.</p>}
    <details className="rz-disclosure"><summary>Line-up, fastest first</summary>
      <div className="rz-disclosure__body" role="list" aria-label="Line-up, fastest first">
        {final.entries.map(entry=>{
          const current=finalist(entry.finalEntryId,entry.runner),name=who(current??{wristband:entry.heatWristband});
          const ranAs=current && !current.team && current.wristband!==entry.heatWristband?`ran the heats as ${entry.heatWristband}`:'';
          return lineupRow(entry.finalEntryId,name,[entry.kind==='call-up'?`Called up from heat rank ${entry.heatRank}`:`${ordinal(entry.seed)} fastest`,name,ranAs,absent(entry)]);
        })}
        {final.additionalEntries?.map(entry=>{const name=who(finalist(entry.runner.id,entry.runner)!);return lineupRow(entry.runner.id,name,['Added',name,absent(entry)]);})}
      </div></details>
    {/* Only while a place is free: once an added runner or team fills it, there is nothing to say about a call-up. */}
    {placeFree(final) && final.vacancy && <>{next
      ?<button type="button" className="rz-btn rz-btn--block" disabled={busy} onClick={()=>void callUp({expectedHeatEntryId:next.entryId},resultName(next))}>{busy?'Saving…':callUpLabel(resultName(next),next.position!)}</button>
      :<p className="rz-empty">No further ranked heat {entryNoun(event.relay)} to call up.</p>}
      <p className="rz-empty">The final can run short.</p></>}
  </>;
}
