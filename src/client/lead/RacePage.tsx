import { eventTitle } from '../../shared/day.js';
import { RunnerSheet } from './RunnerSheet.js';
import type { View } from '../shell/addresses.js';
import type { LeaderboardRow } from '../../shared/results-rules.js';
import { RaceActions,notSavedLine } from './RaceActions.js';
import { useState } from 'react';
import type { DayLeadItem,EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { RaceProblems,useRaceIssues,type ProblemFix } from './RaceProblems.js';
import { isTeamEntry,openRaceLabel,partLabel,replacedByRerun } from '../../shared/races.js';
import { raceName } from '../../shared/race-flow.js';
import { resultEntry } from '../../shared/leaderboard-row.js';
import { resultLabel,teamWristbands } from '../../shared/results-rules.js';
import { formatTime } from '../../shared/time-entry.js';
import { ordinal } from '../../shared/ordinal.js';
import { legsText } from '../../shared/teams.js';
import type { WrongTime } from '../../shared/wrong-times.js';
import { usePolledRead } from '../live.js';
import { wrongTimesByPlace } from '../flow/WrongTime.js';
import { clock,clockWithSeconds } from '../../shared/clock.js';
import { flagText } from '../../shared/runner-rulings.js';
import { Callout,ErrorCallout,Icon } from '../races/parts.js';
import { LeadBar } from './LeadBar.js';
import { UpdatedAt } from '../races/UpdatedAt.js';
const plural=(count:number,word:string)=>`${count} ${word}${count===1?'':'s'}`;
/**
 * A lead's page for one race, under the lead header ("Heat 1", back to its event): its open To check problems on top,
 * each with "It's right" where it can be accepted and a Fix that opens the correction that fits it, its meta line, its
 * record rows, a button with words for Race actions ("Correct or delete Heat 1"), Saved versions and Updated at. A
 * runner opens the runner sheet; `onOpen` moves to its screens and to the race's corrections, Re-run, Delete and Restore.
 */
export function RacePage({raceId,code,onSaved,onOpen,actionableRunners=[]}:{raceId:string;code:string;onSaved:(next:EventResultsRead)=>void;onOpen:(view:View)=>void;actionableRunners?:readonly LeaderboardRow[]}) {
  const {read,updated,error,refresh}=usePolledRead<LeadRaceRead>(`lead/races/${raceId}`);
  const [selectedEntry,setSelectedEntry]=useState<string|null>(null),[actions,setActions]=useState(false);
  const selectedRow=actionableRunners.find(row=>row.raceId===raceId && row.entryId===selectedEntry);
  const race=read?.race,openRace=()=>onOpen({kind:'race',id:raceId}),issues=useRaceIssues(raceId);
  /** Each problem opens the correction that fits it. */
  function fix(item:DayLeadItem):ProblemFix {
    if(item.kind==='tie') return {label:'Decide the tie',open:()=>onOpen({kind:'tie',code,tieId:item.tieId!})};
    if(item.kind==='ran-twice') return {label:'Fix',open:()=>onOpen({kind:'runner',code,raceId,entryId:item.entryId!,screen:'choose-result'})};
    const time=item.kind==='times-out-of-order';
    const action=time?(race?.kind==='final'?'correct-finishing-order':'correct-times'):race?.event.relay?'correct-teams':'correct-runner-list';
    return {label:time?'Fix time':'Fix',open:()=>onOpen({kind:'correction',code,raceId,action})};
  }
  const body=<><main className="rz-main">
    {error!==null && <ErrorCallout error={error} action="read"/>}
    {!race?error===null && <p className="rz-empty">Opening…</p>:<>
      <RaceProblems items={issues.items} race={race} fix={fix} onAccepted={next=>{onSaved(next);void issues.refresh();void refresh();}}/>
      <p className="rz-page-meta">{eventTitle(race.event)} · checked in {clock(race.checkedInAt)} · {race.deleted?'deleted':race.state==='saved'?'saved':'not saved yet'}</p>
      {race.deleted && <Callout status message={deletedLine(read)}/>}
      {!race.deleted && race.state!=='saved' && <Callout status message={notSavedLine(race,'page')} actions={<button type="button" className="rz-btn rz-btn--primary" onClick={openRace}>{openRaceLabel(race)}</button>}/>}
      {race.parts.times.value?.acceptedByLead && <p className="rz-note">Out-of-order times accepted by a lead</p>}
      <Record race={race} rowFor={entryId=>actionableRunners.find(entry=>entry.raceId===raceId && entry.entryId===entryId)} onRunner={setSelectedEntry}/>
      {/* The button names what its sheet holds: a race replaced by a re-run cannot be restored. */}
      <button type="button" className="rz-btn rz-btn--block" onClick={()=>setActions(true)}>{race.deleted?replacedByRerun(race)?'Delete':'Restore or delete':race.state==='saved'?'Correct or delete':'Delete'} {raceName(race)}</button>
      <details className="rz-disclosure"><summary>Saved versions ({read.history.length})</summary>
        <ol className="rz-disclosure__body" aria-label="Saved versions">{read.history.map(save=><li key={`${save.part}:${save.version}`}>{save.author||'Not recorded'} · {partLabel(save.part)}{save.at && <> · <time dateTime={save.at}>{clockWithSeconds(save.at)}</time></>}</li>)}</ol></details>
    </>}
  </main><footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void refresh()}/></footer>
    {read && selectedRow && <RunnerSheet key={selectedRow.entryId} event={read.race.event} row={selectedRow} rows={actionableRunners} onSaved={next=>{setSelectedEntry(null);onSaved(next);void refresh();}} onClose={()=>setSelectedEntry(null)} onOpen={onOpen}/>}
    {read && actions && <RaceActions read={read} where="page" onOpen={onOpen} onRace={openRace} onClose={()=>setActions(false)}/>}
  </>;
  return <LeadBar title={race?raceName(race):'Race'} code={race?.event.code??code} up={race?eventTitle(race.event):code} body={body}/>;
}
/** "Deleted at 10:42 by Sara Ahmed: wrong section checked in. Its results do not count." A race deleted before its time was kept says no time. */
function deletedLine({race,deletion}:LeadRaceRead) {
  const how=replacedByRerun(race)??'Deleted',by=deletion?` by ${deletion.by}`:'',at=race.deletedAt?` at ${clock(race.deletedAt)}`:'';
  return `${how}${at}${by}${deletion?.comment?`: ${deletion.comment}`:''}. Its results do not count.`;
}
/**
 * The race's places and times in place order (no place last), each a race-flow row: a wrong time in amber with its
 * reason, each child's or relay team's warnings and other To check reasons on the row (amber while one is open), and the times and finishers count.
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
      const notes=result?result.flags.filter(flag=>flag.kind!=='tie-settled').map(flag=>({text:flagText(flag),open:!flag.checked}))
        :(team?.legs.flatMap(leg=>leg.warnings)??[]).map(warning=>({text:warning.message,open:true}));
      const warn=!!wrongTime || notes.some(note=>note.open);
      const content=<>
        <span className="rz-lead-row__place">{row.place===null?'–':ordinal(row.place)}</span>
        <span className="rz-lead-row__num">{team?`Team ${team.team.number}`:row.wristband}</span>
        <span className="rz-lead-row__end">{row.time!==null?formatTime(row.time):row.place===null && race.state==='saved'?<span className="rz-tag rz-tag--dnf">Did not finish</span>:times?'No time':''}</span>
        {team && <span className="rz-team-legs rz-lead-row__legs">{'team' in who && who.team?teamWristbands(who.team):legsText(team.legs)}</span>}
        {!result && team?.addedAtFinish && <span className="rz-lead-row__note">At finish</span>}
        {wrongTime && <span className="rz-lead-row__note">{wrongTime.reason}</span>}
        {notes.map((note,index)=><span key={index} className="rz-lead-row__note">{note.text}</span>)}
      </>;
      const className=`rz-lead-row${warn?' rz-lead-row--warn':''}`;
      return <li key={row.entryId}>{result?<button type="button" className={className} aria-label={resultLabel(who)} onClick={()=>onRunner(row.entryId)}>{content}</button>:<div className={className}>{content}</div>}</li>;
    })}</ol>
  </>;
}
