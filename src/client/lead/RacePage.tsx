import { RunnerActions } from './RunnerActions.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import { RaceActions } from './RaceActions.js';
import { useEffect,useRef,useState } from 'react';
import type { EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { entryName,isTeamEntry,partLabel,raceLabel } from '../../shared/races.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import { ResultName,resultLabel } from './ResultName.js';
import { formatTime } from '../../shared/time-entry.js';
import { ordinal } from '../../shared/ordinal.js';
import { capitalised,entryNoun } from '../../shared/teams.js';
import type { WrongTime } from '../../shared/wrong-times.js';
import { api } from '../api.js';
import { TimeCount,WrongTimeIcon,WrongTimeReason,wrongTimesByPlace } from '../flow/WrongTime.js';
import { clock,clockWithSeconds } from '../../shared/clock.js';
import { flagText } from '../../shared/runner-rulings.js';
// Its rows, action sheets and runner actions share Results' styles, also when it opens over a race outside Results.
import './results.css';
/** A lead's page for one race. It has no back button of its own: the back arrow above it leads back. */
export function RacePage({raceId,onSaved,onClose,actionableRunners=[]}:{raceId:string;onSaved:(next:EventResultsRead)=>void;onClose:()=>void;actionableRunners?:readonly LeaderboardRow[]}) {
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState('');
  const [selectedEntry,setSelectedEntry]=useState<string|null>(null);
  const selectedRow=actionableRunners.find(row=>row.raceId===raceId && row.entryId===selectedEntry);
  const [updated,setUpdated]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const next=await api<LeadRaceRead>(`lead/races/${raceId}`);if(generation===request.current) {setRead(next);setUpdated(clock());setError('');}}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not open the race');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>{request.current++;clearInterval(timer);};},[raceId]);
  return <section className="race-page">{error && <p role="alert">{error}</p>}{!read?<p>Opening race…</p>:<>
    <h3>{raceLabel(read.race)} · {read.race.event.name} {read.race.event.section}</h3><p>Checked in {clock(read.race.checkedInAt)}</p>
    <RaceActions race={read.race} relay={read} onSaved={onSaved} onRefresh={refresh} onRemoved={onClose}/>
    {selectedRow && <RunnerActions key={selectedRow.entryId} row={selectedRow} rows={actionableRunners} eventCode={read.race.event.code} onSaved={next=>{setSelectedEntry(null);onSaved(next);void refresh();}} onClose={()=>setSelectedEntry(null)}/>}
    <h4>Current record</h4><p>{capitalised(entryNoun(read.race.event.relay))}s: {read.race.parts.runners.value?.map(entryName).join(' · ')||'None'}</p>
    <CurrentRecord race={read.race} rowFor={entryId=>actionableRunners.find(entry=>entry.raceId===raceId && entry.entryId===entryId)} onRunner={setSelectedEntry}/>
    <details><summary>Saved versions ({read.history.length})</summary><ol>{read.history.map(save=><li key={`${save.part}:${save.version}`}>{save.author||'Not recorded'} · {partLabel(save.part)}{save.at && <> · <time dateTime={save.at}>{clockWithSeconds(save.at)}</time></>}</li>)}</ol></details>
  </>}<footer>Updated at {updated||'…'} <button onClick={()=>void refresh()}>Refresh</button></footer></section>;
}
/** The race's places and times in place order (no place last), a wrong time in amber with its reason as on the Times screens, each child's or relay team's warnings beside them (grey once settled), and v1's count check. */
function CurrentRecord({race,rowFor,onRunner}:{race:LeadRaceRead['race'];rowFor:(entryId:string)=>LeaderboardRow|undefined;onRunner:(entryId:string)=>void}) {
  const times=race.kind==='final'?null:race.parts.times.value;
  const wrong=times?wrongTimesByPlace(times.places):new Map<number,WrongTime>();
  const mismatch=race.recording.countMismatch;
  return <>
    {times && <TimeCount times={times.places.filter(time=>time!==null).length} finishers={race.parts.finish.value?.order.length??null} mismatch={mismatch}/>}
    {mismatch && <p className="warning-box">{mismatch}</p>}
    <ol className="record-rows" aria-label="Current record">{[...race.recording.results].sort((a,b)=>(a.place??Infinity)-(b.place??Infinity) || 0).map(row=>{
      const wrongTime=row.place===null?undefined:wrong.get(row.place-1);
      const entry=race.parts.runners.value?.find(entry=>entry.id===row.entryId),team=entry && isTeamEntry(entry)?entry:null,who=team?resultEntry(race,team):row,result=rowFor(row.entryId);
      return <li key={row.entryId} className={wrongTime?'record-row time-wrong':'record-row'}>
        <span className="record-place">{row.place===null?'No place':ordinal(row.place)}</span>
        <span className="record-text">{result?<button className={team?'record-runner record-team':'record-runner'} aria-label={resultLabel(who)} onClick={()=>onRunner(row.entryId)}>{team?<ResultName entry={who} className=""/>:row.wristband}</button>:<ResultName entry={who} className=""/>}
          {team?.addedAtFinish && <small className="record-note">At finish</small>}
          {result?result.flags.filter(flag=>flag.kind==='warning').map((flag,index)=><small key={index} className={flag.checked?'record-note record-warning checked-warning':'record-note record-warning'}>{flagText(flag)}</small>)
            // A deleted race has no result row: its teams keep their children's warnings as the race recorded them.
            :team?.legs.flatMap(leg=>leg.warnings).map((warning,index)=><small key={index} className="record-note record-warning">{warning.message}</small>)}
          <WrongTimeReason wrong={wrongTime}/></span>
        {wrongTime && <WrongTimeIcon/>}<span className="record-time">{row.time===null?'No time':formatTime(row.time)}</span>
      </li>;
    })}</ol>
  </>;
}
