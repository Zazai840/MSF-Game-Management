import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { callUpLabel,finalMark,seedLabel } from '../../shared/finals.js';
import { ordinal } from '../../shared/ordinal.js';
import { andList,doneButtons,emptyRaceLine,finishedWords,finishOf,onlyRunners,placedAsk,placesBoard,raceName,surplusTimes,timerQuestion,usualRunnersPerRace,usualSizeApplies,type RaceFlowRead,type Step } from '../../shared/race-flow.js';
import { entryName,isTeamEntry,runnersOf,runnersText,type RaceEntry } from '../../shared/races.js';
import { entryCount,entryNoun,entryWords } from '../../shared/teams.js';
import { digitsForTime,parseTimeDigits,formatTime,timeBoxHint } from '../../shared/time-entry.js';
import { plainWristbandWarning } from '../../shared/wristband-checks.js';
import { failureLine } from '../../shared/request-failure.js';
import { toastLine } from '../../shared/toast-lines.js';
import { api,phoneStorage } from '../api.js';
import { NumberBox } from '../flow/NumberBox.js';
import { SortableList } from '../flow/SortableList.js';
import { wrongTimesByPlace } from '../flow/WrongTime.js';
import { useTimeRefusal } from '../flow/useTimeRefusal.js';
import { useWristbandEntry } from './wristband-entry.js';
import { Callout,DockedFooter,Icon } from './parts.js';
import { useToast } from './Toast.js';
import { TeamAttendance,TeamPicker,TeamStartLine,type Mark } from './TeamSteps.js';
import { useStepWrites,type useFlowWrite } from './writes.js';
import { inTurn } from './in-turn.js';
import type { Outcome } from './latest-wins.js';

/** What every step body gets: the race, its writes, and Done for its step (That's everyone, Save the order, No more finishers). */
export interface StepProps { read:RaceFlowRead; flow:ReturnType<typeof useFlowWrite>; onDone:(step:Step)=>void; locked:boolean }
/**
 * One number typed on the phone's own number pad (wristbands, times). The input stays mounted and focused between
 * entries so the keyboard never closes; it closes while a warning waits for Fix or Keep, and opens again after with
 * what is in the box selected, so typing replaces it. Tapping the box while a warning waits calls `onRelease` (as Fix
 * does), keeping the typed digits to edit. Enter calls `onEnter`, as the footer's Next does.
 */
export function DigitsField({id,label,value,onChange,onEnter,onRelease,held=false,busy=false,warn=false,hint,selectKey,time=false}:{id:string;label:string;value:string;onChange:(digits:string)=>void;onEnter:()=>void;
  onRelease:()=>void;held?:boolean;busy?:boolean;warn?:boolean;hint?:ReactNode;selectKey?:string;time?:boolean}) {
  const input=useRef<HTMLInputElement>(null),wasHeld=useRef(held);
  useLayoutEffect(()=>{if(held) input.current?.blur();else if(wasHeld.current) {input.current?.focus();input.current?.select();}wasHeld.current=held;},[held]);
  // Not while a warning already waits as the box mounts (a race opened afresh with a wrong time): focusing would release it.
  useEffect(()=>{if(!wasHeld.current) input.current?.focus({preventScroll:true});},[]);
  useLayoutEffect(()=>{if(selectKey!==undefined && !held) {input.current?.focus({preventScroll:true});input.current?.select();}},[selectKey]);
  return <div className={warn?'rz-field rz-field--warn':'rz-field'}>
    <label className="rz-field__label" htmlFor={id}>{label}</label>
    <NumberBox ref={input} time={time} className="rz-field__input" id={id}
      value={value} readOnly={busy} aria-describedby={hint?`${id}-hint`:undefined} onChange={onChange}
      // The tap's own caret placement lands after the release, so select again once it has (unless held again by then:
      // WebKit's select() would focus the box and release it).
      onFocus={()=>{if(held) {onRelease();requestAnimationFrame(()=>{if(document.activeElement===input.current) input.current?.select();});}}}
      onKeyDown={event=>{if(event.key==='Enter' && !event.nativeEvent.isComposing) {event.preventDefault();onEnter();}}}/>
    {hint && <p className="rz-field__hint" id={`${id}-hint`}>{hint}</p>}
  </div>;
}
/**
 * A footer button that keeps the number pad open (the tap does not take focus from the input). Greyed out it is
 * aria-disabled, not disabled: a disabled button gets no mousedown to cancel, so a tap on it would close the keyboard.
 */
export const KeepFocus=({className,disabled=false,onClick,label,children}:{className:string;disabled?:boolean;onClick:()=>void;label?:string;children:ReactNode})=>
  <button type="button" className={className} aria-label={label} aria-disabled={disabled || undefined} onMouseDown={event=>event.preventDefault()} onClick={()=>{if(!disabled) onClick();}}>{children}</button>;
