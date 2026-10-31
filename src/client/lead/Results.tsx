import { FinalPanel } from './FinalPanel.js';
import { StageSheet,reopenLabel } from './StageSheet.js';
import type { Stage,StageCheckSheet,StageItem } from '../../shared/stages.js';
import { DeletedRaces,RaceRows } from './DeletedRaces.js';
import { Fragment,useEffect,useState,useRef } from 'react';
import { api } from '../api.js';
import type { ResultsGridRead,EventResultsRead,ResultsTarget } from '../../shared/lead-results.js';
import { RacePage } from './RacePage.js';
import { RunnerActions } from './RunnerActions.js';
import { resultLabel,teamWristbands } from './ResultName.js';
import { resultName,ruleLine,type LeaderboardRow } from '../../shared/results-rules.js';
import { formatTime } from '../../shared/time-entry.js';
import { Callout,Icon,LeadBar,Star,UpdatedAt } from '../races/parts.js';
import { eventTabs,type EventTab,type View } from '../shell/addresses.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceLabel,runnersText } from '../../shared/races.js';
import { clock,clockWithSeconds } from '../../shared/clock.js';
import { eventTitle } from '../../shared/day.js';
import './results.css';
/**
 * Results (no `code`): the event grid, each card in its Races card's words; an event (`code`): its leaderboard,
 * rulings and audit notes; a race page (`code` and `raceId`). Each is its own screen with its own address, under the
 * lead header; `onOpen` moves to another screen (a tie is one) and `onBack` goes back. `target` is what Open in
 * Results asked to open on the event: a runner's actions or a check sheet.
 */
