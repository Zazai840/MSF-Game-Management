import { useRef,useState,type ReactNode } from 'react';
import { api } from '../api.js';
import { digitsOnly } from '../flow/NumberBox.js';
import { Callout,DockedFooter,ErrorCallout,Sheet,Opening } from '../races/parts.js';
import { LeadHeader } from './LeadHeader.js';
import { PullToRefresh } from '../races/PullToRefresh.js';
import { Comment } from './Comment.js';
import { useToast } from '../races/Toast.js';
import type { RunnerScreen,View } from '../shell/addresses.js';
import { eventTitle,type DayEvent } from '../../shared/day.js';
import type { EventResultsRead,LeadRaceRead } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName } from '../../shared/race-flow.js';
import { resultNotes } from '../../shared/result-notes.js';
import { placeText,resultHolder,resultName,type LeaderboardRow,type ResultFlag } from '../../shared/results-rules.js';
import { disqualificationReasons,disqualifiedText } from '../../shared/rulings.js';
import { openRaceLabel } from '../../shared/races.js';
import { isOpenEligibilityWarning } from '../../shared/runner-rulings.js';
import { legRefusal,legWarnings } from '../../shared/teams.js';
import { formatTime } from '../../shared/time-entry.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';

type Event=Pick<DayEvent,'code'|'name'|'section'>;
type RunnerView=Extract<View,{kind:'runner'}>;
const openAddition=(flag:ResultFlag)=>flag.kind==='added-at-finish' && !flag.checked;
/** "Runner 2041", or "Team 3". */
const runnerTitle=(row:LeaderboardRow)=>row.team?`Team ${row.team.number}`:`Runner ${row.wristband}`;
/** "60m · Girl Cubs · Heat 1 · 6th in race · 11.85", then why it does not count. */
function runnerMeta(event:Event,row:LeaderboardRow) {
  const time=!row.recordingPending && row.time!==null && formatTime(row.time);
  return [eventTitle(event),raceName(row.race),placeText(row),time,row.notCounted && 'Not counted',row.disqualification && disqualifiedText(row.disqualification)].filter(Boolean).join(' · ');
}
/** A runner screen's line above its question, short enough for one line (the event is on the back arrow): "Heat 1 · 6th in race". */
const placeMeta=(row:LeaderboardRow)=>`${raceName(row.race)} · ${placeText(row)}`;
/** The results a lead can count for this child or team: each of their heat results not disqualified. */
const countable=(row:LeaderboardRow,rows:readonly LeaderboardRow[])=>rows.filter(other=>resultHolder(other)===resultHolder(row) && !other.disqualification && other.race.kind!=='final');
const runnerPath=(row:Pick<LeaderboardRow,'raceId'|'entryId'>,command:string)=>`lead/races/${row.raceId}/runners/${row.entryId}/${command}`;

/** The row's Notes as To check cards: its warnings and addition with who settled them, then its audit notes. */
function Notes({row}:{row:LeaderboardRow}) {
  const lines=resultNotes(row);
  if(!lines.length) return null;
  return <><h3 className="rz-section">Notes</h3><ul className="rz-issues" aria-label="Notes">{lines.map(line=><li key={line.id} className={line.open?'rz-issue':'rz-issue rz-issue--settled'}>
    <p className="rz-issue__title">{line.text}</p><p className="rz-issue__body">{line.at?<time dateTime={line.at}>{line.detail}</time>:line.detail}</p>
  </li>)}</ul></>;
}

/**
 * The runner sheet: a tap on a runner (or relay team) on the Heats leaderboard, the Final tab or a race page. Mark
 * checked and Mark addition checked save at once, with no note; Correct number, Choose which result counts,
 * Disqualify and Lift disqualification open their screens under the result's race. `onRace` opens its race page,
 * left out on that race's own page. The sheet brings its own screen root, as it renders beside the screen's.
 */
