import { useEffect,useState } from 'react';
import { api } from '../api.js';
import { eventTitle } from '../../shared/day.js';
import type { LeadRaceRead } from '../../shared/lead-results.js';
import { ordinal } from '../../shared/ordinal.js';
import { raceName } from '../../shared/race-flow.js';
import { entryName,entryNumber } from '../../shared/races.js';
import { raceRecording } from '../../shared/recording.js';
import { entryCount,entryNoun } from '../../shared/teams.js';
import { digitsForTime,formatTime,formatTimeDigits,parseTimeDigits,timeBoxHint,timeRefusal,timesOutOfOrder,timesWithoutPlaces } from '../../shared/time-entry.js';
import { toastLine } from '../../shared/toast-lines.js';
import { SortableList } from '../flow/SortableList.js';
import { useTimeRefusal } from '../flow/useTimeRefusal.js';
import { wrongTimesByPlace } from '../flow/WrongTime.js';
import { Callout,Icon,Sheet } from '../races/parts.js';
import { LeadBar,OpeningBody } from './LeadBar.js';
import { DigitsField } from '../races/Steps.js';
import { useToast } from '../races/Toast.js';
import type { View } from '../shell/addresses.js';
import { Comment } from './Comment.js';
import { Frame } from './RunnerSheet.js';
type CorrectionView=Extract<View,{kind:'correction'}>;
type Race=LeadRaceRead['race'];
/** Sends the correction; null once saved, else the refusal to show while the screen stays. */
type Save=(command:'times'|'finish-order',body:object)=>Promise<unknown>;
/**
 * Correct times or Correct finishing order, under its race page or its race screen: the lead changes a draft, and only
 * the docked Save sends it, once, with the versions it was read at. A save shows its toast and goes back to the screen
 * it was opened from; Back without saving changes nothing.
 */
export function TimesAndOrder({view,onBack,onChanged}:{view:CorrectionView;onBack:()=>void;onChanged?:()=>void}) {
  const toast=useToast();
  const [read,setRead]=useState<LeadRaceRead|null>(null),[error,setError]=useState<unknown>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{api<LeadRaceRead>(`lead/races/${view.raceId}`).then(setRead,setError);},[]);
  const title=view.action==='correct-times'?'Correct times':'Correct finishing order';
  if(!read) return <LeadBar title={title} code={view.code} up="Race" body={<OpeningBody error={error}/>}/>;
  const {race}=read;
  const save:Save=async(command,body)=>{
    setBusy(true);
    try {
      await api(`lead/races/${race.id}/${command}`,body);
      toast({message:toastLine({kind:'corrected',part:command==='times'?'times':'order',race:{section:race.event.section,kind:race.kind,number:race.number}})});
      onChanged?.();onBack();return null;
    } catch(error) {setBusy(false);return error;}
  };
  const Body=view.action==='correct-times'?CorrectTimes:CorrectOrder;
  return <LeadBar title={title} code={race.event.code} up={raceName(race)} body={<Body race={race} save={save} busy={busy}/>}/>;
}
const meta=(race:Race)=>`${eventTitle(race.event)} · ${raceName(race)}`;
/**
 * Correct times: a row per place (a wrong time in amber with its reason); tapping one retypes it in the race flow's
 * time box in its place, which refuses a time no one can run. No finisher clears a place and every place after it;
 * times left beyond the runners must be cleared so; out-of-order times can be accepted as the lead.
 */
