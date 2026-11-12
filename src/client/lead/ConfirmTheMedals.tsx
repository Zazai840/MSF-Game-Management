import { useEffect,useState } from 'react';
import { api,StaleRequest } from '../api.js';
import { eventTitle } from '../../shared/day.js';
import type { EventResultsRead } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName } from '../../shared/race-flow.js';
import { reopenHeatsSheet,resultName,teamWristbands,type LeaderboardRow } from '../../shared/results-rules.js';
import type { Stage,StageCheckSheet,StageItem,StagePlace } from '../../shared/stages.js';
import { formatTime } from '../../shared/time-entry.js';
import { toastLine } from '../../shared/toast-lines.js';
import { Callout,ErrorCallout,Icon,Star } from '../races/parts.js';
import { LeadBar } from './LeadBar.js';
import { useToast } from '../races/Toast.js';
import type { StageScreen,View } from '../shell/addresses.js';
import { Comment } from './Comment.js';
import { Frame,RunnerSheet } from './RunnerSheet.js';
/** What each stage's Reopen names: "Reopen heats" at /results/<code>/reopen-heats. */
const reopened:Record<Stage,string>={event:'event',heats:'heats',final:'final','no-final':'results'};
export const reopenLabel=(stage:Stage)=>`Reopen ${reopened[stage]}`;
/** The screen a medal decision's button opens: Confirm the medals, Results without a final, or the stage's Reopen once complete. */
export function stageView(code:string,sheet:StageCheckSheet):View {
  if(sheet.completed) return {kind:'stage',code,screen:`reopen-${reopened[sheet.stage]}` as StageScreen};
  return sheet.stage==='no-final'?{kind:'stage',code,screen:'results-without-a-final'}:{kind:'confirm-the-medals',code};
}
/**
 * The check a screen decides. Confirm the medals: Event complete on a timed event, Final complete on a final, until
 * confirmed. Results without a final: its own check while offered. A Reopen: its stage once complete, and Reopen heats
 * only until the final starts (the server refuses after).
 */
function decidedSheet(detail:EventResultsRead|null,screen?:StageScreen) {
  const results=detail?.results;
  if(!results) return null;
  if(!screen) {
    const sheet=results.checkSheet;
    return sheet && !sheet.completed && (sheet.stage==='event' || sheet.stage==='final')?sheet:null;
  }
  const reopening=screen!=='results-without-a-final',stage=reopening?(Object.keys(reopened) as Stage[]).find(stage=>`reopen-${reopened[stage]}`===screen):'no-final';
  if(stage==='heats' && !reopenHeatsSheet(results)) return null;
  return [results.heatsCheckSheet,results.noFinalCheckSheet,results.checkSheet].find(sheet=>sheet?.stage===stage && sheet?.completed===reopening)??null;
}
/** Why a screen has nothing to decide, at an address typed or kept after the decision changed. */
function nothingLine(detail:EventResultsRead,screen?:StageScreen) {
  if(!screen || screen==='results-without-a-final') return detail.results.checkSheet?.completed?'These medals are confirmed.':'There are no medals to confirm yet.';
  return screen==='reopen-heats' && detail.results.finalResults?.started?detail.results.heatsCheckSheet!.reopenWarning!:'There is nothing to reopen.';
}
/** "3 heats · no final": the event's live heats, and whether a final decides its medals. */
function medalsMeta(detail:EventResultsRead,sheet:StageCheckSheet) {
  const heats=detail.results.races.filter(({race})=>race.kind!=='final').length;
  return `${heats} ${heats===1?'heat':'heats'} · ${sheet.stage==='final' || sheet.stage==='heats'?'final':'no final'}`;
}
/** What a Reopen warns of (Reopen heats' warning is the check's own, from #249). */
const reopenHelp:Record<Exclude<Stage,'heats'>,string>={final:'The medals are no longer confirmed, and the final opens for corrections.',
  event:"The medals are no longer confirmed, and the event's races open for corrections.",
  'no-final':'This clears the medals and opens the heats again. You can then run a final or choose Results without a final again.'};