export function RunnerSheet({event,row,rows,onSaved,onClose,onOpen,onRace}:{event:Event;row:LeaderboardRow;rows:readonly LeaderboardRow[];
  onSaved:(next:EventResultsRead)=>void;onClose:()=>void;onOpen:(view:View)=>void;onRace?:()=>void}) {
  const toast=useToast(),who=resultName(row);
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
  const warning=row.flags.some(isOpenEligibilityWarning),addition=row.flags.some(openAddition);
  const screen=(screen:RunnerScreen)=>onOpen({kind:'runner',code:event.code,raceId:row.raceId,entryId:row.entryId,screen});
  async function check(command:string,saved:ToastSave) {
    if(busy) return;
    setBusy(true);setError(null);
    try {const next=await api<EventResultsRead>(runnerPath(row,command),{});toast({message:toastLine(saved)});onSaved(next);}
    catch(error) {setError(error);setBusy(false);}
  }
  const button=(label:string,onClick:()=>void,kind='')=><button type="button" className={`rz-btn rz-btn--block${kind}`} aria-disabled={busy || undefined} onClick={()=>{if(!busy) onClick();}}>{label}</button>;
  return <div className="rz-screen rz-zone-running"><Sheet title={runnerTitle(row)} onClose={onClose}>
    <p className="rz-sheet__text">{runnerMeta(event,row)}</p>
    <Notes row={row}/>
    {error!==null && <ErrorCallout error={error} action="save"/>}
    <div className="rz-sheet__actions">
      {warning && button('Mark checked',()=>void check('mark-warning-checked',{kind:'warning-checked',who}),' rz-btn--primary')}
      {addition && button('Mark addition checked',()=>void check('mark-added-checked',{kind:'addition-checked',who}),warning?'':' rz-btn--primary')}
      {button('Correct number',()=>screen('correct-number'))}
      {!row.disqualification && countable(row,rows).length>1 && button('Choose which result counts',()=>screen('choose-result'))}
      {onRace && button(openRaceLabel(row.race),onRace)}
      {row.disqualification?button('Lift disqualification',()=>screen('lift-disqualification')):button(`Disqualify ${who}`,()=>screen('disqualify'),' rz-btn--danger')}
    </div>
  </Sheet></div>;
}

const titles:Record<RunnerScreen,string>={disqualify:'Disqualify','lift-disqualification':'Lift disqualification','correct-number':'Correct number','choose-result':'Counted result'};
interface ScreenProps { event:Event; row:LeaderboardRow; rows:readonly LeaderboardRow[]; save:(path:string,body:object,saved:ToastSave)=>Promise<unknown>; busy:boolean }
/**
 * One of the runner sheet's screens, at its own address under the result's race: a prompt, the fields and a docked
 * button with the reason above it while it cannot be used. A save shows its toast and goes back where it was opened.
 */
export function RunnerScreens({view,detail,error,onRefresh,onBack,onChanged}:{view:RunnerView;detail:EventResultsRead|null;error:unknown;onRefresh:()=>void;onBack:()=>void;onChanged?:()=>void}) {
  const toast=useToast();
  const [busy,setBusy]=useState(false);
  const row=detail?.results.actionableRunners.find(row=>row.raceId===view.raceId && row.entryId===view.entryId);
  /** Sends one save; a refusal comes back to show, and the screen stays. */
  async function save(path:string,body:object,saved:ToastSave) {
    setBusy(true);
    try {await api(path,body);toast({message:toastLine(saved)});onChanged?.();onBack();return null;}
    catch(error) {setBusy(false);return error;}
  }
  const title=titles[view.screen],up=row?raceName(row.race):'Race';
  const pull=<PullToRefresh onRefresh={onRefresh}/>;
  if(!detail || !row) return <LeadHeader title={title} code={view.code} up={up} body={<>{pull}<main className="rz-main">
    {error!==null?<ErrorCallout error={error} action="read"/>:detail?<Callout status message="This result is no longer in Results."/>:<Opening/>}</main></>}/>;
  const props:ScreenProps={event:detail.event,row,rows:detail.results.actionableRunners,save,busy};
  const Body={disqualify:Disqualify,'lift-disqualification':Lift,'correct-number':CorrectNumber,'choose-result':ChooseResult}[view.screen];
  return <LeadHeader title={title} code={view.code} up={up} body={<>{pull}<Body {...props}/></>}/>;
}
/**
 * A full race-flow screen's frame (the runner screens, Re-run, Delete, Restore, the corrections): the prompt and fields,
 * then the docked button, greyed with `reason` above it until it can go. `footer` takes the button's place while a
 * number is being typed (a correction's Done). A screen whose bar already says the `question` leaves it out. `event` names the event before `meta`, cut short so the line stays one line.
 */