/**
 * Taps on marks that save one at a time (Here / Absent): a tap made while the last one is being saved waits its turn
 * (inTurn), so the marks never grey out between taps and no tap is lost. `save` gets the race to save from: the one
 * the screen holds (`read`) when the tap's turn comes, or the answer of this phone's save before it.
 */
export function useTapQueue<T>(read:RaceFlowRead,save:(tap:T,from:RaceFlowRead)=>Promise<Outcome<RaceFlowRead>>) {
  // The queue outlives renders, so it calls the latest save and reads the latest race.
  const latest=useRef({read,save});latest.current={read,save};
  const queue=useRef<ReturnType<typeof inTurn<T,RaceFlowRead>>|null>(null);
  queue.current??=inTurn<T,RaceFlowRead>((tap,from)=>latest.current.save(tap,from),()=>latest.current.read);
  return (tap:T)=>void queue.current!(tap);
}
/** The usual-heat-size warning shows once per race per person: has this phone shown it for this race? */
function useSizeWarning(raceId:string) {
  const [showing,setShowing]=useState(false);
  return {showing,show:()=>{if(phoneStorage.warnedSize(raceId)) return;phoneStorage.rememberWarnedSize(raceId);setShowing(true);},dismiss:()=>setShowing(false)};
}

type Entry={id?:string;wristband:number};
/**
 * Start line: wristbands checked in one at a time, each saved as it is typed, with the existing warnings as Fix
 * number / Keep. Tapping a typed number changes it: its number moves into the big box, checked like a new one when
 * saved (the entry, so any finish place, kept), or Remove takes the runner off (asking first if the finish line has
 * placed them). A half-typed next number waits meanwhile. "That's everyone" marks Runners done. On a Races-tab event
 * the 6th runner brings the usual-heat-size note, once. On a final it is the Here / Absent list of the seeded runners.
 */
