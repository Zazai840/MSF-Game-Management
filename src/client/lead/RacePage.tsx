import { eventTitle } from '../../shared/day.js';
import { RunnerSheet } from './RunnerSheet.js';
import type { View } from '../shell/addresses.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import { RaceActions,notSavedLine } from './RaceActions.js';
import { useEffect,useRef,useState } from 'react';
import type { EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { isTeamEntry,partLabel,replacedByRerun } from '../../shared/races.js';
import { raceName } from '../../shared/race-flow.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import { resultLabel,teamWristbands } from './ResultName.js';
import { formatTime } from '../../shared/time-entry.js';
import { ordinal } from '../../shared/ordinal.js';
import { legsText } from '../../shared/teams.js';
import type { WrongTime } from '../../shared/wrong-times.js';
import { api } from '../api.js';
import { wrongTimesByPlace } from '../flow/WrongTime.js';
import { clock,clockWithSeconds } from '../../shared/clock.js';
import { flagText } from '../../shared/runner-rulings.js';
import { Callout,ErrorCallout,Icon,LeadBar,UpdatedAt } from '../races/parts.js';
const plural=(count:number,word:string)=>`${count} ${word}${count===1?'':'s'}`;
/**
 * A lead's page for one race, under the lead header ("Heat 1", back to its event, "⋯" for Race actions): its meta line,
 * its record rows, Saved versions and Updated at. A runner opens the runner sheet; `onOpen` moves to its screens and to
 * the race's Re-run, Delete and Restore screens.
 */
export function RacePage({raceId,code,onSaved,onOpen,actionableRunners=[]}:{raceId:string;code:string;onSaved:(next:EventResultsRead)=>void;onOpen:(view:View)=>void;actionableRunners?:readonly LeaderboardRow[]}) {
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState<unknown>(null);
  const [selectedEntry,setSelectedEntry]=useState<string|null>(null),[actions,setActions]=useState(false);
  const selectedRow=actionableRunners.find(row=>row.raceId===raceId && row.entryId===selectedEntry);
  const [updated,setUpdated]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const next=await api<LeadRaceRead>(`lead/races/${raceId}`);if(generation===request.current) {setRead(next);setUpdated(clockWithSeconds(new Date()));setError(null);}}
    catch(error) {if(generation===request.current) setError(error);}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>{request.current++;clearInterval(timer);};},[raceId]);
  const race=read?.race,openRace=()=>onOpen({kind:'race',id:raceId});
  const more=read && <button type="button" className="rz-iconbtn" aria-label="Race actions" onClick={()=>setActions(true)}><Icon name="more"/></button>;
  const body=<><main className="rz-main">
    {error!==null && <ErrorCallout error={error} action="read"/>}
    {!race?error===null && <p className="rz-empty">Opening…</p>:<>
      <p className="rz-page-meta">{eventTitle(race.event)} · checked in {clock(race.checkedInAt)} · {race.deleted?'deleted':race.state==='saved'?'saved':'not saved yet'}</p>
      {race.deleted && <Callout status message={deletedLine(read)}/>}
      {!race.deleted && race.state!=='saved' && <Callout status message={notSavedLine(race,'page')} actions={<button type="button" className="rz-btn rz-btn--primary" onClick={openRace}>Open {raceName(race)}</button>}/>}
      {race.parts.times.value?.acceptedByLead && <p className="rz-note">Out-of-order times accepted by a lead</p>}
      <Record race={race} rowFor={entryId=>actionableRunners.find(entry=>entry.raceId===raceId && entry.entryId===entryId)} onRunner={setSelectedEntry}/>
      <details className="rz-disclosure"><summary>Saved versions ({read.history.length})</summary>
        <ol className="rz-disclosure__body" aria-label="Saved versions">{read.history.map(save=><li key={`${save.part}:${save.version}`}>{save.author||'Not recorded'} · {partLabel(save.part)}{save.at && <> · <time dateTime={save.at}>{clockWithSeconds(save.at)}</time></>}</li>)}</ol></details>
    </>}
  </main><footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void refresh()}/></footer>
    {read && selectedRow && <RunnerSheet key={selectedRow.entryId} event={read.race.event} row={selectedRow} rows={actionableRunners} onSaved={next=>{setSelectedEntry(null);onSaved(next);void refresh();}} onClose={()=>setSelectedEntry(null)} onOpen={onOpen}/>}
    {read && actions && <RaceActions read={read} where="page" onOpen={onOpen} onRace={openRace} onClose={()=>setActions(false)} onSaved={async next=>{onSaved(next);await refresh();}}/>}
  </>;
  return <LeadBar title={race?raceName(race):'Race'} code={race?.event.code??code} up={race?eventTitle(race.event):code} body={body}>{more}</LeadBar>;
}
/** "Deleted at 10:42 by Sara Ahmed: wrong section checked in. Its results do not count." A race deleted before its time was kept says no time. */
function deletedLine({race,deletion}:LeadRaceRead) {
  const how=replacedByRerun(race)??'Deleted',by=deletion?` by ${deletion.by}`:'',at=race.deletedAt?` at ${clock(race.deletedAt)}`:'';
  return `${how}${at}${by}${deletion?.comment?`: ${deletion.comment}`:''}. Its results do not count.`;
}
/**
 * The race's places and times in place order (no place last), each a race-flow row: a wrong time in amber with its
 * reason, each child's or relay team's warnings on the row (amber while one is open), and the times and finishers count.
 * A row with a result opens the runner sheet.
 */