export function Frame({event,meta,question,help,children,reason,busy,label,danger=false,refused,onGo,footer}:{event?:string;meta:string;question?:ReactNode;help:string;children:ReactNode;reason:string|null;busy:boolean;label:string;danger?:boolean;refused:unknown;onGo:()=>void;footer?:ReactNode}) {
  return <><main className="rz-main rz-main--form">
    <div className="rz-prompt rz-prompt--compact">{event?<p className="rz-prompt__meta rz-prompt__meta--fit"><span>{event}</span><span>{'\u00a0· '}{meta}</span></p>:<p className="rz-prompt__meta">{meta}</p>}{question && <h2 className="rz-prompt__q">{question}</h2>}<p className="rz-prompt__help">{help}</p></div>
    {children}
    {refused!==null && <ErrorCallout error={refused} action="save"/>}
  </main>
  <DockedFooter>{footer??<>{reason && <p className="rz-footer__reason">{reason}</p>}
    <button type="button" className={`rz-btn rz-btn--block ${danger?'rz-btn--danger':'rz-btn--primary'}`} aria-disabled={reason || busy?true:undefined} onClick={()=>{if(!reason && !busy) onGo();}}>{label}</button></>}</DockedFooter></>;
}
function Disqualify({row,save,busy}:ScreenProps) {
  const who=resultName(row);
  const [reason,setReason]=useState(''),[comment,setComment]=useState(''),[refused,setRefused]=useState<unknown>(null);
  return <Frame meta={placeMeta(row)} question={<>Why is <em>{who}</em> disqualified?</>} help="Their result stops counting. It stays on the leaderboard, crossed out."
    reason={reason?null:'Choose a reason.'} busy={busy} label={`Disqualify ${who}`} danger refused={refused}
    onGo={async()=>setRefused(await save(runnerPath(row,'disqualify'),{reason,comment},{kind:'disqualified',who,reason}))}>
    <fieldset><legend className="rz-field__label">Reason</legend><div className="rz-choices">
      {disqualificationReasons.map(item=><button key={item} type="button" className="rz-choice" aria-pressed={item===reason} onClick={()=>setReason(item)}>{item}</button>)}</div></fieldset>
    <Comment value={comment} onChange={setComment}/>
  </Frame>;
}
function Lift({row,save,busy}:ScreenProps) {
  const who=resultName(row);
  const [comment,setComment]=useState(''),[refused,setRefused]=useState<unknown>(null);
  return <Frame meta={row.disqualification?disqualifiedText({reason:row.disqualification.reason}):''} question={<>Lift <em>{who}'s</em> disqualification?</>} help="Their result counts again."
    reason={comment.trim()?null:'Write a comment first.'} busy={busy} label="Lift disqualification" refused={refused}
    onGo={async()=>setRefused(await save(runnerPath(row,'lift-disqualification'),{comment},{kind:'counts-again',who}))}>
    <Comment value={comment} onChange={setComment} required/>
  </Frame>;
}
/**
 * Correct number: on a relay team, the lead first picks the child. The docked Save checks the number as check-in does
 * (a team's as the start line checks a leg's box): a refusal waits for Fix number, a warning for Fix number or Keep.
 */
function CorrectNumber({event,row,save,busy}:ScreenProps) {
  const team=row.team,input=useRef<HTMLInputElement>(null);
  const [leg,setLeg]=useState<number|null>(team?null:0),[number,setNumber]=useState('');
  const [held,setHeld]=useState<{refusal:string|null;warnings:string[]}|null>(null);
  const [checking,setChecking]=useState(false),[refused,setRefused]=useState<unknown>(null);
  const original=team?(leg===null?null:team.wristbands[leg]):row.wristband;
  async function warnings() {
    if(!team) return (await api<{warnings:Array<{kind:string;message:string}>}>('wristband-check',{eventCode:event.code,wristband:Number(number),raceId:row.raceId})).warnings
      .filter(warning=>row.race.kind!=='final' || warning.kind!=='already-ran').map(warning=>warning.message);
    const read=await api<LeadRaceRead>(`lead/races/${row.raceId}`),legs=team.wristbands.map((wristband,at)=>at===leg?Number(number):wristband);
    const refusal=legRefusal(read.teams||[],team.id,legs,leg!,row.raceId);
    if(refusal) throw refusal;
    return legWarnings(Number(number),{...read.race.event,teams:read.teams||[]},read.relays||[],team.id,row.raceId).map(warning=>warning.message);
  }
  async function send(keep:boolean) {
    setHeld(null);setRefused(await save(runnerPath(row,'correct-number'),{expectedWristband:original,wristband:Number(number),keepWarnings:keep,...(team?{leg}:{})},{kind:'number-saved',who:number}));
  }
  async function go() {
    setChecking(true);setRefused(null);input.current?.blur();
    try {const found=await warnings();if(found.length) setHeld({refusal:null,warnings:found});else await send(false);}
    catch(error) {if(typeof error==='string') setHeld({refusal:error,warnings:[]});else setRefused(error);}
    finally {setChecking(false);}
  }
  function fix() {setHeld(null);setNumber('');input.current?.focus();}
  const reason=leg===null?'Choose the child first.':!number?'Type the new number first.':held?'Fix the number or keep it.':null;
  return <Frame meta={placeMeta(row)} question={<>New number for <em>{original??resultName(row)}?</em></>} help="They keep their place and time."
    reason={reason} busy={checking || busy} label="Save number" refused={refused} onGo={()=>void go()}>
    {team && <fieldset><legend className="rz-field__label">Which child's number is wrong?</legend><div className="rz-choices">
      {team.wristbands.map((wristband,index)=>wristband!==null && <button key={index} type="button" className="rz-choice" aria-pressed={index===leg} onClick={()=>{setLeg(index);setHeld(null);}}>{ordinal(index+1)} leg · {wristband}</button>)}</div></fieldset>}
    {leg!==null && <div className={held?'rz-field rz-field--warn':'rz-field'}><label className="rz-field__label" htmlFor="runner-number">New wristband number</label>
      <input ref={input} className="rz-field__input" id="runner-number" type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" autoComplete="off" autoCorrect="off" spellCheck={false}
        value={number} placeholder={`Instead of ${original}`} readOnly={checking || busy} onChange={change=>{setNumber(digitsOnly(change.target.value));setHeld(null);}}
        onKeyDown={key=>{if(key.key==='Enter' && !key.nativeEvent.isComposing) {key.preventDefault();if(!reason && !checking && !busy) void go();}}}/></div>}
    {held && <Callout message={held.refusal??held.warnings.join(' ')} actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={fix}>Fix number</button>
      {!held.refusal && <button type="button" className="rz-btn" onClick={()=>void send(true)}>Keep</button>}</>}/>}
  </Frame>;
}
function ChooseResult({row,rows,save,busy}:ScreenProps) {
  const who=resultName(row),choices=countable(row,rows);
  const [counted,setCounted]=useState(`${row.raceId}:${row.entryId}`),[refused,setRefused]=useState<unknown>(null);
  const target=choices.find(other=>`${other.raceId}:${other.entryId}`===counted);
  return <Frame meta={`${who} has a result in ${choices.length} races`} question={<>Which result counts for <em>{who}?</em></>} help="The others stay on the leaderboard as not counted."
    reason={target?null:'Choose a result.'} busy={busy} label="Save counted result" refused={refused}
    onGo={async()=>setRefused(await save(runnerPath(target!,'count-result'),{},{kind:'result-counts',who}))}>
    <fieldset><legend className="rz-field__label">Results</legend><div className="rz-choices">
      {choices.map(other=><button key={`${other.raceId}:${other.entryId}`} type="button" className="rz-choice" aria-pressed={`${other.raceId}:${other.entryId}`===counted} onClick={()=>setCounted(`${other.raceId}:${other.entryId}`)}>
        {raceName(other.race)} · {other.recordingPending?'Not recorded yet':other.time===null?'Did not finish':formatTime(other.time)}{other.notCounted?' · Not counted':''}</button>)}</div></fieldset>
  </Frame>;
}
