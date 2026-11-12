import { Final } from './Final.js';
import { reopenLabel,stageView } from './ConfirmTheMedals.js';
import { dayExportLine,type InputRunning,type StageCheckSheet } from '../../shared/stages.js';
import { DeletedRaces,RaceRows } from './DeletedRaces.js';
import { Fragment,useEffect,useState } from 'react';
import type { DayLeadItem,ResultsGridRead,EventResultsRead,ResultsTarget } from '../../shared/lead-results.js';
import { RaceProblems } from './RaceProblems.js';
import { RacePage } from './RacePage.js';
import { RunnerScreens,RunnerSheet } from './RunnerSheet.js';
import { medalSheet,needsCheck,placeText,qualifyingLineAt,reopenHeatsSheet,resultLabel,resultName,ruleLine,teamWristbands,type LeaderboardRow } from '../../shared/results-rules.js';
import { disqualifiedText } from '../../shared/rulings.js';
import { formatTime } from '../../shared/time-entry.js';
import { ErrorCallout,Icon,Star,stepWords,Opening } from '../races/parts.js';
import { inResultsWords,raceNeed,stepLabels,stepsOf,type Step } from '../../shared/race-flow.js';
import { LeadBar,LeadTabs } from './LeadBar.js';
import { UpdatedAt } from '../races/UpdatedAt.js';
import { usePolledRead } from '../live.js';
import { addressOf,eventTabs,type EventTab,type View } from '../shell/addresses.js';
type RunnerView=Extract<View,{kind:'runner'}>;
import { ordinal } from '../../shared/ordinal.js';
import { openRaceLabel,raceLabel,runnersText } from '../../shared/races.js';
import { clock } from '../../shared/clock.js';
import { eventTitle } from '../../shared/day.js';
type ResultsProps={code?:string;raceId?:string;runner?:RunnerView;tab?:EventTab;target?:ResultsTarget;onOpen:(view:View,options?:{replace?:boolean})=>void;onBack:()=>void;onChanged?:()=>void};
/**
 * Results (no `code`): the Results list, Action required first, each card in its Races card's words; an event (`code`): its leaderboard,
 * rulings and audit notes; a race page (`code` and `raceId`). Each is its own screen with its own address, under the
 * lead header; `onOpen` moves to another screen (a tie is one) and `onBack` goes back. `target` is what Open in
 * Results asked to open on the event: the runner sheet. `runner` is one of the runner sheet's screens.
 */
