import { RaceActions } from './RaceActions.js';
import { useEffect,useRef,useState } from 'react';
import type { LeadRaceRead } from '../../shared/race-clashes.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { raceLabel } from '../../shared/races.js';
import { formatTime } from '../../shared/time-entry.js';
import { api } from '../api.js';
import { ClashVersions } from './ClashVersions.js';
export function RacePage({raceId,onSaved,onClose}:{raceId:string;onSaved:(next:EventResultsRead)=>void;onClose:()=>void}) {
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState('');
  const [updated,setUpdated]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const next=await api<LeadRaceRead>(`lead/races/${raceId}`);if(generation===request.current) {setRead(next);setUpdated(new Date().toLocaleTimeString());setError('');}}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not open the race');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>{request.current++;clearInterval(timer);};},[raceId]);
  return <section className="race-page"><button onClick={onClose}>Back to event</button>{error && <p role="alert">{error}</p>}{!read?<p>Opening race…</p>:<>
    <h3>{raceLabel(read.race)} · {read.race.event.name} {read.race.event.section}</h3><p>Checked in {new Date(read.race.checkedInAt).toLocaleTimeString()}</p>
    <ClashVersions read={read} onSaved={onSaved} onChanged={refresh}/>
    <RaceActions race={read.race} onSaved={onSaved} onRefresh={refresh} onRemoved={onClose}/>
    <h4>Current record</h4><p>Runners: {read.race.parts.runners.value?.map(runner=>runner.wristband).join(' · ')||'None'}</p>
    <ol>{read.race.recording.results.map(row=><li key={row.entryId}>{row.wristband} · {row.place===null?'No place':`Place ${row.place}`} · {row.time===null?'No time':formatTime(row.time)}</li>)}</ol>
    <details><summary>Saved versions ({read.history.length})</summary><ol>{read.history.map(save=><li key={save.id}>{save.author||'Not recorded'} · {save.part==='finish'?'Finishing order':save.part==='runners'?'Runners':'Times'} · <time dateTime={save.at}>{new Date(save.at).toLocaleString()}</time></li>)}</ol></details>
  </>}<footer>Updated at {updated||'…'} <button onClick={()=>void refresh()}>Refresh race</button></footer></section>;
}
