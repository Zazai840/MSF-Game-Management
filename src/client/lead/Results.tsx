import { FinalPanel } from './FinalPanel.js';
import { StageSheet } from './StageSheet.js';
import type { StageCheckSheet,StageItem } from '../../shared/stages.js';
import { DeletedRaces } from './DeletedRaces.js';
import { Fragment,useEffect,useState,useRef } from 'react';
import { api } from '../api.js';
import type { DayLeadItem,ResultsRead,EventResultsRead } from '../../shared/lead-results.js';
import { RacePage } from './RacePage.js';
import { RunnerActions } from './RunnerActions.js';
import { ResultName,resultLabel } from './ResultName.js';
import { resultName } from '../../shared/results-rules.js';
import { TieSheet } from './TieSheet.js';
import { formatTime } from '../../shared/time-entry.js';
import { eventState } from '../../shared/event-state.js';
import { BackArrow } from '../flow/BackArrow.js';
import { ordinal } from '../../shared/ordinal.js';
import { clock } from '../../shared/clock.js';
import './results.css';
const label=(race:{kind:'heat'|'final'|'race';number:number})=>`${race.kind==='heat'?'Heat':race.kind==='final'?'Final':'Race'} ${race.number}`;
const tick=<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>;
/**
 * Results: the event cards (coloured Done / Running / Not started), then one event's leaderboard, rulings and audit notes,
 * then one race. Its back arrow goes up one level: a race to its event, an event to Results, Results to the Dashboard;
 * whatever a To check item opened goes back to the Dashboard, where To check lives. No to-check count shows anywhere here.
 */