export function StartLine({read,flow,onDone,locked}:StepProps) {
  const {race,group}=read,event=group.event,runners=runnersOf(race.parts.runners.value);
  const writes=useStepWrites<{runners:Entry[];keptWarnings:number[]}>(flow.write,'check-in','runners',race.id,race.parts.runners.version);
  const size=useSizeWarning(race.id),applies=usualSizeApplies(event) && race.kind!=='final';
  const entries:Entry[]=writes.pending?.runners||runners.map(({id,wristband})=>({id,wristband}));
  // The entry being changed, found again by id once saved (a number just typed has none until the server answers).
  const [changing,setChanging]=useState<Entry|null>(null),[asking,setAsking]=useState(false),[said,setSaid]=useState('');
  const target=changing && entries.find(item=>changing.id!==undefined?item.id===changing.id:item.wristband===changing.wristband)||null;
  const entry=useWristbandEntry(event,race.id,entries.map(item=>item.wristband),async(wristband,kept)=>{
    const sent=await writes.send({runners:[...entries,{wristband}],keptWarnings:kept?[wristband]:[]});
    if(typeof sent==='object' && applies && entries.length+1===usualRunnersPerRace) size.show();
    return sent;
  });
  const change=useWristbandEntry(event,race.id,entries.filter(item=>item!==target).map(item=>item.wristband),async(wristband,kept)=>{
    const sent=await writes.send({runners:entries.map(item=>item===target?{...item,wristband}:item),keptWarnings:kept?[wristband]:[]});
    if(typeof sent==='object') {setSaid(`${target!.wristband} changed to ${wristband}`);setChanging(null);}
    return sent;
  });
  if(race.kind==='final') return event.relay?<TeamAttendance {...{read,flow,onDone,locked}}/>:<Attendance {...{read,flow,onDone,locked}}/>;
  if(event.relay) return <TeamStartLine {...{read,flow,onDone,locked}}/>;
  const count=entries.length,more=applies && count>usualRunnersPerRace,on=target?change:entry;
  const cancel=()=>{change.fix();setAsking(false);setChanging(null);};
  const start=(item:Entry)=>{change.fix();change.type(String(item.wristband));setAsking(false);setSaid('');setChanging(item);};
  // An unchanged number just closes the change; any other is checked like a new number.
  const save=()=>{if(Number(change.current)===target!.wristband) cancel();else void change.next();};
  const place=target?.id?(race.parts.finish.value?.order||[]).indexOf(target.id):-1;
  function remove() {
    if(place>=0 && !asking) {setAsking(true);return;}
    void writes.send({runners:entries.filter(item=>item!==target),keptWarnings:[]});
    setSaid(`${target!.wristband} taken off this heat`);cancel();
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact">
        {locked?<><p className="rz-prompt__meta">{raceName(race)}</p><h2 className="rz-prompt__q">{runnersText(count)} checked in</h2></>
          :<><p className="rz-prompt__meta">{raceName(race)} · {count} {count===1?'runner':'runners'} so far{more?' · more than usual':''}</p>
          <h2 className="rz-prompt__q">{target?`Change wristband ${target.wristband}`:`Runner ${count+1}: wristband number?`}</h2></>}
      </div>
      {flow.error && <Callout message={flow.error}/>}
      {said && !target && <p className="rz-note" role="status">{said}</p>}
      {count>0 && <ul className="rz-chips" aria-label={locked?'Checked in':'Wristbands entered'}>{entries.map(item=>{
        const runner=runners.find(other=>other.id===item.id);
        const kept=!!runner?.warnings?.length,look=['rz-chip',kept?'rz-chip--warn':'',item===target?'rz-chip--changing':''].filter(Boolean).join(' ');
        // A locked race lists its runners, with nothing to change.
        if(locked) return <li key={item.id||item.wristband}><span className={look}>{item.wristband}</span></li>;
        return <li key={item.id||item.wristband}><button type="button" className={look} aria-pressed={item===target} aria-label={`${item.wristband}, ${kept?'kept for a lead to check. ':''}Change`}
          onMouseDown={event=>event.preventDefault()} onClick={()=>item===target?cancel():start(item)}>{item.wristband} <Icon name="pencil"/></button></li>;
      })}</ul>}
      {size.showing && !target && <Callout status message={`That's ${usualRunnersPerRace} runners, the usual number for a heat. Tap ${doneButtons.runners}, or add more if this heat really has more.`}
        actions={<><button type="button" className="rz-btn" onClick={size.dismiss}>Add another runner</button><button type="button" className="rz-btn rz-btn--primary" onClick={()=>{size.dismiss();onDone('runners');}}>{doneButtons.runners}</button></>}/>}
      {!locked && <DigitsField id="wristband" label={target?`New number for ${target.wristband}`:'Wristband number'} value={on.current} held={on.held} onRelease={on.fix} busy={on.checking || writes.sending} warn={on.held}
        onChange={digits=>{if(target) change.type(digits);else {entry.type(digits);size.dismiss();setSaid('');}}} onEnter={target?save:()=>void entry.next()} selectKey={target?String(target.id??target.wristband):undefined}
        hint={target?'Type the right number and tap Save, or Remove to take this runner off.':count>0?'Tap a number above to change it.':undefined}/>}
      {/* Remove sits under the box, small and away from the thumb: Save is the footer's wide button. */}
      {target && !locked && !asking && <button type="button" className="rz-btn rz-btn--pill rz-btn--remove rz-remove" onClick={remove}>Remove {target.wristband}</button>}
      {on.error && <Callout message={on.error}/>}
      {on.held && <Callout message={on.refused||on.pending.map(warning=>plainWristbandWarning(warning,Number(on.current),event.section)).join(' ')}
        actions={<>{!on.refused && <button type="button" className="rz-btn" onClick={()=>void on.keep()}>Keep</button>}<button type="button" className="rz-btn rz-btn--primary" onClick={on.fix}>Fix number</button></>}/>}
      {target && asking && <Callout message={placedAsk(target.wristband,place,'Remove')}
        actions={<><button type="button" className="rz-btn" onClick={()=>setAsking(false)}>Keep</button><button type="button" className="rz-btn rz-btn--primary" onClick={remove}>Remove</button></>}/>}
    </main>
    {!locked && <DockedFooter>{target?<div className="rz-footer__trio rz-footer__trio--two">
      <button type="button" className="rz-btn" onClick={cancel}>Cancel</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!change.current || change.held || change.checking} onClick={save}>{change.checking?'Checking…':'Save'}</KeepFocus>
    </div>:<div className="rz-footer__pair">
      <button type="button" className="rz-btn" disabled={!count || writes.sending} onClick={()=>onDone('runners')}>{doneButtons.runners}</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!entry.current || entry.held || entry.checking} onClick={()=>void entry.next()}>{entry.checking?'Checking…':'Next'}</KeepFocus>
    </div>}</DockedFooter>}
  </>;
}
/**
 * A final's check-in, while an Absent finalist's seed is free and a ranked heat entry is left: "Call up next fastest:
 * 2011 (7th)", for the Start line and the lead. It is the lead's call-up ruling from the Final tab, saved at once, and
 * the entry called up is Here with no second tap.
 */
