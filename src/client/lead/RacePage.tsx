import { RunnerActions } from './RunnerActions.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import { RaceActions } from './RaceActions.js';
import { useEffect,useRef,useState } from 'react';
import type { LeadRaceRead } from '../../shared/race-clashes.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { raceLabel } from '../../shared/races.js';
import { formatTime } from '../../shared/time-entry.js';
import type { WrongTime } from '../../shared/wrong-times.js';
import { api } from '../api.js';
import { ClashVersions } from './ClashVersions.js';
import { TimeCount,WrongTimeIcon,WrongTimeReason,wrongTimesByPlace } from '../flow/WrongTime.js';
export function RacePage({raceId,onSaved,onClose,actionableRunners=[]}:{raceId:string;onSaved:(next:EventResultsRead)=>void;onClose:()=>void;actionableRunners?:readonly LeaderboardRow[]}) {
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState('');
  const [selectedEntry,setSelectedEntry]=useState<string|null>(null);
  const selectedRow=actionableRunners.find(row=>row.raceId===raceId && row.entryId===selectedEntry);
  const [updated,setUpdated]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const next=await api<LeadRaceRead>(`lead/races/${raceId}`);if(generation===request.current) {setRead(next);setUpdated(new Date().toLocaleTimeString());setError('');}}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not open the race');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>{request.current++;clearInterval(timer);};},[raceId]);
  return <section className="race-page"><button className="button-quiet race-back" onClick={onClose}>Back to event</button>{error && <p role="alert">{error}</p>}{!read?<p>Opening race…</p>:<>
    <h3>{raceLabel(read.race)} · {read.race.event.name} {read.race.event.section}</h3><p>Checked in {new Date(read.race.checkedInAt).toLocaleTimeString()}</p>
    <ClashVersions read={read} onSaved={onSaved} onChanged={refresh}/>
    <RaceActions race={read.race} onSaved={onSaved} onRefresh={refresh} onRemoved={onClose}/>
    {selectedRow && <RunnerActions key={selectedRow.entryId} row={selectedRow} rows={actionableRunners} eventCode={read.race.event.code} onSaved={next=>{setSelectedEntry(null);onSaved(next);void refresh();}} onClose={()=>setSelectedEntry(null)}/>}
    <h4>Current record</h4><p>Runners: {read.race.parts.runners.value?.map(runner=>runner.wristband).join(' · ')||'None'}</p>
    <CurrentRecord race={read.race} actionable={entryId=>actionableRunners.some(entry=>entry.raceId===raceId && entry.entryId===entryId)} onRunner={setSelectedEntry}/>
    <details><summary>Saved versions ({read.history.length})</summary><ol>{read.history.map(save=><li key={save.id}>{save.author||'Not recorded'} · {save.part==='finish'?'Finishing order':save.part==='runners'?'Runners':'Times'} · <time dateTime={save.at}>{new Date(save.at).toLocaleString()}</time></li>)}</ol></details>
  </>}<footer>Updated at {updated||'…'} <button onClick={()=>void refresh()}>Refresh race</button></footer></section>;
}
/** The race's places and times, a wrong time in amber with its reason as on the Times screens, and v1's count check. */
function CurrentRecord({race,actionable,onRunner}:{race:LeadRaceRead['race'];actionable:(entryId:string)=>boolean;onRunner:(entryId:string)=>void}) {
  const times=race.kind==='final'?null:race.parts.times.value;
  const wrong=times?wrongTimesByPlace(times.places):new Map<number,WrongTime>();
  const mismatch=race.recording.countMismatch;
  return <>
    {times && <TimeCount times={times.places.filter(time=>time!==null).length} finishers={race.parts.finish.value?.order.length??null} mismatch={mismatch}/>}
    {mismatch && <p className="warning-box">{mismatch}</p>}
    <ol className="record-rows" aria-label="Current record">{race.recording.results.map(row=>{
      const wrongTime=row.place===null?undefined:wrong.get(row.place-1);
      return <li key={row.entryId} className={wrongTime?'record-row time-wrong':'record-row'}>
        <span className="record-text"><span className="record-line">{actionable(row.entryId)?<button className="record-runner" aria-label={`Runner ${row.wristband}`} onClick={()=>onRunner(row.entryId)}>{row.wristband}</button>:row.wristband} · {row.place===null?'No place':`Place ${row.place}`} · {row.time===null?'No time':formatTime(row.time)}</span><WrongTimeReason wrong={wrongTime}/></span>
        {wrongTime && <WrongTimeIcon/>}
      </li>;
    })}</ol>
  </>;
}
