import { Final } from './Final.js';
import { StageSheet,reopenLabel } from './StageSheet.js';
import { dayExportLine,type InputRunning,type Stage,type StageCheckSheet,type StageItem } from '../../shared/stages.js';
import { DeletedRaces,RaceRows } from './DeletedRaces.js';
import { Fragment,useEffect,useState,useRef } from 'react';
import { api } from '../api.js';
import type { ResultsGridRead,EventResultsRead,ResultsTarget } from '../../shared/lead-results.js';
import { RacePage } from './RacePage.js';
import { RunnerScreens,RunnerSheet } from './RunnerSheet.js';
import { resultLabel,teamWristbands } from './ResultName.js';
import { resultName,ruleLine,type LeaderboardRow } from '../../shared/results-rules.js';
import { formatTime } from '../../shared/time-entry.js';
import { Callout,Icon,LeadBar,Star,UpdatedAt } from '../races/parts.js';
import { eventTabs,type EventTab,type View } from '../shell/addresses.js';
type RunnerView=Extract<View,{kind:'runner'}>;
import { ordinal } from '../../shared/ordinal.js';
import { raceLabel,runnersText } from '../../shared/races.js';
import { clock,clockWithSeconds } from '../../shared/clock.js';
import { eventTitle } from '../../shared/day.js';
import './results.css';
/**
 * Results (no `code`): the event grid, each card in its Races card's words; an event (`code`): its leaderboard,
 * rulings and audit notes; a race page (`code` and `raceId`). Each is its own screen with its own address, under the
 * lead header; `onOpen` moves to another screen (a tie is one) and `onBack` goes back. `target` is what Open in
 * Results asked to open on the event: the runner sheet or a check sheet. `runner` is one of the runner sheet's screens.
 */
export function Results({code,raceId,runner,tab,target,onOpen,onBack,onChanged}:{code?:string;raceId?:string;runner?:RunnerView;tab?:EventTab;target?:ResultsTarget;onOpen:(view:View,options?:{replace?:boolean})=>void;onBack:()=>void;onChanged?:()=>void}) {
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
  // An event opened with no tab opens where the work is, and its address takes that tab.
  useEffect(()=>{if(detail && code && !tab && !raceId && !runner) onOpen({kind:'event',code,tab:openingTab(detail)},{replace:true});},[detail,tab]);
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
  if(runner) return <RunnerScreens view={runner} detail={detail} error={error} onBack={onBack} onChanged={onChanged}/>;
  if(raceId) return <RacePage key={raceId} raceId={raceId} code={code} actionableRunners={detail?.results.actionableRunners} onSaved={saved} onOpen={onOpen}/>;
  const sheets=detail && <>
    {selectedRow && <RunnerSheet key={`${selectedRow.raceId}:${selectedRow.entryId}`} event={detail.event} row={selectedRow} rows={detail.results.actionableRunners} onSaved={saved} onClose={()=>setSelected(null)} onOpen={onOpen} onRace={()=>openRace(selectedRow.raceId)}/>}
    {selectedStage && <StageSheet event={detail.event} sheet={selectedStage} discardsFinal={detail.results.finalResults!==null} onSaved={saved} onClose={()=>setSelectedStage(null)} onOpen={openStageItem}/>}</>;
  const body=<><main className="rz-main rz-main--event">
    {error && <Callout message={error}/>}
    {!detail?!error && <p className="rz-empty">Opening…</p>:<EventTabs detail={detail} tab={tab??openingTab(detail)} onTab={next=>onOpen({kind:'event',code,tab:next},{replace:true})}
      onRunner={row=>setSelected({raceId:row.raceId,entryId:row.entryId})} onTie={id=>openTie(id)}
      onStage={setSelectedStage} onRace={openRace} saved={saved}/>}
  </main><footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void refresh()}/></footer></>;
  // The older-look sheets sit outside the screen root, so they keep their look until their own tickets move them.
  return <><LeadBar title={detail?eventTitle(detail.event):code} code={detail?.event.code} up="Results" wide body={body}/>{sheets}</>;
}
const tabNames:Record<EventTab,string>={heats:'Heats',final:'Final',races:'Races',notes:'Notes'};
/** A heats event has a Final tab unless it was decided without a final. */
const hasFinalTab=(detail:EventResultsRead)=>detail.event.format==='heats' && !detail.results.decidedWithoutFinal;
/** The tab an event opens on: Final once its final has a finishing order, else Heats. */
const openingTab=(detail:EventResultsRead):EventTab=>hasFinalTab(detail) && !!detail.results.finalResults?.leaderboard.length?'final':'heats';
type TabProps={detail:EventResultsRead;onRunner:(row:LeaderboardRow)=>void;onTie:(id:string)=>void;onStage:(sheet:StageCheckSheet)=>void;onRace:(id:string)=>void;saved:(next:EventResultsRead)=>void};
/**
 * An event's tabs: Heats (the scoreboard), Final (a heats event not decided without one), Races and Notes. The tab is
 * part of the address; switching replaces it in place, so Back leaves the event.
 */