function CorrectTimes({race,save,busy}:{race:Race;save:Save;busy:boolean}) {
  const [baseVersion]=useState(race.parts.times.version);
  const [initial]=useState(()=>Array.from({length:Math.max(race.parts.runners.value?.length||0,race.parts.times.value?.places.length||0)},(_,index)=>{
    const time=race.parts.times.value?.places[index];return time===null?null:time===undefined?'':digitsForTime(time);}));
  const [digits,setDigits]=useState<Array<string|null>>(initial);
  const [editing,setEditingPlace]=useState<number|null>(null);
  const refusal=useTimeRefusal();
  const setEditing=(index:number|null)=>{setEditingPlace(index);refusal.clear();};
  const [accepted,setAccepted]=useState(false),[comment,setComment]=useState(''),[refused,setRefused]=useState<unknown>(null);
  const relay=!!race.event.relay,name=race.event.name;
  const places=digits.map(value=>value===null?null:parseTimeDigits(value)),outOfOrder=timesOutOfOrder(places),invalid=digits.some(value=>value!==null && parseTimeDigits(value)===null);
  const mismatch=raceRecording({...race,parts:{...race.parts,times:invalid?race.parts.times:{version:baseVersion,value:{places,outOfOrder}}}}).countMismatch;
  const wrong=wrongTimesByPlace(places,name);
  /** Times left beyond the runners (say, after a runner was removed) must be cleared with No finisher; only the runners' places are saved. */
  const runnerCount=race.parts.runners.value?.length||0,leftover=places.slice(runnerCount).some(time=>time!==null);
  const changed=accepted || digits.some((value,index)=>value!==initial[index]);
  const reason=leftover?`This race has ${entryCount(runnerCount,relay)}. Choose No finisher for every place after ${ordinal(runnerCount)} to save.`
    :invalid?'Type a time for each place.':changed?null:'Change a time to save.';
  function change(index:number,value:string|null) {setAccepted(false);refusal.clear();setDigits(previous=>previous.map((old,at)=>at===index?value:old));}
  /** Enter on a place moves on to the next place still needing a time, as typing times in order would. */
  function done(index:number) {
    if(refusal.check(digits[index]!,name)) return;
    const next=digits.findIndex((value,at)=>at>index && value==='');setEditing(next>=0?next:null);
  }
  function noFinisher(index:number,checked:boolean) {
    setAccepted(false);setDigits(previous=>previous.map((old,at)=>checked && at>=index?null:at===index?'':old));
    if(checked && editing!==null && editing>=index) setEditing(null);
  }
  async function go() {
    // A changed time no one can run waits in its box with the refusal, as Enter would show it.
    const bad=digits.findIndex((value,index)=>!!value && value!==initial[index] && timeRefusal(value,name)!==null);
    if(bad>=0) {setEditingPlace(bad);refusal.check(digits[bad]!,name);return;}
    setRefused(null);setRefused(await save('times',{baseVersion,places:places.slice(0,runnerCount),acceptOutOfOrder:accepted,comment}));
  }
  const rowLabel=(index:number,value:string)=>`${ordinal(index+1)} place · ${value?formatTimeDigits(value):'Time needed'}${wrong.get(index)?` · ${wrong.get(index)!.reason}`:''}`;
  return <Frame meta={meta(race)} question={<>Correct the <em>times</em></>} help="Read the times from the SprintTimer. Tap a place to retype it."
    reason={reason} busy={busy} label="Save times" refused={refused} onGo={()=>void go()}>
    {mismatch && <Callout status message={mismatch}/>}
    <ol className="rz-lead-rows" aria-label="Times">{digits.map((value,index)=><li key={index} className="rz-timefix">
      {value!==null && editing===index?<div>
        <DigitsField id="correct-time" label={`${ordinal(index+1)} place time`} value={value} busy={busy} warn={!!refusal.message} selectKey={`${index}:${refusal.count}`} time
          hint={refusal.message?undefined:timeBoxHint} onChange={digits=>change(index,digits)} onEnter={()=>done(index)} onRelease={()=>{}}/>
        {refusal.message && <Callout message={refusal.message}/>}
      </div>:value===null?<div className="rz-lead-row"><span className="rz-lead-row__place">{ordinal(index+1)}</span><span className="rz-lead-row__num">–</span></div>
      :<button type="button" className={wrong.get(index)?'rz-lead-row rz-lead-row--warn':'rz-lead-row'} aria-label={rowLabel(index,value)} onClick={()=>setEditing(index)}>
        <span className="rz-lead-row__place">{ordinal(index+1)}</span><span className="rz-lead-row__num">{value?formatTimeDigits(value):'Time needed'}</span><Icon name="pencil"/>
        {wrong.get(index) && <span className="rz-lead-row__note">{wrong.get(index)!.reason}</span>}
      </button>}
      {editing!==index && <button type="button" className={value===null?'rz-btn rz-btn--pill rz-btn--primary':'rz-btn rz-btn--pill'} aria-pressed={value===null} aria-label={`No finisher for ${ordinal(index+1)} place`}
        disabled={busy || digits.slice(0,index).includes(null)} onClick={()=>noFinisher(index,value!==null)}>No finisher</button>}
    </li>)}</ol>
    {outOfOrder && !refusal.message && <Callout message="Times are out of order. Check the recording or explicitly accept this set as the lead."
      actions={<button type="button" className={accepted?'rz-btn rz-btn--primary':'rz-btn'} aria-pressed={accepted} onClick={()=>setAccepted(!accepted)}>Accept these out-of-order times</button>}/>}
    <Comment value={comment} onChange={setComment}/>
  </Frame>;
}
/** `removedPlaces` are the places taken away, as the saved times count them: each loses its time. */
type Order={order:number[];didNotFinish:number[];didNotRun:number[];removedPlaces:number[]};
/**
 * Correct finishing order: dragging a wristband (on a relay, a team) by its handle moves it to another place while times
 * stay by place; No place asks whether it did not finish or did not run (its place's time goes with it, so those below
 * keep their own), and Give a place puts a did-not-finish back last.
 */
