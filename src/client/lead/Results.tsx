import { Fragment,useEffect,useState,useRef } from 'react';
import { api } from '../api.js';
import type { ResultsRead,EventResultsRead } from '../../shared/lead-results.js';
import { RunnerActions } from './RunnerActions.js';
import { formatTime } from '../../shared/time-entry.js';
import './results.css';
const noteTime=(at:string)=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
const ordinal=(number:number)=>`${number}${number===1?'st':number===2?'nd':number===3?'rd':'th'}`;
const label=(race:{kind:'heat'|'final'|'race';number:number})=>`${race.kind==='heat'?'Heat':race.kind==='final'?'Final':'Race'} ${race.number}`;
export function Results() {
  const [code,setCode]=useState<string|null>(null);
  const [list,setList]=useState<ResultsRead|null>(null);
  const [detail,setDetail]=useState<EventResultsRead|null>(null);
  const [selected,setSelected]=useState<{raceId:string;entryId:string}|null>(null);
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
  function open(code:string|null) {request.current++;setDetail(null);setSelected(null);setCode(code);setError('');}
  const selectedRow=detail?.results.leaderboard.find(row=>row.raceId===selected?.raceId && row.entryId===selected?.entryId);
  function saved(next:EventResultsRead) {request.current++;setDetail(next);setSelected(null);setUpdated(new Date().toLocaleTimeString());}
  return <div className="results-view">{error && <p role="alert">{error}</p>}
    {code ? <><button onClick={()=>open(null)}>Back to events</button>{!detail?<p>Opening results…</p>:<>
      <h2>{detail.event.name} {detail.event.section} ({detail.event.code})</h2><p className="provisional-label">Provisional · {detail.results.raceCount} {detail.results.raceCount===1?'race':'races'}</p>
      {selectedRow && <RunnerActions key={`${selectedRow.raceId}:${selectedRow.entryId}`} row={selectedRow} onSaved={saved} onClose={()=>setSelected(null)}/>}
      <p>Top {detail.results.band.highlightCount} highlighted · {detail.event.format==='heats'?'Q: fastest 6':'Medal places: 1st, 2nd, 3rd'}</p>
      {detail.results.leaderboard.length===0?<p>No runners ranked yet</p>:<ol className="leaderboard" aria-label="Provisional leaderboard">{detail.results.leaderboard.map(row=><Fragment key={`${row.raceId}:${row.entryId}`}>
        <li><button type="button" aria-label={`Runner ${row.wristband} · ${label(row.race)}`} onClick={()=>setSelected({raceId:row.raceId,entryId:row.entryId})} className={`leaderboard-row result-open ${row.disqualification?'disqualified':''} ${row.highlighted?'highlighted':''} ${row.status==='Did not finish'?'did-not-finish':''}`}>
          <span className="result-position"><strong>{row.position??'—'}</strong>{row.qualification && <span className="result-mark">Q</span>}{row.medalPlace && <span className="result-mark">{ordinal(row.medalPlace)}</span>}</span>
          <strong className="result-number">{row.wristband}</strong><span className="result-time">{row.time===null?'—':formatTime(row.time)}</span>
          <span className="result-detail">{label(row.race)}{row.place!==null?` · ${ordinal(row.place)} in race`:row.status==='Did not finish'?' · Did not finish':''}{row.disqualification && <span className="disqualification-reason">Disqualified: {row.disqualification.reason}{row.disqualification.comment?` — ${row.disqualification.comment}`:''}</span>}{row.hasNote && <span className="note-tag">note</span>}{row.flags.length>0 && <span className="result-flags">{row.flags.map((flag,index)=><span key={`${flag.kind}:${index}`}>{flag.message}</span>)}</span>}</span>
        </button></li>
        {row.position===detail.results.band.lineAfter && <li className="result-line" role="presentation">{detail.results.band.lineLabel}</li>}
      </Fragment>)}</ol>}
      {detail.results.notRankedYet.length>0 && <aside className="not-ranked"><h3>Not ranked yet</h3><ul>{detail.results.notRankedYet.map(item=><li key={item.race.id}>{label(item.race)} · {item.reasons.join(' · ')}</li>)}</ul></aside>}
      {detail.auditNotes.length>0 && <section className="audit-notes"><h3>Audit notes</h3><ol aria-label="Audit notes">{detail.auditNotes.map(note=><li key={note.id}><time dateTime={note.at}>{noteTime(note.at)}</time> {note.message}</li>)}</ol></section>}
    </>}</> : !list?<p>Opening events…</p>:<>{!list.eventsConfirmed && <p>Event list awaiting confirmation by the scoring team</p>}{list.groups.map(group=><section key={group.name} className="results-group"><h2>{group.name}</h2><div className="results-events">{group.events.map(item=><button key={item.event.id} onClick={()=>open(item.event.code)}><strong>{item.event.code} · {item.event.section}</strong><small>{item.status}{item.raceCount>0?` · ${item.raceCount} ${item.raceCount===1?'race':'races'}`:''}{!item.event.enabled?' · Switched off':''}{item.latestNoteAt && <span className="latest-note">Latest note {noteTime(item.latestNoteAt)}</span>}</small></button>)}</div></section>)}</>}
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh Results</button></footer>
  </div>;
}
