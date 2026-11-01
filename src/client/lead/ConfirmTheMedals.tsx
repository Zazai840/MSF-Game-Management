import { useEffect,useState } from 'react';
import { api,StaleRequest } from '../api.js';
import { eventTitle } from '../../shared/day.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName } from '../../shared/race-flow.js';
import { resultName,type LeaderboardRow } from '../../shared/results-rules.js';
import type { StageCheckSheet,StageItem,StagePlace } from '../../shared/stages.js';
import { formatTime } from '../../shared/time-entry.js';
import { toastLine } from '../../shared/toast-lines.js';
import { ErrorCallout,Icon,LeadBar,Star } from '../races/parts.js';
import { useToast } from '../races/Toast.js';
import type { View } from '../shell/addresses.js';
import { teamWristbands } from './ResultName.js';
import { Frame,RunnerSheet } from './RunnerSheet.js';
/** The check Confirm the medals decides: Event complete on a timed event, Final complete on a final, until confirmed. */
const medalsSheet=(detail:EventResultsRead|null)=>{
  const sheet=detail?.results.checkSheet;
  return sheet && !sheet.completed && (sheet.stage==='event' || sheet.stage==='final')?sheet:null;
};
/** "3 heats · no final": the event's live heats, and whether a final decides its medals. */
function medalsMeta(detail:EventResultsRead,sheet:StageCheckSheet) {
  const heats=detail.results.races.filter(({race})=>race.kind!=='final').length;
  return `${heats} ${heats===1?'heat':'heats'} · ${sheet.stage==='final'?'final':'no final'}`;
}
/**
 * Confirm the medals as its own screen (spec #250 "Confirm the medals and the tie"), at /results/<code>/confirm-the-medals:
 * Settle first, Worth a look and the medal places, each with Fix, then the docked Confirm the medals, grey while anything
 * must be settled first. Back is the only way out and goes where it was opened (Races, or the event's tab); a Confirm
 * goes back too, with the toast. Each screen it opens (the tie, a race page, a correction) comes back here, which reads
 * the event again so the places are up to date.
 */