export function CallUp({read,flow}:Pick<StepProps,'read'|'flow'>) {
  const {race,group,callUp}=read,toast=useToast(),[busy,setBusy]=useState(false);
  if(!callUp) return null;
  async function send(next:NonNullable<RaceFlowRead['callUp']>) {
    setBusy(true);flow.setError('');
    try {
      await api(`lead/events/${encodeURIComponent(group.event.code)}/call-up`,{expectedHeatEntryId:next.entryId});
      toast({message:toastLine({kind:'called-up',who:next.who})});
      flow.offer(await api<RaceFlowRead>(`races/${race.id}`));
    } catch(failure) {flow.setError(failureLine(failure,'save'));}
    finally {setBusy(false);}
  }
  return <button type="button" className="rz-btn rz-btn--block" disabled={busy || flow.busy} onClick={()=>void send(callUp)}>{busy?'Saving…':callUpLabel(callUp.who,callUp.position)}</button>;
}
/**
 * A final's start line: every finalist unmarked at first, each row with Here and Absent; tapping a lit mark again
 * unmarks it. Only those Here run it. That's everyone with someone unmarked asks before recording them Absent.
 */
function Attendance({read,flow,onDone,locked}:StepProps) {
  const {race}=read,final=race.final!;
  const marksIn=(from:RaceFlowRead):Mark[]=>from.race.final!.entries.map(entry=>finalMark(entry,from.race.parts.runners.value||[]));
  const [asking,setAsking]=useState(false),ask=useRef<HTMLDivElement>(null);
  // The question appears under the list, so it is brought into view clear of the footer.
  useEffect(()=>{if(asking) ask.current?.scrollIntoView({block:'center'});},[asking]);
  /** Saves the marks of `from` with one change made, at its version: a tap that waited its turn changes the race as the save before it left it. */
  const send=(from:RaceFlowRead,change:(marks:Mark[])=>Mark[])=>{
    const changed=change(marksIn(from)),ids=(mark:Mark)=>from.race.final!.entries.filter((_,index)=>changed[index]===mark).map(entry=>entry.finalEntryId);
    return flow.write('absent',{raceId:race.id,version:from.race.parts.runners.version,here:ids('here'),absent:ids('absent')});
  };
  const marks=marksIn(read),here=marks.filter(mark=>mark==='here').length;
  const unmarked=final.entries.filter((_,index)=>marks[index]===null);
  const tapQueue=useTapQueue(read,({index,mark}:{index:number;mark:Mark},from)=>send(from,old=>old.map((was,at)=>at===index?(was===mark?null:mark):was)));
  const tap=(index:number,mark:Mark)=>{setAsking(false);tapQueue({index,mark});};
  async function recordAbsent() {
    setAsking(false);
    if(typeof await send(read,old=>old.map(mark=>mark??'absent'))==='object') onDone('runners');
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">Final · {here} of {final.entries.length} here{unmarked.length?` · ${unmarked.length} not marked`:''}</p><h2 className="rz-prompt__q">Who is here?</h2></div>
      {flow.error && <Callout message={flow.error}/>}
      <ul className="rz-attendance" aria-label="Who is here">{final.entries.map((entry,index)=><li key={entry.finalEntryId} className={marks[index]==='absent'?'is-absent':undefined}>
        <span className="rz-attendance__who"><span className="rz-attendance__seed">{seedLabel(entry)}</span><span className="label">{entry.wristband}</span></span>
        {(['here','absent'] as const).map(mark=><button key={mark} type="button" className={marks[index]===mark?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} disabled={locked}
          aria-pressed={marks[index]===mark} aria-label={`${entry.wristband}: ${mark==='here'?'Here':'Absent'}`} onClick={()=>tap(index,mark)}>{mark==='here'?'Here':'Absent'}</button>)}
      </li>)}</ul>
      {!locked && <CallUp read={read} flow={flow}/>}
      {asking && unmarked.length>0 && <div ref={ask}><Callout message={`${andList(unmarked.map(entry=>String(entry.wristband)))} ${unmarked.length===1?'is':'are'} not marked. Record them absent?`}
        actions={<><button type="button" className="rz-btn" onClick={()=>setAsking(false)}>Go back</button><button type="button" className="rz-btn rz-btn--primary" disabled={flow.busy} onClick={()=>void recordAbsent()}>Record them absent</button></>}/></div>}
    </main>
    {!locked && <DockedFooter><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!here || flow.busy} onClick={()=>unmarked.length?setAsking(true):onDone('runners')}>{doneButtons.runners}</button></DockedFooter>}
  </>;
}

type Unplaced='dnf'|'dnr';
/**
 * An entry as the finish line shows it: a child's wristband, or a team's 4th leg's wristband, the child seen to cross
 * (with no 4th leg, its last leg that has a wristband, so two short teams are told apart; "–" with no wristband at
 * all); nothing for one no longer in the race. No team label: the team number is the lane, and after
 * the line nobody knows the lane.
 */