export function Results({code,...props}:ResultsProps) {
  return code?<EventResults code={code} {...props}/>:<ResultsGrid onOpen={props.onOpen}/>;
}
/** Results: the list of the day's events, read every 5 s. */
function ResultsGrid({onOpen}:{onOpen:(view:View)=>void}) {
  const {read:list,updated,error,refresh}=usePolledRead<ResultsGridRead>('lead/results');
  return <LeadBar title="Results" wide body={<EventGrid list={list} error={error} updated={updated} onRefresh={()=>void refresh()} onOpen={onOpen}/>}/>;
}
/** An event's screens (its tabs, a race page, a runner screen), on the event's results read every 5 s. */
function EventResults({code,raceId,runner,tab,target,onOpen,onBack,onChanged}:ResultsProps & {code:string}) {
  const {read:detail,updated,error,refresh,offer}=usePolledRead<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/results`);
  const [selected,setSelected]=useState<{raceId:string;entryId:string}|null>(target?.raceId && target.entryId?{raceId:target.raceId,entryId:target.entryId}:null);
  // An event opened with no tab opens where the work is, and its address takes that tab; so does an address that is not the tab's own (the old Races tab's).
  useEffect(()=>{
    if(!detail || raceId || runner) return;
    const view={kind:'event',code,tab:tab??openingTab(detail)} as const;
    if(!tab || location.pathname!==addressOf(view)) onOpen(view,{replace:true});
  },[detail,tab]);
  const openRace=(id:string,step?:Step)=>onOpen(step?{kind:'race',id,step}:{kind:'race-page',code,raceId:id});
  const openTie=(tieId:string)=>onOpen({kind:'tie',code,tieId});
  const selectedRow=detail?.results.actionableRunners.find(row=>row.raceId===selected?.raceId && row.entryId===selected?.entryId);
  /** A save answered with the event's results: show them, close the runner sheet, and tell the app. */
  function showSaved(next:EventResultsRead) {offer(next);setSelected(null);onChanged?.();}
  const openStage=(sheet:StageCheckSheet)=>onOpen(stageView(code,sheet));
  if(runner) return <RunnerScreens view={runner} detail={detail} error={error} onBack={onBack} onChanged={onChanged}/>;
  if(raceId) return <RacePage key={raceId} raceId={raceId} code={code} actionableRunners={detail?.results.actionableRunners} onSaved={showSaved} onOpen={onOpen}/>;
  const sheets=detail && selectedRow && <RunnerSheet key={`${selectedRow.raceId}:${selectedRow.entryId}`} event={detail.event} row={selectedRow} rows={detail.results.actionableRunners} onSaved={showSaved} onClose={()=>setSelected(null)} onOpen={onOpen} onRace={()=>openRace(selectedRow.raceId)}/>;
  const body=<><main className="rz-main rz-main--event">
    {error!==null && <ErrorCallout error={error} action="read"/>}
    {!detail?error===null && <Opening/>:<EventTabs detail={detail} tab={tab??openingTab(detail)} onTab={next=>onOpen({kind:'event',code,tab:next},{replace:true})}
      onRunner={row=>setSelected({raceId:row.raceId,entryId:row.entryId})} onTie={id=>openTie(id)}
      onStage={openStage} onRace={openRace} onSaved={showSaved}/>}
  </main><footer className="rz-footer"><UpdatedAt time={updated} onRefresh={()=>void refresh()}/></footer></>;
  // The runner sheet wraps itself in its own screen root, beside this one.
  return <><LeadBar title={detail?eventTitle(detail.event):code} code={detail?.event.code} up="Results" body={body}/>{sheets}</>;
}
const tabNames:Record<EventTab,string>={heats:'Heats',final:'Final',notes:'Notes'};
/** A heats event has a Final tab unless it was decided without a final. */
const hasFinalTab=(detail:EventResultsRead)=>detail.event.format==='heats' && !detail.results.decidedWithoutFinal;
/** The tab an event opens on: Final once its final has a finishing order, else Heats. */
const openingTab=(detail:EventResultsRead):EventTab=>hasFinalTab(detail) && !!detail.results.finalResults?.leaderboard.length?'final':'heats';
type TabProps={detail:EventResultsRead;onRunner:(row:LeaderboardRow)=>void;onTie:(id:string)=>void;onStage:(sheet:StageCheckSheet)=>void;onRace:(id:string,step?:Step)=>void;onSaved:(next:EventResultsRead)=>void};
/**
 * An event's tabs: Heats (the scoreboard, its heats, deleted races), Final (a heats event not decided without one) and Notes. The tab is
 * part of the address; switching replaces it in place, so Back leaves the event. Below the tabs, on every tab, are the
 * event's open To check problems, each with one button: "Decide the tie", or "Open Heat 1" to that race's page.
 */
function EventTabs({tab,onTab,...props}:TabProps & {tab:EventTab;onTab:(tab:EventTab)=>void}) {
  const {detail}=props,final=hasFinalTab(detail);
  const tabs=eventTabs.filter(item=>item!=='final' || final),shown=tabs.includes(tab)?tab:'heats';
  // The read's items as the To check wording takes them: with their event and race, as the day's To check list has them.
  const problems:DayLeadItem[]=detail.results.needsYou.map(item=>({...item,event:detail.event,race:detail.results.races.find(({race})=>race.id===item.raceId)?.race}));
  return <>
    <nav className="rz-tabs" aria-label="Event">{tabs.map(item=><button key={item} type="button" aria-current={item===shown?'page':undefined} onClick={()=>onTab(item)}>{tabNames[item]}</button>)}</nav>
    {!detail.event.enabled && <p className="rz-note">Switched off</p>}
    <RaceProblems items={problems} fix={item=>item.kind==='tie'?{label:'Decide the tie',open:()=>props.onTie(item.tieId!)}:{label:item.race?openRaceLabel(item.race):'Open race',open:()=>props.onRace(item.raceId!)}}/>
    {shown==='heats' && <HeatsTab {...props} final={final}/>}
    {shown==='final' && <FinalTab {...props}/>}
    {shown==='notes' && (detail.auditNotes.length?<ol className="rz-notes" aria-label="Audit notes">{[...detail.auditNotes].reverse().map(note=><li key={note.id}><time dateTime={note.at}>{clock(note.at)}</time><span>{note.message}</span></li>)}</ol>
      :<p className="rz-empty">Notes appear here when a lead changes this event's results.</p>)}
  </>;
}
/** A medal decision button (Reopen heats, Results without a final): Reopen once its stage is complete, else the stage's own label. */
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
/** The scoreboard of every heat's runners, a row per heat under Heats, the medal decision (no Final tab), a closed More with Reopen heats and Results without a final (when either applies), then Deleted races (when there is one). */
function HeatsTab({detail,final,onRunner,onTie,onStage,onRace}:TabProps & {final:boolean}) {
  const results=detail.results,reopenHeats=reopenHeatsSheet(results),line=qualifyingLineAt(results),heats=results.races.filter(({race})=>race.kind!=='final');
  return <>
    {results.leaderboard.length===0?<p className="rz-empty">Runners appear here once a heat is saved.</p>:<section className="rz-scoreboard rz-scoreboard--tab" aria-label="Heats">
      <div className="rz-stripes" aria-hidden="true"><span/><span/><span/></div>
      <div className="rz-board-head"><p className="rz-board-note">{ruleLine(results.band)}</p></div>
      <ol className="rz-board" aria-label={results.provisional?'Provisional leaderboard':'Official leaderboard'}>{results.leaderboard.map(row=>{
        const star=row.qualification!==null || row.medalPlace!==null,check=needsCheck(row);
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
          {line!==null && row.position===line && <li className="rz-qline" aria-label="Qualifying line: places above go through to the final"><span aria-hidden="true">Qualifying line</span></li>}
        </Fragment>;})}</ol>
    </section>}
    {heats.length>0 && <h2 className="rz-section">Heats</h2>}
    <LiveRaces races={heats} detail={detail} onRace={onRace}/>
    {!final && <Medals input={results.inputRunning} sheet={medalSheet(results)} onStage={onStage}/>}
    {(reopenHeats || results.noFinalCheckSheet) && <details className="rz-disclosure"><summary>More</summary><div className="rz-disclosure__cards">
      {reopenHeats && <StageButton sheet={reopenHeats} onStage={onStage}/>}
      {results.noFinalCheckSheet && <StageButton sheet={results.noFinalCheckSheet} onStage={onStage}/>}</div></details>}
    <DeletedRaces eventCode={detail.event.code} onOpen={onRace}/>
  </>;
}
/** A heats row's detail: its race and place, or why it does not rank. */
function rowDetail(row:LeaderboardRow) {
  const race=raceLabel(row.race);
  if(row.disqualification) return `${race} · ${disqualifiedText(row.disqualification)}`;
  if(row.notCounted) return `${race} · Not counted`;
  return `${race} · ${placeText(row)}`;
}
/** The final's own row, the final (once made), then the Day export line and Confirm the medals (once the final has an order) or Reopen final. */
function FinalTab({detail,onRunner,onStage,onSaved,onRace}:TabProps) {
  const results=detail.results,final=results.finalResults,row=<LiveRaces races={results.races.filter(({race})=>race.kind==='final')} detail={detail} onRace={onRace}/>;
  if(!final) return <>{row}<p className="rz-empty">The final's order appears here once its finishing order is saved.</p></>;
  return <>
    {row}
    <Final event={detail.event} teams={detail.teams} final={final} onSaved={onSaved} onRunner={onRunner}/>
    <Medals input={results.inputRunning} sheet={medalSheet(results)} onStage={onStage}/>
  </>;
}
/**
 * A row per live race. In Results: its runners and when it was checked in, and why it does not count; the tap opens its
 * race page. Not in Results yet: a bar and the step strip's count for each step, then the Race screen band's sentence;
 * the tap opens the race at the step that sentence is about (`raceNeed`).
 */
function LiveRaces({races,detail,onRace}:{races:EventResultsRead['results']['races'];detail:EventResultsRead;onRace:(id:string,step?:Step)=>void}) {
  const summaryOf=(id:string)=>detail.summaries.find(race=>race.id===id),relay=detail.event.relay;
  return races.length>0 && <RaceRows onRace={id=>{const race=summaryOf(id);onRace(id,race && raceNeed(race).step||undefined);}} rows={races.map(({race,runners,saved,reasons})=>{
    const summary=saved?undefined:summaryOf(race.id);
    return {id:race.id,label:openRaceLabel(race),meta:[runnersText(runners),inResultsWords(saved),`checked in ${clock(race.checkedInAt)}`,...(summary?[]:reasons.filter(reason=>reason!=='in progress'))].join(' · '),
      more:summary && <><span className="rz-progress">{stepsOf(summary).map(step=>{
        const status=summary.steps[step]!,done=status.state==='done';
        // Runners has no count to reach: its bar fills when That's everyone is tapped.
        const full=status.expected?Math.min(1,status.count/status.expected):done && status.expected===null?1:0;
        return <Fragment key={step}><span className="rz-step__label">{stepLabels[step]}{done && <Icon name="check"/>}</span>
          <span className="rz-progress__bar" aria-hidden="true"><span style={{width:`${Math.round(full*100)}%`}}/></span>
          <span className="rz-step__status">{stepWords(step,status,relay)}</span></Fragment>;})}</span>
        <span className="rz-progress__needs">{raceNeed(summary).line}</span></>};
  })}/>;
}

type GridEvent=ResultsGridRead['groups'][number]['events'][number];
/**
 * The Results list: Action required (Races' rule, from the read), Running and Done, each in programme order and
 * left out when empty; then the events with no races under one closed line. A card is worded and coloured as its Races card.
 */
function EventGrid({list,error,updated,onRefresh,onOpen}:{list:ResultsGridRead|null;error:unknown;updated:string;onRefresh:()=>void;onOpen:(view:View)=>void}) {
  const events=list?.groups.flatMap(group=>group.events)??[],started=events.filter(item=>item.card.state!=='not-started'),idle=events.filter(item=>item.card.state==='not-started');
  const sections=[['Action required',started.filter(item=>item.card.actionRequired)],['Running',started.filter(item=>!item.card.actionRequired && item.card.state==='running')],['Done',started.filter(item=>!item.card.actionRequired && item.card.state==='done')]] as const;
  const cards=(items:readonly GridEvent[])=><ul className="rz-events">{items.map(({event,card,latestNoteAt})=><li key={event.id}>
    <button type="button" className={`rz-event rz-event--${card.state==='not-started'?'idle':card.state}`} onClick={()=>onOpen({kind:'event',code:event.code})}>
      <span className="rz-event__head"><span className="rz-event__name">{eventTitle(event)}</span><span className="rz-code-tag">{event.code}</span></span>
      <span className="rz-event__status">{card.state==='done' && <Icon name="check"/>}{card.line}{!event.enabled?' · Switched off':''}</span>
      {latestNoteAt && <span className="rz-event__status">Latest note {clock(latestNoteAt)}</span>}
    </button></li>)}</ul>;
  return <><main className="rz-main">
    {error!==null && <ErrorCallout error={error} action="read"/>}
    {!list?error===null && <Opening/>:<>
      {sections.map(([title,items],index)=>items.length>0 && <section key={title} aria-labelledby={`results-section-${index}`}><h2 className="rz-section" id={`results-section-${index}`}>{title}</h2>{cards(items)}</section>)}
      {idle.length>0 && <details className="rz-disclosure"><summary>Not started ({idle.length})</summary>{cards(idle)}</details>}</>}
  </main>
  <footer className="rz-footer"><UpdatedAt time={updated} onRefresh={onRefresh}/></footer><LeadTabs current="Results" onOpen={onOpen}/></>;
}