function Record({race,rowFor,onRunner}:{race:LeadRaceRead['race'];rowFor:(entryId:string)=>LeaderboardRow|undefined;onRunner:(entryId:string)=>void}) {
  const times=race.kind==='final'?null:race.parts.times.value;
  const wrong=times?wrongTimesByPlace(times.places,race.event.name):new Map<number,WrongTime>();
  const mismatch=race.recording.countMismatch,finishers=race.parts.finish.value?.order.length??null,timed=times?.places.filter(time=>time!==null).length??0;
  const rows=[...race.recording.results].sort((a,b)=>(a.place??Infinity)-(b.place??Infinity));
  return <>
    {mismatch?<Callout status message={mismatch}/>:times && <span className="rz-tag rz-tag--ok">{finishers!==null && <Icon name="check"/>}{plural(timed,'time')}{finishers!==null && ` · ${plural(finishers,'finisher')}`}</span>}
    <ol className="rz-lead-rows" aria-label="Current record">{rows.map(row=>{
      const wrongTime=row.place===null?undefined:wrong.get(row.place-1);
      const entry=race.parts.runners.value?.find(entry=>entry.id===row.entryId),team=entry && isTeamEntry(entry)?entry:null,who=team?resultEntry(race,team):row,result=rowFor(row.entryId);
      // A deleted race has no result row: its teams keep their children's warnings as the race recorded them.
      const notes=result?result.flags.filter(flag=>flag.kind==='warning').map(flag=>({text:flagText(flag),open:!flag.checked}))
        :(team?.legs.flatMap(leg=>leg.warnings)??[]).map(warning=>({text:warning.message,open:true}));
      const warn=!!wrongTime || notes.some(note=>note.open);
      const content=<>
        <span className="rz-lead-row__place">{row.place===null?'–':ordinal(row.place)}</span>
        <span className="rz-lead-row__num">{team?`Team ${team.team.number}`:row.wristband}</span>
        <span className="rz-lead-row__end">{row.time!==null?formatTime(row.time):row.place===null && race.state==='saved'?<span className="rz-tag rz-tag--dnf">Did not finish</span>:times?'No time':''}</span>
        {team && <span className="rz-team-legs rz-lead-row__legs">{'team' in who && who.team?teamWristbands(who.team):legsText(team.legs)}</span>}
        {team?.addedAtFinish && <span className="rz-lead-row__note">At finish</span>}
        {wrongTime && <span className="rz-lead-row__note">{wrongTime.reason}</span>}
        {notes.map((note,index)=><span key={index} className="rz-lead-row__note">{note.text}</span>)}
      </>;
      const className=`rz-lead-row${warn?' rz-lead-row--warn':''}`;
      return <li key={row.entryId}>{result?<button type="button" className={className} aria-label={resultLabel(who)} onClick={()=>onRunner(row.entryId)}>{content}</button>:<div className={className}>{content}</div>}</li>;
    })}</ol>
  </>;
}
