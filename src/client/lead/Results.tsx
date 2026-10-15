import { FinalPanel } from './FinalPanel.js';
import { StageSheet } from './StageSheet.js';
import type { StageCheckSheet,StageItem } from '../../shared/stages.js';
import { DeletedRaces } from './DeletedRaces.js';
import { Fragment,useEffect,useState,useRef } from 'react';
import { api } from '../api.js';
import type { DayLeadItem,ResultsRead,EventResultsRead } from '../../shared/lead-results.js';
import { RacePage } from './RacePage.js';
import { RunnerActions } from './RunnerActions.js';
import { TieSheet } from './TieSheet.js';
import { formatTime } from '../../shared/time-entry.js';
import { ordinal } from '../../shared/ordinal.js';
import './results.css';
const noteTime=(at:string)=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
const label=(race:{kind:'heat'|'final'|'race';number:number})=>`${race.kind==='heat'?'Heat':race.kind==='final'?'Final':'Race'} ${race.number}`;
export function Results({target,onChanged}:{target?:DayLeadItem;onChanged?:()=>void}={}) {
  const [selectedStage,setSelectedStage]=useState<StageCheckSheet|null>(null);
  const [selectedTieId,setSelectedTieId]=useState<string|null>(target?.tieId||null);
  const [code,setCode]=useState<string|null>(target?.event.code||null);
  const [list,setList]=useState<ResultsRead|null>(null);
  const [detail,setDetail]=useState<EventResultsRead|null>(null);
  const [selectedRace,setSelectedRace]=useState<string|null>(target?.entryId?null:target?.raceId||null);
  const [selected,setSelected]=useState<{raceId:string;entryId:string}|null>(target?.raceId && target.entryId?{raceId:target.raceId,entryId:target.entryId}:null);
  const [updated,setUpdated]=useState('');
  const [error,setError]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {
      if(code) {const next=await api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/results`);if(generation!==request.current) return;setDetail(next);}
      else {const next=await api<ResultsRead>('lead/results');if(generation!==request.current) return;setList(next);}
      setUpdated(new Date().toLocaleTimeString());setError('');
    } catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{
    void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    return()=>{request.current++;clearInterval(timer);};
  },[code]);
  function open(code:string|null) {request.current++;setDetail(null);setSelected(null);setSelectedTieId(null);setSelectedStage(null);setSelectedRace(null);setCode(code);setError('');}

  const selectedTie=detail?.results.ties.find(tie=>tie.id===selectedTieId);
  const selectedRow=detail?.results.actionableRunners.find(row=>row.raceId===selected?.raceId && row.entryId===selected?.entryId);
  function saved(next:EventResultsRead) {request.current++;setDetail(next);setSelected(null);setSelectedTieId(null);setSelectedStage(null);setUpdated(new Date().toLocaleTimeString());onChanged?.();}
  function openStageItem(item:StageItem) {
    setSelectedStage(null);
    const tie=detail?.results.ties.find(tie=>tie.id===item.tieId);
    if(tie) setSelectedTieId(tie.id);
    else if(item.entryId && detail?.results.actionableRunners.some(row=>row.raceId===item.raceId && row.entryId===item.entryId)) setSelected({raceId:item.raceId!,entryId:item.entryId});
    else if(item.raceId) setSelectedRace(item.raceId);
  }
  return <div className="results-view">{error && <p role="alert">{error}</p>}
    {code ? <>{!selectedRace && <button onClick={()=>open(null)}>Back to events</button>}{!detail?<p>Opening results…</p>:<>
      {selectedRace?<RacePage key={selectedRace} raceId={selectedRace} actionableRunners={detail.results.actionableRunners} onSaved={saved} onClose={()=>setSelectedRace(null)}/>:<>
      <h2>{detail.event.name} {detail.event.section} ({detail.event.code})</h2><p className="provisional-label">{detail.results.status==='Heats complete - final to run'?detail.results.status:detail.results.provisional?'Provisional':'Complete'} · {detail.results.raceCount} {detail.results.raceCount===1?'race':'races'}</p>
      {selectedRow && <RunnerActions key={`${selectedRow.raceId}:${selectedRow.entryId}`} row={selectedRow} rows={detail.results.actionableRunners} eventCode={detail.event.code} onSaved={saved} onClose={()=>setSelected(null)}/>}
      {selectedStage && <StageSheet code={detail.event.code} sheet={selectedStage} onSaved={saved} onClose={()=>setSelectedStage(null)} onOpen={openStageItem}/>}
      {selectedTie && <TieSheet key={selectedTie.id} code={detail.event.code} tie={selectedTie} onSaved={saved} onClose={()=>setSelectedTieId(null)}/>}
      <p>Top {detail.results.band.highlightCount} highlighted · {detail.event.format==='heats'?'Q: fastest 6':'Medal places: 1st, 2nd, 3rd'}</p>
      {detail.results.leaderboard.length===0?<p>No runners ranked yet</p>:<ol className="leaderboard" aria-label={detail.results.provisional?'Provisional leaderboard':'Official leaderboard'}>{detail.results.leaderboard.map(row=><Fragment key={`${row.raceId}:${row.entryId}`}>
        <li><button type="button" aria-label={`Runner ${row.wristband} · ${label(row.race)}`} onClick={()=>{setSelectedTieId(null);setSelected({raceId:row.raceId,entryId:row.entryId});}} className={`leaderboard-row result-open ${row.disqualification?'disqualified':''} ${row.notCounted?'not-counted':''} ${row.highlighted?'highlighted':''} ${row.status==='Did not finish'?'did-not-finish':''}`}>
          <span className="result-position"><strong>{row.position??'—'}</strong>{row.qualification && <span className="result-mark">Q</span>}{row.medalPlace && <span className="result-mark">{ordinal(row.medalPlace)}</span>}</span>
          <strong className="result-number">{row.wristband}</strong><span className="result-time">{row.time===null?'—':formatTime(row.time)}</span>
          <span className="result-detail">{label(row.race)}{row.place!==null?` · ${ordinal(row.place)} in race`:row.status==='Did not finish'?' · Did not finish':''}{row.disqualification && <span className="disqualification-reason">Disqualified: {row.disqualification.reason}{row.disqualification.comment?` — ${row.disqualification.comment}`:''}</span>}{row.notCounted && <span className="not-counted-reason">Not counted</span>}{row.hasNote && <span className="note-tag">note</span>}{row.flags.length>0 && <span className="result-flags">{row.flags.filter(flag=>flag.kind!=='tie').map((flag,index)=><span className={flag.checked?'checked-warning':''} key={`${flag.kind}:${index}`}>{flag.message}</span>)}</span>}</span>
        </button>{detail.results.ties.filter(tie=>tie.entries.some(entry=>entry.raceId===row.raceId && entry.entryId===row.entryId)).map(tie=><button key={tie.id} className="tie-open" aria-label={`TIE at ${formatTime(tie.time)} for ${row.wristband}`} onClick={()=>{setSelected(null);setSelectedTieId(tie.id);}}>TIE</button>)}</li>
        {row.position===Math.min(detail.results.band.lineAfter,detail.results.leaderboard.filter(row=>row.position!==null).length) && <li className="result-line" role="presentation">{detail.results.band.lineLabel}</li>}
      </Fragment>)}</ol>}
      {detail.results.finalResults && <FinalPanel code={detail.event.code} final={detail.results.finalResults} onSaved={saved} onSelect={row=>setSelected({raceId:row.raceId,entryId:row.entryId})} onRace={()=>setSelectedRace(detail.results.finalResults!.raceId)}/>}
      <DeletedRaces eventCode={detail.event.code} onOpen={setSelectedRace}/>
      {detail.results.notRankedYet.length>0 && <aside className="not-ranked"><h3>Not ranked yet</h3><ul>{detail.results.notRankedYet.map(item=><li key={item.race.id}><button onClick={()=>setSelectedRace(item.race.id)} aria-label={`Open ${label(item.race)}`}>{label(item.race)}</button> · {item.reasons.join(' · ')}</li>)}</ul></aside>}
      {detail.results.leaderboard.length>0 && <section><h3>Races</h3>{[...new Map(detail.results.leaderboard.map(row=>[row.raceId,row.race])).values()].map(race=><button key={race.id} onClick={()=>setSelectedRace(race.id)}>Open {label(race)}</button>)}</section>}
      {detail.results.checkSheet && <section className="stage-actions"><button onClick={()=>setSelectedStage(detail.results.checkSheet)}>{detail.results.checkSheet.completed?(detail.results.checkSheet.stage==='final'?'Reopen final':detail.results.checkSheet.stage==='heats'?'Reopen heats':'Reopen event'):detail.results.checkSheet.label}</button></section>}
      {detail.results.heatsCheckSheet && detail.results.checkSheet?.stage!=='heats' && <button onClick={()=>setSelectedStage(detail.results.heatsCheckSheet)}>{detail.results.heatsCheckSheet.completed?'Reopen heats':'Heats complete'}</button>}
      {detail.results.inputRunning && <section><h3>Input - Running</h3><table className="input-running" aria-label="Input - Running"><thead><tr><th>Event code</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead><tbody><tr><td>{detail.results.inputRunning.eventCode}</td><td>{detail.results.inputRunning.first??'—'}</td><td>{detail.results.inputRunning.second??'—'}</td><td>{detail.results.inputRunning.third??'—'}</td></tr></tbody></table></section>}
      {detail.auditNotes.length>0 && <section className="audit-notes"><h3>Audit notes</h3><ol aria-label="Audit notes">{detail.auditNotes.map(note=><li key={note.id}><time dateTime={note.at}>{noteTime(note.at)}</time> {note.message}</li>)}</ol></section>}
    </>}</>}</> : !list?<p>Opening events…</p>:<>{!list.eventsConfirmed && <p>Event list awaiting confirmation by the scoring team</p>}{list.groups.map(group=><section key={group.name} className="results-group"><h2>{group.name}</h2><div className="results-events">{group.events.map(item=><button key={item.event.id} onClick={()=>open(item.event.code)}><strong>{item.event.code} · {item.event.section}</strong><small>{item.needsYou} needing you · {item.status}{item.raceCount>0?` · ${item.raceCount} ${item.raceCount===1?'race':'races'}`:''}{!item.event.enabled?' · Switched off':''}{item.latestNoteAt && <span className="latest-note">Latest note {noteTime(item.latestNoteAt)}</span>}</small></button>)}</div></section>)}</>}
    {!selectedRace && <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Results</button></footer>}
  </div>;
}