const lineName=(entry:RaceEntry|undefined)=>!entry?'':isTeamEntry(entry)?String([...entry.legs].reverse().find(leg=>leg.wristband!==null)?.wristband??'–'):entryName(entry);
/** That name in a sentence or as a screen reader says it: "no wristband" for "–". */
const saidName=(entry:RaceEntry|undefined)=>lineName(entry)==='–'?'no wristband':lineName(entry);
/**
 * Finish line: the PlacesBoard (one slot per runner, the current place gold) over a button per runner not yet
 * placed, in check-in order. Tapping one gives it the lowest empty place; tapping a placed slot empties it, saved at
 * once, and its runner is a button again. Any number of places can be empty; an empty place keeps its time. When the
 * last runner is placed, or on "Nobody else crossed the line", Check the order: drag to move, arrow keys too, No place
 * takes a runner out, and each runner left is Did not finish or Didn't run. "Nobody else crossed the line" and No place
 * close the gaps: the places below move up and each removed place loses its time (the server works out which from
 * the order it has). Save the order marks Finishing order done.
 */
export function FinishLine({read,flow,onDone,locked}:StepProps) {
  const {race,group}=read,event=group.event,relay=event.relay,words=entryWords(relay);
  const writes=useStepWrites<{order:string[];didNotFinish:string[];didNotRun:string[];added:number[];keptWarnings:number[];addedTeams:string[];empty:number[]}>(flow.write,'order','finish',race.id,race.parts.finish.version);
  const runners=race.parts.runners.value||[],byId=new Map(runners.map(runner=>[runner.id,runner]));
  const stored=race.parts.finish.value,shown=writes.pending||stored||{order:[],didNotFinish:[]};
  const finish=onlyRunners(shown,runners),{order,didNotFinish}=finish,board=placesBoard(finish),gaps=finish.empty||[];
  const unplaced=runners.filter(runner=>!order.includes(runner.id) && !didNotFinish.includes(runner.id));
  // Everyone already placed (coming back to the step, or a lead opening the tab): straight to Check the order, never a flash of the next place.
  const [mode,setMode]=useState<'place'|'check'|'add'>(()=>runners.length && !unplaced.length && order.length && !gaps.length?'check':'place');
  const [leftAs,setLeftAs]=useState<Record<string,Unplaced>>({}),[asked,setAsked]=useState(false),[picking,setPicking]=useState(false);
  const size=useSizeWarning(`${race.id}:finish`),applies=usualSizeApplies(event) || race.kind==='final';
  // The next place asked for is the lowest empty one.
  const current=gaps.length?gaps[0]:board.length;
  const send=(next:{order:string[];didNotFinish?:string[];didNotRun?:string[];empty?:number[]},added:number[]=[],kept:number[]=[],addedTeams:string[]=[])=>
    writes.send({order:next.order,didNotFinish:next.didNotFinish??didNotFinish,didNotRun:next.didNotRun??[],added,keptWarnings:kept,addedTeams,empty:next.empty??[]});
  const sendBoard=(next:ReadonlyArray<string|null>)=>send(finishOf(next,didNotFinish));
  // A relay final's teams are its seeds, call-ups and a lead's additions, so it has no "+ Team not on the list".
  const canAdd=!relay || race.kind!=='final';
  const openAdd=()=>{if(relay) setPicking(true);else setMode('add');};
  const picker=picking && <TeamPicker read={read} onClose={()=>setPicking(false)} onAdd={teamId=>{setPicking(false);void send(finish,[],[],[teamId]);}}/>;
  // The last runner placed: on to Check the order at once (its save goes on behind), before the screen paints, so the
  // placing screen never asks for a place past the last runner.
  // An empty place (another phone's, on Check the order) is shown on the placing screen, where it is filled or closed.
  useLayoutEffect(()=>{
    if(mode==='place' && runners.length && !unplaced.length && order.length && !gaps.length) setMode('check');
    if(mode==='check' && gaps.length) setMode('place');
  },[unplaced.length,order.length,gaps.length]);
  const entry=useWristbandEntry(event,race.id,runnersOf(runners).map(runner=>runner.wristband),async(wristband,kept)=>{
    const sent=await send(finish,[wristband],kept?[wristband]:[]);
    if(typeof sent==='object') {setMode('place');if(applies && runners.length+1>usualRunnersPerRace) size.show();}
    return sent;
  });
  const place=(runner:RaceEntry)=>void sendBoard(Object.assign([...board],{[current]:runner.id}));
  // Nobody else crossed the line: the empty places close, and lose their times.
  function noneElse() {
    if(gaps.length) void send({order});
    setMode('check');
  }
  const slots=Math.max(runners.length,board.length);
  const sizeNote=size.showing && <Callout status message={race.kind==='final'?`Finals usually have ${usualRunnersPerRace} runners. Add another only if a lead has agreed.`:`That's more than ${usualRunnersPerRace} runners, the usual number for a heat. Carry on if this heat really has more.`}
    actions={<button type="button" className="rz-btn" onClick={size.dismiss}>Carry on</button>}/>;
  if(mode==='add') return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · {runnersText(runners.length)}</p><h2 className="rz-prompt__q">Runner not on the list: wristband number?</h2></div>
      {entry.error && <Callout message={entry.error}/>}
      <DigitsField id="added" label="Wristband number" value={entry.current} held={entry.held} onRelease={entry.fix} busy={entry.checking || writes.sending} warn={entry.held} onChange={entry.type} onEnter={()=>void entry.next()}/>
      {entry.held && <Callout message={entry.refused||entry.pending.map(warning=>plainWristbandWarning(warning,Number(entry.current),event.section)).join(' ')}
        actions={<>{!entry.refused && <button type="button" className="rz-btn" onClick={()=>void entry.keep()}>Keep</button>}<button type="button" className="rz-btn rz-btn--primary" onClick={entry.fix}>Fix number</button></>}/>}
    </main>
    <DockedFooter><div className="rz-footer__pair">
      <button type="button" className="rz-btn" onClick={()=>{entry.fix();entry.type('');setMode('place');}}>Cancel</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!entry.current || entry.held || entry.checking} onClick={()=>void entry.next()}>Add runner</KeepFocus>
    </div></DockedFooter>
  </>;
  if(mode==='check') {
    const left=runners.filter(runner=>!order.includes(runner.id));
    // A runner already saved as Did not finish keeps that answer; anyone else left is asked, with nothing chosen for them.
    const as=(runner:RaceEntry):Unplaced|undefined=>leftAs[runner.id]??(didNotFinish.includes(runner.id)?'dnf':undefined);
    const unanswered=left.filter(runner=>!as(runner));
    async function save() {
      if(unanswered.length) {
        flushSync(()=>setAsked(true)); // the callout first, so the row scrolled to stays clear of the footer
        document.getElementById(`left-${unanswered[0].id}`)?.scrollIntoView({block:'center'});
        return;
      }
      const result=await send({order,didNotFinish:left.filter(runner=>as(runner)==='dnf').map(runner=>runner.id),didNotRun:left.filter(runner=>as(runner)==='dnr').map(runner=>runner.id)});
      if(typeof result==='object') onDone('positions');
    }
    const choice=(runner:RaceEntry,value:Unplaced,label:string)=><button type="button" className={as(runner)===value?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'}
      disabled={locked} aria-pressed={as(runner)===value} onClick={()=>setLeftAs({...leftAs,[runner.id]:value})}>{label}</button>;
    return <>
      <main className="rz-main">
        {/* The line above spans the screen, so it stays on one line at 360px; Back sits beside the question. */}
        <div className="rz-prompt rz-prompt--compact"><p className="rz-prompt__meta">{raceName(race)} · drag a handle to move a {entryNoun(relay)}</p>
          <div className="rz-heading-row"><h2 className="rz-prompt__q">Check the order</h2>
            {!locked && <button type="button" className="rz-btn rz-btn--small" onClick={()=>setMode('place')}>Back</button>}</div></div>
        {flow.error && <Callout message={flow.error}/>}
        {sizeNote}
        {order.length>0 && <SortableList label="Finishing order" items={order} itemKey={id=>id} itemName={id=>saidName(byId.get(id))} disabled={locked}
          look={{list:'rz-orderrows',row:'rz-orderrow rz-orderrow--action',handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:name=>`Move ${name}`}}
          onReorder={next=>void send({order:next})}
          renderItem={(id,place)=><><span className="rz-orderrow__place">{ordinal(place)}</span><span className="rz-orderrow__num">{lineName(byId.get(id))}</span>
            {!locked && <button type="button" className="rz-btn rz-btn--small" disabled={writes.sending} aria-label={`No place for ${saidName(byId.get(id))}`}
              onClick={()=>void send({order:order.filter(other=>other!==id)})}>No place</button>}</>}/>}
        <div className="rz-heading-row"><h3 className="rz-section">{left.length?`${left.length} not placed`:'Not placed'}</h3>{!locked && canAdd && <button type="button" className="rz-btn rz-btn--small" onClick={openAdd}>{words.add}</button>}</div>
        {asked && unanswered.length>0 && <Callout message={`Say what happened to ${entryCount(unanswered.length,relay)} first.`}/>}
        {left.length?<ul className="rz-orderrows" aria-label="Not placed">{left.map(runner=><li key={runner.id} id={`left-${runner.id}`}>
          <div role="group" aria-label={saidName(runner)} className={relay?'rz-orderrow rz-orderrow--unplaced rz-orderrow--team':'rz-orderrow rz-orderrow--unplaced'}>
            <span className="rz-orderrow__num">{lineName(runner)}</span>{choice(runner,'dnf','Did not finish')}{choice(runner,'dnr',"Didn't run")}
          </div></li>)}</ul>:<p className="rz-empty">{words.hasPlace}</p>}
        {picker}
      </main>
      {!locked && <DockedFooter>
        <button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={writes.sending || (!order.length && !left.length)} onClick={()=>void save()}>{doneButtons.positions}</button>
      </DockedFooter>}
    </>;
  }
  return <>
    <main className="rz-main">
      <ol className="rz-places" aria-label={`Places: ${order.length} of ${slots} recorded`}>{Array.from({length:slots},(_,index)=>{
        const runner=byId.get(board[index]??'');
        if(index===current && unplaced.length) return <li key={index}><span className="rz-placeslot rz-placeslot--current" aria-current="step" aria-label={`${ordinal(index+1)} place: choosing now`}><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">?</span></span></li>;
        if(runner) return <li key={index}><button type="button" className="rz-placeslot rz-placeslot--placed" disabled={locked} aria-label={`${ordinal(index+1)} place: ${saidName(runner)}. Change`} onClick={()=>void sendBoard(board.map((id,at)=>at===index?null:id))}>
          <span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">{lineName(runner)}</span></button></li>;
        return <li key={index}><span className="rz-placeslot rz-placeslot--empty" aria-label={`${ordinal(index+1)} place: empty`}><span className="rz-placeslot__ord">{ordinal(index+1)}</span><span className="rz-placeslot__num">–</span></span></li>;
      })}</ol>
      <div className="rz-heading-row"><div className="rz-prompt rz-prompt--compact">
        <p className="rz-prompt__meta">{raceName(race)} · {entryCount(runners.length,relay)} · {unplaced.length} to place</p>
        <h2 className="rz-prompt__q">{!runners.length?emptyRaceLine(race):!unplaced.length?words.allPlaced:<>{words.who} came <em>{ordinal(current+1)}?</em></>}</h2>
      </div></div>
      {flow.error && <Callout message={flow.error}/>}
      {sizeNote}
      {!runners.length && <p className="rz-empty">{words.appear}</p>}
      {/* A relay's team tiles, two to a row: each its 4th leg's wristband. */}
      {!locked && unplaced.length>0 && relay && <ul className="rz-runners rz-runners--teams" aria-label="Teams not yet placed">{unplaced.map(runner=><li key={runner.id}>
        <button type="button" className="rz-runner rz-runner--team" aria-label={`${saidName(runner)} came ${ordinal(current+1)}`} onClick={()=>place(runner)}>{lineName(runner)}</button>
      </li>)}</ul>}
      {/* A heat of more than 9 gets smaller buttons, so all 12 of a full heat fit above the footer. */}
      {!locked && unplaced.length>0 && !relay && <ul className={runners.length>9?'rz-runners rz-runners--compact':'rz-runners'} aria-label="Runners not yet placed">{unplaced.map(runner=><li key={runner.id}>
        <button type="button" className="rz-runner" aria-label={`${entryName(runner)} came ${ordinal(current+1)}`} onClick={()=>place(runner)}>{entryName(runner)}</button>
      </li>)}</ul>}
      {picker}
    </main>
    {!locked && <DockedFooter>
      <button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={gaps.length>0 && writes.sending} onClick={noneElse}>{words.noneElse}</button>
      {canAdd && <button type="button" className="rz-btn rz-btn--block" onClick={openAdd}>{words.add}</button>}
    </DockedFooter>}
  </>;
}