export function ConfirmTheMedals({code,onOpen,onBack}:{code:string;onOpen:(view:View)=>void;onBack:()=>void}) {
  const toast=useToast();
  const [detail,setDetail]=useState<EventResultsRead|null>(null);
  const [error,setError]=useState<unknown>(null),[refused,setRefused]=useState<unknown>(null),[busy,setBusy]=useState(false);
  const [runner,setRunner]=useState<LeaderboardRow|null>(null);
  useEffect(()=>{
    api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/results`).then(setDetail,failure=>{if(!(failure instanceof StaleRequest)) setError(failure);});
  },[code]);
  const sheet=medalsSheet(detail),title=detail?eventTitle(detail.event):code;
  if(!detail || !sheet) return <LeadBar title={title} code={code} up={title} body={<main className="rz-main rz-main--form">
    {error!==null?<ErrorCallout error={error} action="read"/>:<p className="rz-empty">{!detail?'Opening…':detail.results.checkSheet?.completed?'These medals are confirmed.':'There are no medals to confirm yet.'}</p>}
  </main>}/>;
  const event=detail.event,settle=sheet.mustSettleFirst.length;
  async function confirm() {
    setBusy(true);setRefused(null);
    try {
      await api(`lead/events/${encodeURIComponent(event.code)}/complete-stage`,{stage:sheet!.stage});
      toast({message:toastLine({kind:'stage-complete',stage:sheet!.stage,event})});onBack();
    } catch(failure) {setRefused(failure);setBusy(false);}
  }
  return <><LeadBar title={title} code={event.code} up={title} body={
    <Frame meta={medalsMeta(detail,sheet)} question={<>Confirm the <em>medals</em></>} help="Check the places, then confirm. They go to the Day export."
      reason={settle?`Settle ${settle===1?'1 thing':`${settle} things`} first.`:null} busy={busy} label="Confirm the medals" refused={refused} onGo={()=>void confirm()}>
      <MedalsCheck detail={detail} sheet={sheet} onOpen={onOpen} onRunner={setRunner}/>
    </Frame>}/>
    {runner && <RunnerSheet key={`${runner.raceId}:${runner.entryId}`} event={event} row={runner} rows={detail.results.actionableRunners} onSaved={next=>{setRunner(null);setDetail(next);}}
      onClose={()=>setRunner(null)} onOpen={onOpen} onRace={()=>onOpen({kind:'race-page',code:event.code,raceId:runner.raceId})}/>}</>;
}
/**
 * The body of a medal decision's screen, for any stage's check sheet (Results without a final too): Settle first and
 * Worth a look as To check cards, each with one button naming its action and thing ("Settle tie" opens the tie screen,
 * "Open Heat 3" the race page, "Open 2041" the runner sheet over the screen through `onRunner`), then the medal places.
 */
export function MedalsCheck({detail,sheet,onOpen,onRunner}:{detail:EventResultsRead;sheet:StageCheckSheet;onOpen:(view:View)=>void;onRunner:(row:LeaderboardRow)=>void}) {
  const {event,results}=detail,code=event.code;
  function action(item:StageItem):[string,()=>void]|null {
    if(item.tieId) return ['Settle tie',()=>onOpen({kind:'tie',code,tieId:item.tieId!,...(sheet.stage==='no-final'?{stage:'no-final'} as const:{})})];
    const row=item.entryId && results.actionableRunners.find(row=>row.raceId===item.raceId && row.entryId===item.entryId);
    if(row) return [`Open ${resultName(row)}`,()=>onRunner(row)];
    const race=results.races.find(({race})=>race.id===item.raceId)?.race;
    return race?[`Open ${raceName(race)}`,()=>onOpen({kind:'race-page',code,raceId:race.id})]:null;
  }
  const cards=(label:string,items:StageItem[],primary:boolean)=>items.length>0 && <><h3 className="rz-section">{label}</h3>
    <ul className="rz-issues" aria-label={label}>{items.map(item=>{
      const open=action(item);
      return <li key={item.id} className="rz-issue"><p className="rz-issue__title">{item.message}</p>
        {open && <button type="button" className={`rz-btn rz-btn--small${primary?' rz-btn--primary':''}`} onClick={open[1]}>{open[0]}</button>}</li>;
    })}</ul></>;
  // A final's places are fixed in its finishing order; a timed event's (or results without a final) in their heat's times.
  const fix=(place:StagePlace)=>onOpen({kind:'correction',code,raceId:place.race!.id,action:sheet.stage==='final'?'correct-finishing-order':'correct-times'});
  return <>
    {cards('Settle first',sheet.mustSettleFirst,true)}
    {cards('Worth a look',sheet.worthALook,false)}
    <h3 className="rz-section">Medal places</h3>
    {sheet.creates.some(place=>place.race) && <p className="rz-empty">A place is wrong? Tap Fix beside it.</p>}
    <ol className="rz-lead-rows" aria-label="Medal places">{sheet.creates.map(place=>{
      const who=place.race?resultName(place):'-';
      return <li key={place.position} className="rz-lead-row">
        <span className="rz-lead-row__place"><span className="rz-lead-row__medal"><Star/><span>{place.position}</span></span></span>
        <span className="rz-lead-row__who"><span className="rz-lead-row__num">{who}</span>
          {place.race && <span className="rz-lead-row__note">{place.race.name}{place.time===null?'':` · ${formatTime(place.time)}`}</span>}
          {place.team && <span className="rz-team-legs">{teamWristbands(place.team)}</span>}</span>
        <span className="rz-lead-row__end">{place.tied && <span className="rz-tag rz-tag--tie">Tie</span>}
          {place.race && <button type="button" className="rz-btn rz-btn--small" aria-label={`Fix ${ordinal(place.position)}: ${who}`} onClick={()=>fix(place)}><Icon name="pencil"/>Fix</button>}</span>
      </li>;
    })}</ol>
  </>;
}