export function Results({target,onDashboard,onChanged}:{target?:DayLeadItem;onDashboard:()=>void;onChanged?:()=>void}) {
  const [selectedStage,setSelectedStage]=useState<StageCheckSheet|null>(null);
  const [selectedTieId,setSelectedTieId]=useState<string|null>(target?.tieId||null);
  const [code,setCode]=useState<string|null>(target?.event.code||null);
  const [list,setList]=useState<ResultsRead|null>(null);
  const [detail,setDetail]=useState<EventResultsRead|null>(null);
  const [selectedRace,setSelectedRace]=useState<string|null>(target?.entryId?null:target?.raceId||null);
  const [eventName,setEventName]=useState(target?`${target.event.name} ${target.event.section}`:'');
  const [selected,setSelected]=useState<{raceId:string;entryId:string}|null>(target?.raceId && target.entryId?{raceId:target.raceId,entryId:target.entryId}:null);
  const [updated,setUpdated]=useState('');
  const [error,setError]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {
      if(code) {const next=await api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/results`);if(generation!==request.current) return;setDetail(next);}
      else {const next=await api<ResultsRead>('lead/results');if(generation!==request.current) return;setList(next);}
      setUpdated(clock());setError('');
    } catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{
    void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    return()=>{request.current++;clearInterval(timer);};
  },[code]);
  function open(code:string|null,name='') {request.current++;setDetail(null);setSelected(null);setSelectedTieId(null);setSelectedStage(null);setSelectedRace(null);setCode(code);setEventName(name);setError('');window.scrollTo(0,0);}
  function openRace(id:string|null) {setSelectedRace(id);window.scrollTo(0,0);}
  const fromToCheck=target?.entryId?null:target?.raceId||null;
  const back=code && selectedRace && selectedRace!==fromToCheck?<BackArrow to={detail?`${detail.event.name} ${detail.event.section}`:eventName||code} onBack={()=>openRace(null)}/>
    :code && !target?<BackArrow to="Results" onBack={()=>open(null)}/>:<BackArrow to="Dashboard" onBack={onDashboard}/>;

  const selectedTie=detail?.results.ties.find(tie=>tie.id===selectedTieId);
  const selectedRow=detail?.results.actionableRunners.find(row=>row.raceId===selected?.raceId && row.entryId===selected?.entryId);
  function saved(next:EventResultsRead) {request.current++;setDetail(next);setSelected(null);setSelectedTieId(null);setSelectedStage(null);setUpdated(clock());onChanged?.();}
  function openStageItem(item:StageItem) {
    setSelectedStage(null);
    const tie=detail?.results.ties.find(tie=>tie.id===item.tieId);
    if(tie) setSelectedTieId(tie.id);
    else if(item.entryId && detail?.results.actionableRunners.some(row=>row.raceId===item.raceId && row.entryId===item.entryId)) setSelected({raceId:item.raceId!,entryId:item.entryId});
    else if(item.raceId) openRace(item.raceId);
  }
  const state=detail?eventState({status:detail.results.status,raceCount:detail.results.raceCount,format:detail.event.format}):null;
  return <div className="results-view">{back}{error && <p role="alert">{error}</p>}
    {code ? <>{!detail?<p className="results-opening">Opening results…</p>:<>
      {selectedRace?<RacePage key={selectedRace} raceId={selectedRace} actionableRunners={detail.results.actionableRunners} onSaved={saved} onClose={()=>openRace(null)}/>:<>
      <header className="results-event-head"><h1>{detail.event.name} {detail.event.section}</h1>
        <p className="results-event-meta"><span className={`event-status event-status-${state!.state}`}>{state!.state==='done' && tick}{state!.line}</span><span className="results-event-code">{detail.event.code}{!detail.event.enabled?' · Switched off':''}</span></p></header>
      {selectedRow && <RunnerActions key={`${selectedRow.raceId}:${selectedRow.entryId}`} row={selectedRow} rows={detail.results.actionableRunners} eventCode={detail.event.code} onSaved={saved} onClose={()=>setSelected(null)}/>}
      {selectedStage && <StageSheet code={detail.event.code} sheet={selectedStage} onSaved={saved} onClose={()=>setSelectedStage(null)} onOpen={openStageItem}/>}
      {selectedTie && <TieSheet key={selectedTie.id} code={detail.event.code} tie={selectedTie} onSaved={saved} onClose={()=>setSelectedTieId(null)}/>}
      <p className="results-band">Top {detail.results.band.highlightCount} highlighted · {detail.event.format==='heats'?'Q: fastest 6':'Medal places: 1st, 2nd, 3rd'}</p>
      {detail.results.leaderboard.length===0?<p className="results-empty">No runners ranked yet</p>:<ol className="leaderboard" aria-label={detail.results.provisional?'Provisional leaderboard':'Official leaderboard'}>{detail.results.leaderboard.map(row=><Fragment key={`${row.raceId}:${row.entryId}`}>
        <li><button type="button" aria-label={`${resultLabel(row)} · ${label(row.race)}`} onClick={()=>{setSelectedTieId(null);setSelected({raceId:row.raceId,entryId:row.entryId});}} className={`leaderboard-row result-open ${row.disqualification?'disqualified':''} ${row.notCounted?'not-counted':''} ${row.highlighted?'highlighted':''} ${row.status==='Did not finish'?'did-not-finish':''}`}>
          <span className="result-position"><strong>{row.position??'-'}</strong>{row.qualification && <span className="result-mark">Q</span>}{row.medalPlace && <span className="result-mark">{ordinal(row.medalPlace)}</span>}</span>
          <ResultName entry={row}/><span className="result-time">{row.time===null?'-':formatTime(row.time)}</span>
          <span className="result-detail">{label(row.race)}{row.place!==null?` · ${ordinal(row.place)} in race`:row.status==='Did not finish'?' · Did not finish':''}{row.hasNote && <span className="note-tag">note</span>}{row.disqualification && <span className="disqualification-reason">Disqualified: {row.disqualification.reason}{row.disqualification.comment?` - ${row.disqualification.comment}`:''}</span>}{row.notCounted && <span className="not-counted-reason">Not counted</span>}{row.flags.length>0 && <span className="result-flags">{row.flags.filter(flag=>flag.kind!=='tie').map((flag,index)=><span className={flag.checked || flag.kind==='tie-settled'?'checked-warning':''} key={`${flag.kind}:${index}`}>{flag.message}</span>)}</span>}</span>
        </button>{detail.results.ties.filter(tie=>tie.entries.some(entry=>entry.raceId===row.raceId && entry.entryId===row.entryId)).map(tie=><button key={tie.id} className="tie-open" aria-label={`TIE at ${formatTime(tie.time)} for ${resultName(row)}`} onClick={()=>{setSelected(null);setSelectedTieId(tie.id);}}>TIE</button>)}</li>
        {row.position===Math.min(detail.results.band.lineAfter,detail.results.leaderboard.filter(row=>row.position!==null).length) && <li className="result-line" role="presentation">{detail.results.band.lineLabel}</li>}
      </Fragment>)}</ol>}
      {detail.results.finalResults && <FinalPanel code={detail.event.code} final={detail.results.finalResults} onSaved={saved} onSelect={row=>setSelected({raceId:row.raceId,entryId:row.entryId})} onRace={()=>openRace(detail.results.finalResults!.raceId)}/>}
      {detail.results.notRankedYet.length>0 && <aside className="not-ranked"><h3>Not ranked yet</h3><ul>{detail.results.notRankedYet.map(item=><li key={item.race.id}><button className="button-small button-secondary" onClick={()=>openRace(item.race.id)} aria-label={`Open ${label(item.race)}`}>{label(item.race)}</button> · {item.reasons.join(' · ')}</li>)}</ul></aside>}
      {detail.results.leaderboard.length>0 && <section className="results-races"><h3>Races</h3><div className="results-race-buttons">{[...new Map(detail.results.leaderboard.map(row=>[row.raceId,row.race])).values()].map(race=><button key={race.id} className="button-small button-secondary" onClick={()=>openRace(race.id)}>Open {label(race)}</button>)}</div></section>}
      {(detail.results.checkSheet || detail.results.heatsCheckSheet) && <section className="stage-actions">
        {detail.results.checkSheet && <button onClick={()=>setSelectedStage(detail.results.checkSheet)}>{detail.results.checkSheet.completed?(detail.results.checkSheet.stage==='final'?'Reopen final':detail.results.checkSheet.stage==='heats'?'Reopen heats':'Reopen event'):detail.results.checkSheet.label}</button>}
        {detail.results.heatsCheckSheet && detail.results.checkSheet?.stage!=='heats' && <button className="button-secondary" onClick={()=>setSelectedStage(detail.results.heatsCheckSheet)}>{detail.results.heatsCheckSheet.completed?'Reopen heats':'Heats complete'}</button>}
      </section>}
      {detail.results.inputRunning && <section className="input-running-section"><h3>Input - Running</h3><table className="input-running" aria-label="Input - Running"><thead><tr><th>Event code</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead><tbody><tr><td>{detail.results.inputRunning.eventCode}</td>{detail.results.inputRunning.teams?detail.results.inputRunning.teams.map((team,index)=><td key={index}>{team?<ResultName entry={{wristband:null,team}} className="input-running-team"/>:'-'}</td>):<><td>{detail.results.inputRunning.first??'-'}</td><td>{detail.results.inputRunning.second??'-'}</td><td>{detail.results.inputRunning.third??'-'}</td></>}</tr></tbody></table></section>}
      <DeletedRaces eventCode={detail.event.code} onOpen={openRace}/>
      {detail.auditNotes.length>0 && <section className="audit-notes"><h3>Audit notes</h3><ol aria-label="Audit notes">{detail.auditNotes.map(note=><li key={note.id}><time dateTime={note.at}>{clock(note.at)}</time><span>{note.message}</span></li>)}</ol></section>}
    </>}</>}</> : !list?<><h1>Results</h1><p className="results-opening">Opening events…</p></>:<><h1>Results</h1>
      <ul className="results-legend" aria-label="Card colours">{(['done','running','not-started'] as const).map(state=><li key={state}><span className={`results-swatch event-card-${state}`} aria-hidden="true"/>{state==='done'?'Done':state==='running'?'Running':'Not started'}</li>)}</ul>
      {!list.eventsConfirmed && <p className="calm-note">Event list awaiting confirmation by the scoring team</p>}
      {list.groups.map((group,index)=><section key={group.name} className="results-group" aria-labelledby={`results-group-${index}`}><h2 id={`results-group-${index}`}>{group.name}</h2><div className="results-events">{group.events.map(item=>{
        const card=eventState({status:item.status,raceCount:item.raceCount,format:item.event.format});
        return <button key={item.event.id} className={`event-card event-card-${card.state}`} onClick={()=>open(item.event.code,`${item.event.name} ${item.event.section}`)}>
          <span className="event-card-title"><span>{item.event.code} · {item.event.section}</span>{card.state==='done' && tick}</span>
          <span className="event-card-status">{card.line}{!item.event.enabled?' · Switched off':''}</span>
          {item.latestNoteAt && <span className="event-card-note">Latest note {clock(item.latestNoteAt)}</span>}
        </button>;})}</div></section>)}</>}
    {!selectedRace && <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh</button></footer>}
  </div>;
}