/**
 * Timer: one slot per place (each finisher once the order is saved, before that each runner), the current one gold; tap any
 * to retype it. The time box fills from the right as the timer's digits are typed. A time faster than an earlier place, or slow for the race, waits for Fix time or
 * Keep, its warning just above the time box and its reason in the footer. A time no one can run is refused in the amber
 * callout under the box, its digits selected so the next digit replaces them. The last place's time, or No more
 * finishers, marks Times done. Times never wait for the finish line. More times than the race can have (its finishers
 * once the order is saved, before that its runners) get a callout that says so, with a button that deletes the last time.
 */
export function Timer({read,flow,onDone,locked}:StepProps) {
  const {race}=read,status=read.steps.times!,order=read.steps.positions!,words=entryWords(read.group.event.relay);
  const writes=useStepWrites<{places:number[];keptWrong:number[]}>(flow.write,'times','times',race.id,race.parts.times.version);
  const [typed,setTypedDigits]=useState(''),[retype,setRetype]=useState<number|null>(null);
  const refusal=useTimeRefusal();
  const setTyped=(digits:string)=>{setTypedDigits(digits);refusal.clear();};
  const stored=race.parts.times.value,places=writes.pending?.places||(stored?.places||[]).filter((time):time is number=>time!==null);
  const keptWrong=writes.pending?.keptWrong||stored?.keptWrong||[],wrong=wrongTimesByPlace(places,read.group.event.name);
  const unkept=[...wrong.values()].find(item=>!keptWrong.includes(item.index));
  const slots=Math.max(status.expected||0,places.length);
  const held=retype===null && !!unkept,target=held?unkept!.index:retype??places.length,full=target>=slots;
  const digits=held?digitsForTime(places[target]):typed;
  const fix=()=>{setRetype(unkept!.index);setTyped(digits);};
  const surplus=!locked && !held && retype===null?surplusTimes(read,places.length):null;
  async function next() {
    const time=parseTimeDigits(typed);
    if(time===null || full) return;
    if(refusal.check(typed,read.group.event.name)) return;
    const updated=[...places];updated[target]=time;
    const stillWrong=wrongTimesByPlace(updated,read.group.event.name);
    setTyped('');setRetype(null);
    const sent=await writes.send({places:updated,keptWrong:keptWrong.filter(index=>index!==target && stillWrong.has(index))});
    // The last place's time marks Times done, unless it is one the timer must look at again.
    if(typeof sent==='object' && updated.length>=slots && !stillWrong.size && retype===null) onDone('times');
  }
  return <>
    <main className="rz-main">
      <div className="rz-prompt rz-prompt--compact">
        <p className="rz-prompt__meta">{raceName(race)} · {words.timerMeta??(order.state==='done'?finishedWords(order):runnersText(race.parts.runners.value?.length||0))}</p>
        <h2 className="rz-prompt__q">{timerQuestion(target,full,surplus)}</h2>
      </div>
      {flow.error && <Callout message={flow.error}/>}
      {/* A heat of more than 9 gets the compact grid, 4 across, so a warning and the time box (without its hint, which the warning
        replaces) stay above the footer, even at 360px. */}
      {slots>0?<ol className={slots>9?'rz-slots rz-slots--compact':'rz-slots'} aria-label="Place times">{Array.from({length:slots},(_,index)=>{
        const time=places[index],isWrong=wrong.has(index);
        const kind=isWrong?'rz-slot rz-slot--warn':index===target && !full?'rz-slot rz-slot--current':time===undefined?'rz-slot rz-slot--empty':'rz-slot';
        return <li key={index}><button type="button" className={kind} aria-current={index===target && !full?'step':undefined} disabled={locked || held || (time===undefined && index!==places.length)}
          aria-label={`${ordinal(index+1)} place: ${time===undefined?'no time yet':formatTime(time)}${isWrong?`, ${wrong.get(index)!.reason}`:''}`}
          onClick={()=>{setRetype(time===undefined?null:index);setTyped(time===undefined?'':digitsForTime(time));}}>
          <span className="rz-slot__ord">{ordinal(index+1)}{isWrong && <Icon name="warning" className="rz-slot__flag"/>}</span><span className="rz-slot__time">{time===undefined?'–':formatTime(time)}</span>
          {isWrong && <span className="rz-slot__note">{keptWrong.includes(index)?'Kept':wrong.get(index)!.reason}</span>}
        </button></li>;
      })}</ol>:<p className="rz-empty">Places appear here once {words.placesWhen}.</p>}
      {held && <Callout message={`${unkept!.banner} Fix it, or keep it if the timer really shows that.`}
        actions={<><button type="button" className="rz-btn" onClick={()=>void writes.send({places,keptWrong:[...keptWrong,unkept!.index]})}>Keep</button>
          <button type="button" className="rz-btn rz-btn--primary" onClick={fix}>Fix time</button></>}/>}
      {surplus && <Callout message={surplus.line}
        actions={<button type="button" className="rz-btn" disabled={writes.sending} onClick={()=>void writes.send({places:places.slice(0,-1),keptWrong:keptWrong.filter(index=>index<places.length-1)})}>Delete {ordinal(places.length)} place time</button>}/>}
      {!locked && !full && slots>0 && <DigitsField id="place-time" label="Place time" value={digits} held={held} onRelease={fix} warn={held || !!refusal.message} onChange={setTyped} onEnter={()=>void next()}
        selectKey={`${target}:${retype===null?'next':'retype'}:${refusal.count}`} hint={held || refusal.message?undefined:timeBoxHint} time/>}
      {refusal.message && <Callout message={refusal.message}/>}
    </main>
    {!locked && <DockedFooter>{held && <p className="rz-footer__reason">Fix or keep the {ordinal(target+1)} place time first</p>}<div className="rz-footer__trio">
      <KeepFocus className="rz-btn" disabled={target===0} onClick={()=>{const back=target-1;if(places[back]!==undefined) {setRetype(back);setTyped(digitsForTime(places[back]));}}} label="Previous place">Previous</KeepFocus>
      <button type="button" className="rz-btn" disabled={!places.length || held || writes.sending} onClick={()=>onDone('times')}>{doneButtons.times}</button>
      <KeepFocus className="rz-btn rz-btn--primary" disabled={!typed || held || full} onClick={()=>void next()}>Next</KeepFocus>
    </div></DockedFooter>}
  </>;
}