function CorrectOrder({race,save,busy}:{race:Race;save:Save;busy:boolean}) {
  // Entries go by the number the server takes: a child's wristband, or a team's number shown as "Team 3".
  const entries=race.parts.runners.value||[],relay=!!race.event.relay;
  const numberOf=(id:string)=>{const entry=entries.find(entry=>entry.id===id);return entry?entryNumber(entry):0;};
  const name=(number:number)=>{const entry=entries.find(entry=>entryNumber(entry)===number);return entry?entryName(entry):String(number);};
  const [read]=useState(()=>({baseVersion:race.parts.finish.version,runnersVersion:race.parts.runners.version,
    initial:{order:(race.parts.finish.value?.order||[]).map(numberOf),didNotFinish:(race.parts.finish.value?.didNotFinish||[]).map(numberOf),didNotRun:[],removedPlaces:[]} as Order}));
  const [shown,setShown]=useState(read.initial),[asking,setAsking]=useState<number|null>(null);
  const [comment,setComment]=useState(''),[refused,setRefused]=useState<unknown>(null);
  // The times as Save would leave them: a place taken away here loses its time.
  const places=race.kind==='final'?null:timesWithoutPlaces(race.parts.times.value,shown.removedPlaces)?.places;
  const changed=JSON.stringify(shown)!==JSON.stringify(read.initial);
  const move=(next:Order)=>{setAsking(null);setShown(next);};
  const without=(list:number[],number:number)=>list.filter(other=>other!==number);
  /** No place: the entry leaves the order, and the place it has on this screen (a drag may have moved it) loses its time. */
  function noPlace(to:'didNotFinish'|'didNotRun') {
    const held=read.initial.order.map((_,place)=>place).filter(place=>!shown.removedPlaces.includes(place)),place=held[shown.order.indexOf(asking!)];
    move({...shown,order:without(shown.order,asking!),[to]:[...shown[to],asking!],removedPlaces:place===undefined?shown.removedPlaces:[...shown.removedPlaces,place]});
  }
  const time=(place:number)=>{const value=places?.[place-1];return value===undefined?null:value===null?'No time':formatTime(value);};
  async function go() {setRefused(null);setRefused(await save('finish-order',{baseVersion:read.baseVersion,runnersVersion:read.runnersVersion,...shown,comment}));}
  return <Frame meta={meta(race)} question={<>Correct the <em>finishing order</em></>} help={`Drag a handle to move a ${entryNoun(relay)}. Times stay by place.`}
    reason={changed?null:'Change the order to save.'} busy={busy} label="Save finishing order" refused={refused} onGo={()=>void go()}>
    <SortableList label="Finishing order" items={shown.order} itemKey={number=>number} itemName={name} disabled={busy} onReorder={order=>move({...shown,order})}
      look={{list:'rz-orderrows',row:'rz-orderrow rz-orderrow--action',handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:name=>`Move ${name}`}}
      renderItem={(number,place)=><><span className="rz-orderrow__place">{ordinal(place)}</span>
        <span className="rz-orderrow__num rz-orderrow__num--detail">{name(number)}{time(place) && <span className="rz-orderrow__detail">{time(place)}</span>}</span>
        <button type="button" className="rz-btn rz-btn--small" disabled={busy} aria-label={`No place for ${name(number)}`} onClick={()=>setAsking(number)}>No place</button></>}/>
    {shown.didNotFinish.length+shown.didNotRun.length>0 && <><h3 className="rz-section">No place</h3><ul className="rz-orderrows" aria-label="No place">
      {shown.didNotFinish.map(number=><li key={number} className="rz-orderrow rz-orderrow--unplaced"><span className="rz-orderrow__num rz-orderrow__num--detail">{name(number)}<span className="rz-orderrow__detail">Did not finish</span></span>
        <button type="button" className="rz-btn rz-btn--small" disabled={busy} aria-label={`Give a place to ${name(number)}`} onClick={()=>move({...shown,order:[...shown.order,number],didNotFinish:without(shown.didNotFinish,number)})}>Give a place</button></li>)}
      {shown.didNotRun.map(number=><li key={number} className="rz-orderrow rz-orderrow--unplaced"><span className="rz-orderrow__num rz-orderrow__num--detail">{name(number)}<span className="rz-orderrow__detail">Didn't run · taken off this race</span></span></li>)}
    </ul></>}
    <Comment value={comment} onChange={setComment}/>
    {asking!==null && <Sheet title={`No place for ${name(asking)}`} onClose={()=>setAsking(null)}>
      <p className="rz-sheet__text">{name(asking)} has no place. What happened?</p>
      <p className="rz-sheet__text">Didn't run takes {name(asking)} off this race{relay?': it is still to run again':''}.</p>
      <div className="rz-sheet__actions">
        <button type="button" className="rz-btn rz-btn--block" onClick={()=>noPlace('didNotFinish')}>Did not finish</button>
        <button type="button" className="rz-btn rz-btn--block" onClick={()=>noPlace('didNotRun')}>Didn't run</button>
      </div>
    </Sheet>}
  </Frame>;
}
