import { useState } from 'react';
import type { FinalResults } from '../../shared/finals.js';
import { resultName,type LeaderboardRow } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { api } from '../api.js';
import { ordinal } from '../../shared/ordinal.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import { flagText } from '../../shared/runner-rulings.js';
import { isTeamEntry,type RaceEntry } from '../../shared/races.js';
import { entryNoun,type RelayTeam } from '../../shared/teams.js';
import { ResultName,TeamLegs,resultLabel } from './ResultName.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';
import { useToast } from '../races/Toast.js';
import type { DayEvent } from '../../shared/day.js';
/** The Final panel. On a relay, `teams` is its team list, which a lead picks a team to add to the final from. */
export function FinalPanel({event,relay,teams=[],final,onSaved,onSelect,onRace}:{event:DayEvent;relay:boolean;teams?:readonly RelayTeam[];final:FinalResults;onSaved:(next:EventResultsRead)=>void;onSelect:(row:LeaderboardRow)=>void;onRace:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState(false);
 const toast=useToast(),race={section:event.section,kind:'final',number:0} as const;
 async function send(what:'call-up'|'add-team',body:object,saved:ToastSave) {setBusy(true);setError('');try {onSaved(await api<EventResultsRead>(`lead/events/${encodeURIComponent(event.code)}/${what}`,body));toast({message:toastLine(saved)});setAdding(false);}catch(error){setError(error instanceof Error?error.message:'Could not save - try again');}finally{setBusy(false);}}
 // Teams in the final's line-up, Absent ones included, are not added again.
 const lineup=[...final.runners,...final.entries.flatMap(entry=>entry.runner?[entry.runner]:[]),...(final.additionalEntries||[]).map(entry=>entry.runner)];
 const addable=teams.filter(team=>!lineup.some(entry=>isTeamEntry(entry) && entry.team.id===team.id)),open=final.heatsComplete && !final.hasRun;
 const eligible=final.leaderboard.filter(row=>row.position!==null).length;
 // A line-up entry as it is in the final now, else as it was when last there (an Absent one).
 const finalist=(id:string,copy?:RaceEntry)=>{const runner=final.runners.find(runner=>runner.id===id)??copy;return runner && resultEntry({id:final.raceId},runner);};
 return <section className="final-panel"><h3>Final</h3>{error&&<p role="alert">{error}</p>}
 <h4>Seeded line-up</h4><ul className="final-lineup">{final.entries.map(entry=>{const current=finalist(entry.finalEntryId,entry.runner);return <li key={entry.finalEntryId}>{entry.seed}: <ResultName entry={current??{wristband:entry.heatWristband}} className="" legs="inline"/>{current && !current.team && current.wristband!==entry.heatWristband?` · seeded as ${entry.heatWristband}`:''}{entry.absent?' · Absent · no final place':''}{entry.kind==='call-up'?` · Called up from heat rank ${entry.heatRank}`:''}</li>;})}{final.additionalEntries?.map(entry=>{const current=finalist(entry.runner.id,entry.runner)!;return <li key={entry.runner.id}><ResultName entry={current} className="" legs="inline"/> · Added {entryNoun(!!current.team)}{entry.absent?' · Absent · no final place':''}</li>;})}</ul>
 {final.heatsComplete&&!final.hasRun&&final.vacancy&&<>{final.nextCallUp?<button disabled={busy} onClick={()=>void send('call-up',{expectedHeatEntryId:final.nextCallUp!.entryId},{kind:'called-up',who:resultName(final.nextCallUp!),race})}>{busy?'Saving…':`Call up next-ranked ${entryNoun(relay)}: ${resultName(final.nextCallUp)} (${ordinal(final.nextCallUp.position!)})`}</button>:<p>No further ranked heat {entryNoun(relay)} to call up.</p>}<p>The final can run short.</p></>}
 {relay && open && (adding?<div className="final-add"><h4>Which team joins the final?</h4>
  {addable.length?<div className="pick-list">{addable.map(team=><button key={team.id} disabled={busy} onClick={()=>void send('add-team',{teamId:team.id},{kind:'team-added',team:team.number,race})}>Team {team.number}<small>{team.legs.map(leg=>leg.wristband??'-').join(' · ')}</small></button>)}</div>
  :<p>Every team is in the final.</p>}
  <button className="button-quiet" onClick={()=>setAdding(false)}>Cancel</button></div>
 :<button className="button-secondary" onClick={()=>setAdding(true)}>Add a team to the final</button>)}
 {final.leaderboard.length>0?<ol className="leaderboard" aria-label="Final leaderboard">{final.leaderboard.map(row=><li key={row.entryId}><button className={`leaderboard-row result-open ${row.highlighted?'highlighted':''} ${row.disqualification?'disqualified':''} ${row.notCounted?'not-counted':''}`} aria-label={`${resultLabel(row)} · Final`} onClick={()=>onSelect(row)}><span className="result-position"><strong>{row.position??'-'}</strong>{row.medalPlace&&<span className="result-mark">{ordinal(row.medalPlace)}</span>}</span><ResultName entry={row} legs="none"/>{row.team && <TeamLegs team={row.team}/>}<span className="result-detail">{row.status}{row.disqualification?`: ${row.disqualification.reason}`:''}{row.hasNote&&<span className="badge note-tag">note</span>}{row.flags.length>0&&<span className="result-flags">{row.flags.map((flag,index)=><span key={`${flag.kind}:${index}`} className={flag.checked?'checked-warning':''}>{flagText(flag)}</span>)}</span>}</span></button>{row.position===Math.min(3,eligible)&&<div className="result-line">Medal line</div>}</li>)}</ol>:<p>Final finishing order not recorded yet.</p>}
 <button onClick={onRace}>Open final</button></section>;
}