function EventTabs({tab,onTab,...props}:TabProps & {tab:EventTab;onTab:(tab:EventTab)=>void}) {
  const {detail}=props,final=hasFinalTab(detail);
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
/**
 * The medal decision's one place (Final tab, or Heats for a timed event or results without a final): the Day export
 * line once the medals are confirmed, then Confirm the medals, or its stage's Reopen once confirmed.
 */
const Medals=({input,sheet,onStage}:{input:InputRunning|null;sheet:StageCheckSheet|null;onStage:(sheet:StageCheckSheet)=>void})=><>
  {input && <p className="rz-export-line"><b>Day export</b> {dayExportLine(input)}</p>}
  {sheet && (sheet.completed?<StageButton sheet={sheet} onStage={onStage}/>
    :<button type="button" className="rz-btn rz-btn--primary rz-btn--block" onClick={()=>onStage(sheet)}>Confirm the medals</button>)}
</>;
/** The scoreboard of every heat's runners, then (until their screens move) the stage buttons under it. */
function HeatsTab({detail,final,onRunner,onTie,onStage}:TabProps & {final:boolean}) {
  const results=detail.results,ranked=results.leaderboard.filter(row=>row.position!==null).length;
  // A lead makes the final with "+ Final" on Races, so open heats offer no stage here: only Reopen heats once complete.
  // A timed event's medals wait for a ranked runner before Confirm the medals shows.
  const sheet=results.checkSheet?.stage==='final' || results.checkSheet?.stage==='heats' || !(results.checkSheet?.completed || ranked)?null:results.checkSheet;
  const reopenHeats=results.heatsCheckSheet?.completed?results.heatsCheckSheet:null;
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
    {!final && <Medals input={results.inputRunning} sheet={sheet} onStage={onStage}/>}
    {reopenHeats && <StageButton sheet={reopenHeats} onStage={onStage}/>}
    {results.noFinalCheckSheet && <StageButton sheet={results.noFinalCheckSheet} onStage={onStage}/>}
  </>;
}
/** A heats row's detail: its race and place, or why it does not rank. */
function rowDetail(row:LeaderboardRow) {
  const race=raceLabel(row.race);
  if(row.disqualification) return `${race} · Disqualified: ${row.disqualification.reason}${row.disqualification.comment?` - ${row.disqualification.comment}`:''}`;
  if(row.notCounted) return `${race} · Not counted`;
  return `${race} · ${row.place!==null?`${ordinal(row.place)} in race`:'Did not finish'}`;
}
/** The final (once made), then the Day export line and Confirm the medals (once the final has an order) or Reopen final. */
function FinalTab({detail,onRunner,onStage,saved}:TabProps) {
  const results=detail.results,final=results.finalResults;
  if(!final) return <p className="rz-empty">The final's order appears here once its finishing order is saved.</p>;
  return <>
    <Final event={detail.event} teams={detail.teams} final={final} onSaved={saved} onRunner={onRunner}/>
    <Medals input={results.inputRunning} sheet={results.checkSheet?.stage==='final' && (results.checkSheet.completed || final.leaderboard.length)?results.checkSheet:null} onStage={onStage}/>
  </>;
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
        <button type="button" className={`rz-event rz-event--${card.state==='not-started'?'idle':card.state}`} onClick={()=>onOpen({kind:'event',code:event.code})}>
          <span className="rz-event__name">{event.code} · {event.section}</span>
          <span className="rz-event__status">{card.state==='done' && <Icon name="check"/>}{card.line}{!event.enabled?' · Switched off':''}</span>
          {latestNoteAt && <span className="rz-event__status">Latest note {clock(latestNoteAt)}</span>}
        </button></li>)}</ul></section>)}</>}
  </main>
  <footer className="rz-footer"><UpdatedAt time={updated} onRefresh={onRefresh}/></footer></>;
}