/**
 * A medal decision as its own screen (spec #250 "Confirm the medals and the tie"; its bar names the action, spec #313): Confirm the medals at
 * /results/<code>/confirm-the-medals, and (`screen`) Results without a final and each Reopen at /results/<code>/<screen>.
 * Confirm the medals and Results without a final show Settle first, Worth a look and the medal places, each with Fix,
 * then the docked Confirm the medals, grey while anything must be settled first; Results without a final and a Reopen
 * need a comment. Back is the only way out and goes where it was opened (Races, or the event's tab); a save goes back
 * too, with the toast. Each screen it opens (the tie, a race page, a correction) comes back here, which reads the event
 * again so the places are up to date.
 */
export function ConfirmTheMedals({code,screen,onOpen,onBack}:{code:string;screen?:StageScreen;onOpen:(view:View)=>void;onBack:()=>void}) {
  const toast=useToast();
  const [detail,setDetail]=useState<EventResultsRead|null>(null);
  const [error,setError]=useState<unknown>(null),[refused,setRefused]=useState<unknown>(null),[busy,setBusy]=useState(false);
  const [runner,setRunner]=useState<LeaderboardRow|null>(null),[comment,setComment]=useState('');
  useEffect(()=>{
    api<EventResultsRead>(`lead/events/${encodeURIComponent(code)}/results`).then(setDetail,failure=>{if(!(failure instanceof StaleRequest)) setError(failure);});
  },[code]);
  // The bar names the action; the event is the back arrow's fallback and is named in the body's meta line.
  const sheet=decidedSheet(detail,screen),up=detail?eventTitle(detail.event):code;
  const title=!screen?'Confirm the medals':screen==='results-without-a-final'?'Results without a final':`Reopen ${screen.slice('reopen-'.length)}`; // a Reopen's address holds its label's words (stageView)
  if(!detail || !sheet) return <LeadBar title={title} code={code} up={up} body={<main className="rz-main rz-main--form">
    {error!==null?<ErrorCallout error={error} action="read"/>:<p className="rz-empty">{!detail?'Opening…':nothingLine(detail,screen)}</p>}
  </main>}/>;
  const event=detail.event,reopening=sheet.completed,settle=reopening?0:sheet.mustSettleFirst.length;
  async function save() {
    setBusy(true);setRefused(null);
    try {
      await api(`lead/events/${encodeURIComponent(event.code)}/${reopening?'reopen-stage':'complete-stage'}`,{stage:sheet!.stage,...(screen?{comment}:{})});
      toast({message:toastLine({kind:reopening?'reopened':'stage-complete',stage:sheet!.stage,event})});onBack();
    } catch(failure) {setRefused(failure);setBusy(false);}
  }
  const reason=settle?`Settle ${settle===1?'1 thing':`${settle} things`} first.`:screen && !comment.trim()?'Write a comment first.':null;
  const check=<MedalsCheck detail={detail} sheet={sheet} onOpen={onOpen} onRunner={setRunner}/>;
  const frame={event:up,meta:medalsMeta(detail,sheet),reason,busy,refused,onGo:()=>void save()};
  return <><LeadBar title={title} code={event.code} up={up} body={
    reopening?<Frame {...frame} question={<>Reopen the <em>{reopened[sheet.stage]}</em>?</>} help={sheet.stage==='heats'?sheet.reopenWarning!:reopenHelp[sheet.stage]} label={reopenLabel(sheet.stage)}>
      <Comment value={comment} onChange={setComment} required/>
    </Frame>
    :screen?<Frame {...frame} question={<>Results <em>without a final</em>?</>} help="No final will be run. Medals go to the 3 fastest heat times." label="Confirm the medals">
      {detail.results.finalResults && <Callout status message="The final's line-up will be discarded."/>}
      {check}
      <Comment value={comment} onChange={setComment} required/>
    </Frame>
    :<Frame {...frame} question={<>Confirm the <em>medals</em></>} help="Check the places, then confirm. They go to the Day export." label="Confirm the medals">{check}</Frame>}/>
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