export function Results({code,raceId,tab,target,onOpen,onBack,onChanged}:{code?:string;raceId?:string;tab?:EventTab;target?:ResultsTarget;onOpen:(view:View,options?:{replace?:boolean})=>void;onBack:()=>void;onChanged?:()=>void}) {
  const [selectedStage,setSelectedStage]=useState<StageCheckSheet|null>(null);
  // Confirm the medals opens the event on its check sheet, once, when its results first arrive.
  const [stageToOpen,setStageToOpen]=useState(target?.stage);
  const [list,setList]=useState<ResultsGridRead|null>(null);
  const [detail,setDetail]=useState<EventResultsRead|null>(null);
  const [selected,setSelected]=useState<{raceId:string;entryId:string}|null>(target?.raceId && target.entryId?{raceId:target.raceId,entryId:target.entryId}:null);
  const [updated,setUpdated]=useState('');
  const [error,setError]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {
      if(code) {const next=await api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/results`);if(generation!==request.current) return;setDetail(next);}
      else {const next=await api<ResultsGridRead>('lead/results');if(generation!==request.current) return;setList(next);}
      setUpdated(clockWithSeconds(new Date()));setError('');
    } catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{
    if(!detail || !stageToOpen) return;
    const sheet=[detail.results.checkSheet,detail.results.heatsCheckSheet,detail.results.noFinalCheckSheet].find(sheet=>sheet?.stage===stageToOpen);
    if(sheet && !sheet.completed) setSelectedStage(sheet);
    setStageToOpen(undefined);
  },[detail]);
  useEffect(()=>{
    void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    return()=>{request.current++;clearInterval(timer);};
  },[code]);
  const openRace=(id:string)=>onOpen({kind:'race-page',code:code!,raceId:id});

  // A tie opened from Results without a final is judged against medal places there.
  const openTie=(tieId:string,stage?:Stage)=>onOpen({kind:'tie',code:code!,tieId,...(stage==='no-final'?{stage}:{})});
  const selectedRow=detail?.results.actionableRunners.find(row=>row.raceId===selected?.raceId && row.entryId===selected?.entryId);
  function saved(next:EventResultsRead) {request.current++;setDetail(next);setSelected(null);setSelectedStage(null);setUpdated(clockWithSeconds(new Date()));onChanged?.();}
  function openStageItem(item:StageItem) {
    setSelectedStage(null);
    if(item.tieId) openTie(item.tieId,selectedStage?.stage);
    else if(item.entryId && detail?.results.actionableRunners.some(row=>row.raceId===item.raceId && row.entryId===item.entryId)) setSelected({raceId:item.raceId!,entryId:item.entryId});
    else if(item.raceId) openRace(item.raceId);
  }
  if(!code) return <LeadBar title="Results" up="Races" wide body={<EventGrid list={list} error={error} updated={updated} onRefresh={()=>void refresh()} onOpen={onOpen}/>}/>;
  if(raceId) return <RacePage key={raceId} raceId={raceId} screen={{code}} actionableRunners={detail?.results.actionableRunners} onSaved={saved} onClose={onBack}/>;
  const sheets=detail && <>
    {selectedRow && <RunnerActions key={`${selectedRow.raceId}:${selectedRow.entryId}`} row={selectedRow} rows={detail.results.actionableRunners} eventCode={detail.event.code} onSaved={saved} onClose={()=>setSelected(null)}/>}
    {selectedStage && <StageSheet event={detail.event} sheet={selectedStage} discardsFinal={detail.results.finalResults!==null} onSaved={saved} onClose={()=>setSelectedStage(null)} onOpen={openStageItem}/>}</>;
  const body=<><main className="rz-main rz-main--event">
    {error && <Callout message={error}/>}
    {!detail?!error && <p className="rz-empty">Opening…</p>:<EventTabs detail={detail} tab={tab??'heats'} onTab={next=>onOpen({kind:'event',code,tab:next},{replace:true})}
      onRunner={row=>setSelected({raceId:row.raceId,entryId:row.entryId})} onTie={id=>openTie(id)}
      onStage={setSelectedStage} onRace={openRace} saved={saved}/>}
  </main><footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void refresh()}/></footer></>;
  // The older-look sheets sit outside the screen root, so they keep their look until their own tickets move them.
  return <><LeadBar title={detail?eventTitle(detail.event):code} code={detail?.event.code} up="Results" wide body={body}/>{sheets}</>;
}
const tabNames:Record<EventTab,string>={heats:'Heats',final:'Final',races:'Races',notes:'Notes'};
type TabProps={detail:EventResultsRead;onRunner:(row:LeaderboardRow)=>void;onTie:(id:string)=>void;onStage:(sheet:StageCheckSheet)=>void;onRace:(id:string)=>void;saved:(next:EventResultsRead)=>void};
/**
 * An event's tabs: Heats (the scoreboard), Final (a heats event not decided without one), Races and Notes. The tab is
 * part of the address; switching replaces it in place, so Back leaves the event.
 */
function EventTabs({tab,onTab,...props}:TabProps & {tab:EventTab;onTab:(tab:EventTab)=>void}) {
  const {detail}=props,final=detail.event.format==='heats' && !detail.results.decidedWithoutFinal;
  const tabs=eventTabs.filter(item=>item!=='final' || final),shown=tabs.includes(tab)?tab:'heats';
  return <>
    <nav className="rz-tabs" aria-label="Event">{tabs.map(item=><button key={item} type="button" aria-current={item===shown?'page':undefined} onClick={()=>onTab(item)}>{tabNames[item]}</button>)}</nav>
    {!detail.event.enabled && <p className="rz-note">Switched off</p>}
    {shown==='heats' && <HeatsTab {...props} final={final}/>}
    {shown==='final' && <FinalTab {...props}/>}
    {shown==='races' && <RacesTab {...props}/>}
    {shown==='notes' && (detail.auditNotes.length?<ol className="rz-notes" aria-label="Audit notes">{[...detail.auditNotes].reverse().map(note=><li key={note.id}><time dateTime={note.at}>{clock(note.at)}</time><span>{note.message}</span></li>)}</ol>
      :<p className="rz-empty">Notes appear here when a lead changes this event's results.</p>)}
  </>;
}
/** A check-sheet button: Reopen once its stage is complete, else the stage's own label. */
const StageButton=({sheet,label=sheet.completed?reopenLabel(sheet.stage):sheet.label,onStage}:{sheet:StageCheckSheet;label?:string;onStage:(sheet:StageCheckSheet)=>void})=>
  <button type="button" className="rz-btn rz-btn--block" onClick={()=>onStage(sheet)}>{label}</button>;
/** The scoreboard of every heat's runners, then (until their screens move) the stage buttons under it. */
function HeatsTab({detail,final,onRunner,onTie,onStage}:TabProps & {final:boolean}) {
  const results=detail.results,ranked=results.leaderboard.filter(row=>row.position!==null).length;
  const sheet=results.checkSheet?.stage==='final'?null:results.checkSheet;
  return <>
    {results.leaderboard.length===0?<p className="rz-empty">Runners appear here once a heat is saved.</p>:<section className="rz-scoreboard rz-scoreboard--tab" aria-label="Heats">
      <div className="rz-stripes" aria-hidden="true"><span/><span/><span/></div>
      <div className="rz-board-head"><p className="rz-board-note">{ruleLine(results.band)}</p></div>
      <ol className="rz-board" aria-label={results.provisional?'Provisional leaderboard':'Official leaderboard'}>{results.leaderboard.map(row=>{
        const star=row.qualification!==null || row.medalPlace!==null,check=row.flags.some(flag=>flag.kind!=='tie' && flag.kind!=='tie-settled' && !flag.checked);
        const ties=results.ties.filter(tie=>tie.entries.some(entry=>entry.raceId===row.raceId && entry.entryId===row.entryId));
        return <Fragment key={`${row.raceId}:${row.entryId}`}><li className="rz-board__row">
          <button type="button" className={`rz-lb${star?' rz-lb--q':row.highlighted?'':' rz-lb--outside'}`} aria-label={`${resultLabel(row)} · ${raceLabel(row.race)}`} onClick={()=>onRunner(row)}>
            <span className={star?'rz-lb__rank':'rz-lb__rank rz-lb__rank--plain'}>{star && <Star/>}<span>{row.position??'-'}</span></span>
            <span className="rz-lb__who"><span className="rz-lb__band"><span>{resultName(row)}</span>{row.qualification && <span className="rz-tag rz-tag--q">Q</span>}{row.medalPlace && <span className="rz-tag rz-tag--q">{ordinal(row.medalPlace)}</span>}{check && <span className="rz-tag rz-tag--warn">Check</span>}</span>
              {row.team && <span className="rz-lb__detail">{teamWristbands(row.team)}</span>}
              <span className="rz-lb__detail">{rowDetail(row)}</span></span>
            <span className="rz-lb__end"><span className="rz-lb__time">{row.time===null?'-':formatTime(row.time)}</span></span>
          </button>
          {ties.map(tie=><button key={tie.id} type="button" className="rz-lb__tie" aria-label={`TIE at ${formatTime(tie.time)} for ${resultName(row)}`} onClick={()=>onTie(tie.id)}><span className="rz-tag rz-tag--tie">Tie</span></button>)}</li>
          {final && row.position===Math.min(results.band.lineAfter,ranked) && <li className="rz-qline" aria-label="Qualifying line: places above go through to the final"><span aria-hidden="true">Qualifying line</span></li>}
        </Fragment>;})}</ol>
    </section>}
    {sheet && <StageButton sheet={sheet} label={sheet.completed?reopenLabel(sheet.stage):sheet.stage==='heats'?'Heats complete':sheet.label} onStage={onStage}/>}
    {results.heatsCheckSheet && sheet?.stage!=='heats' && <StageButton sheet={results.heatsCheckSheet} label={results.heatsCheckSheet.completed?reopenLabel('heats'):'Heats complete'} onStage={onStage}/>}
    {results.noFinalCheckSheet && <StageButton sheet={results.noFinalCheckSheet} onStage={onStage}/>}
    {!final && <InputRunning detail={detail}/>}
  </>;
}
/** A heats row's detail: its race and place, or why it does not rank. */
function rowDetail(row:LeaderboardRow) {
  const race=raceLabel(row.race);
  if(row.disqualification) return `${race} · Disqualified: ${row.disqualification.reason}${row.disqualification.comment?` - ${row.disqualification.comment}`:''}`;
  if(row.notCounted) return `${race} · Not counted`;
  return `${race} · ${row.place!==null?`${ordinal(row.place)} in race`:'Did not finish'}`;
}
/** shortcut: today's final panel, check-sheet button and Input - Running table on the Final tab; #277 builds the tab in the new look. */
function FinalTab({detail,onRunner,onStage,onRace,saved}:TabProps) {
  const results=detail.results,sheet=results.checkSheet?.stage==='final'?results.checkSheet:null;
  if(!results.finalResults) return <p className="rz-empty">The final's order appears here once its finishing order is saved.</p>;
  return <div className="rz-final-today">
    <FinalPanel event={detail.event} relay={detail.event.relay} teams={detail.teams} final={results.finalResults} onSaved={saved} onSelect={onRunner} onRace={()=>onRace(results.finalResults!.raceId)}/>
    {sheet && <StageButton sheet={sheet} onStage={onStage}/>}
    <InputRunning detail={detail}/>
  </div>;
}
function InputRunning({detail}:{detail:EventResultsRead}) {
  const input=detail.results.inputRunning;
  return input && <section className="input-running-section"><h3>Input - Running</h3><table className="input-running" aria-label="Input - Running"><thead><tr><th>Event code</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead><tbody><tr><td>{input.eventCode}</td>{input.teams?input.teams.map((team,index)=><td key={index}>{team?<><strong>Team {team.number}</strong>{team.wristbands.map((wristband,leg)=><span key={leg} className="input-running-leg">{wristband??'-'}</span>)}</>:'-'}</td>):<><td>{input.first??'-'}</td><td>{input.second??'-'}</td><td>{input.third??'-'}</td></>}</tr></tbody></table></section>;
}
/** A row per live race (its runners, saved or not, checked in at, why it does not count yet), then Deleted races. */
function RacesTab({detail,onRace}:TabProps) {
  const races=detail.results.races;
  return <>
    {races.length?<RaceRows rows={races.map(({race,runners,saved,reasons})=>({id:race.id,label:`Open ${race.kind==='final'?'final':raceLabel(race)}`,meta:[runnersText(runners),saved?'saved':'not saved yet',`checked in ${clock(race.checkedInAt)}`,...reasons.filter(reason=>reason!=='in progress')].join(' · ')}))} onRace={onRace}/>
      :<p className="rz-empty">Races appear here once one is checked in.</p>}
    <h2 className="rz-section">Deleted races</h2>
    <DeletedRaces eventCode={detail.event.code} onOpen={onRace}/>
  </>;
}

const keyStates=[['done','Done'],['running','Running'],['idle','Not started']] as const;
/** Results: the key, then each distance's events as a grid of cards worded and coloured as their Races cards. */
function EventGrid({list,error,updated,onRefresh,onOpen}:{list:ResultsGridRead|null;error:string;updated:string;onRefresh:()=>void;onOpen:(view:View)=>void}) {
  return <><main className="rz-main">
    {error && <Callout message={error}/>}
    <ul className="rz-legend" aria-label="Key">{keyStates.map(([state,label])=><li key={state}><span className={`rz-legend__swatch rz-legend__swatch--${state}`} aria-hidden="true"/>{label}</li>)}</ul>
    {!list?!error && <p className="rz-empty">Opening…</p>:<>
      {list.groups.map((group,index)=><section key={group.name} aria-labelledby={`results-group-${index}`}><h2 className="rz-section" id={`results-group-${index}`}>{group.name}</h2><ul className="rz-events">{group.events.map(({event,card,latestNoteAt})=><li key={event.id}>
        <button type="button" className={`rz-event rz-event--${card.state==='not-started'?'idle':card.state}`} onClick={()=>onOpen({kind:'event',code:event.code,tab:'heats'})}>
          <span className="rz-event__name">{event.code} · {event.section}</span>
          <span className="rz-event__status">{card.state==='done' && <Icon name="check"/>}{card.line}{!event.enabled?' · Switched off':''}</span>
          {latestNoteAt && <span className="rz-event__status">Latest note {clock(latestNoteAt)}</span>}
        </button></li>)}</ul></section>)}</>}
  </main>
  <footer className="rz-footer"><UpdatedAt time={updated} onRefresh={onRefresh}/></footer></>;
}
