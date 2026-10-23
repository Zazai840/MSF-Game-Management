import { useState } from 'react';
import type { FinalResults } from '../../shared/finals.js';
import { resultName,type LeaderboardRow } from '../../shared/results-rules.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { api } from '../api.js';
import { ordinal } from '../../shared/ordinal.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import type { RaceEntry } from '../../shared/races.js';
import { ResultName,TeamLegs,resultLabel } from './ResultName.js';
export function FinalPanel({code,final,onSaved,onSelect,onRace}:{code:string;final:FinalResults;onSaved:(next:EventResultsRead)=>void;onSelect:(row:LeaderboardRow)=>void;onRace:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function callUp() {if(!final.nextCallUp) return;setBusy(true);setError('');try {onSaved(await api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/call-up`,{expectedHeatEntryId:final.nextCallUp.entryId}));}catch(error){setError(error instanceof Error?error.message:'Could not save - try again');}finally{setBusy(false);}}
 const eligible=final.leaderboard.filter(row=>row.position!==null).length;
 // A line-up entry as it is in the final now, else as it was when last there (an Absent one).
 const finalist=(id:string,copy?:RaceEntry)=>{const runner=final.runners.find(runner=>runner.id===id)??copy;return runner && resultEntry({id:final.raceId},runner);};
 return <section className="final-panel"><h3>Final</h3>{error&&<p role="alert">{error}</p>}
 <h4>Seeded line-up</h4><ul className="final-lineup">{final.entries.map(entry=>{const current=finalist(entry.finalEntryId,entry.runner);return <li key={entry.finalEntryId}>{entry.seed}: <ResultName entry={current??{wristband:entry.heatWristband}} className="" legs="inline"/>{current && !current.team && current.wristband!==entry.heatWristband?` · seeded as ${entry.heatWristband}`:''}{entry.absent?' · Absent · no final place':''}{entry.kind==='call-up'?` · Called up from heat rank ${entry.heatRank}`:''}</li>;})}{final.additionalEntries?.map(entry=>{const current=finalist(entry.runner.id,entry.runner)!;return <li key={entry.runner.id}><ResultName entry={current} className="" legs="inline"/> · Added {current.team?'team':'runner'}{entry.absent?' · Absent · no final place':''}</li>;})}</ul>
 {final.heatsComplete&&!final.hasRun&&final.vacancy&&<>{final.nextCallUp?<button disabled={busy} onClick={()=>void callUp()}>{busy?'Saving…':`Call up next-ranked runner: ${resultName(final.nextCallUp)} (${ordinal(final.nextCallUp.position!)})`}</button>:<p>No further ranked heat runner to call up.</p>}<p>The final can run short.</p></>}
 {final.leaderboard.length>0?<ol className="leaderboard" aria-label="Final leaderboard">{final.leaderboard.map(row=><li key={row.entryId}><button className={`leaderboard-row result-open ${row.highlighted?'highlighted':''} ${row.disqualification?'disqualified':''} ${row.notCounted?'not-counted':''}`} aria-label={`${resultLabel(row)} · Final`} onClick={()=>onSelect(row)}><span className="result-position"><strong>{row.position??'-'}</strong>{row.medalPlace&&<span className="result-mark">{ordinal(row.medalPlace)}</span>}</span><ResultName entry={row} legs="none"/>{row.team && <TeamLegs team={row.team}/>}<span className="result-detail">{row.status}{row.disqualification?`: ${row.disqualification.reason}`:''}{row.hasNote&&<span className="badge note-tag">note</span>}{row.flags.length>0&&<span className="result-flags">{row.flags.map((flag,index)=><span key={`${flag.kind}:${index}`} className={flag.checked?'checked-warning':''}>{flag.message}</span>)}</span>}</span></button>{row.position===Math.min(3,eligible)&&<div className="result-line">Medal line</div>}</li>)}</ol>:<p>Final finishing order not recorded yet.</p>}
 <button onClick={onRace}>Open final</button></section>;
}
