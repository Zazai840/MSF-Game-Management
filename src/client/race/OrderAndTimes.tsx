import { useState } from 'react';
import { ordinal } from '../../shared/ordinal.js';
import { onlyRunners,entryWord,type RaceScreenRead } from '../../shared/race-screen.js';
import { entryName,isTeamEntry,runnersOf,type RaceEntry } from '../../shared/races.js';
import { changingName,stillToRun } from '../../shared/teams.js';
import { digitsForTime,formatTime,formatTimeDigits,parseTimeDigits } from '../../shared/time-entry.js';
import { wrongTimesBanner } from '../../shared/wrong-times.js';
import { NumberEntry } from '../flow/NumberEntry.js';
import { SortableList } from '../flow/SortableList.js';
import { WrongTimeReason,wrongTimesByPlace } from '../flow/WrongTime.js';
import { RaceCard } from './RaceCard.js';
import { TakeOver,useColumnWrites,useRaceWrite,type Offer } from './Hold.js';
import { WristbandEntry } from './WristbandEntry.js';

/** The order holder's whole column, by entry. Didn't run takes a runner off the race, so the server forgets it once done. */
type OrderColumn={order:string[];didNotFinish:string[];didNotRun:string[]};
type Column='order'|'times';
const columnNames:Record<Column,string>={order:'Order',times:'Times'};
/** The entry the no-place question asks about: a wristband, or a team by its 4th leg, "Team 3 (4th leg 2150)". */
const noPlaceName=(entry:RaceEntry)=>!isTeamEntry(entry)?entryName(entry):`${entryName(entry)} (${entry.legs[3]?.wristband!=null?`4th leg ${entry.legs[3].wristband}`:'no 4th leg'})`;
/**
 * An entry as the order shows it, short enough for one line in the Wristband column: a wristband, or a relay team's
 * 4th-leg wristband (the child the order holder sees cross) with "Team 3" small under it ("Team 3" with "no 4th leg"
 * when that box is empty). "At finish" goes under one added at the finish.
 */
export function EntryLabel({entry}:{entry:RaceEntry}) {
  const last=isTeamEntry(entry)?entry.legs[3]?.wristband??null:null;
  return <>{!isTeamEntry(entry)?entryName(entry):last!==null?<>{last}<small>{entryName(entry)}</small></>:<>{entryName(entry)}<small>no 4th leg</small></>}{entry.addedAtFinish && <small>At finish</small>}</>;
}

/**
 * Order and Times ("Finishing order" on a final, with no times): one table by place, Place | Wristband | Time, with
 * one holder per column. Opening the card takes the one free column; with both free it offers "Do the order" and
 * "Do the times", and one person may hold both. The order holder taps checked-in runners in finishing order (the
 * next cell reads Next), adds a runner not on the list, marks those left Did not finish or Didn't run, and drags
 * wristbands to reorder while times stay by place. The times holder types each place's time once the place has a
 * wristband, taps a time to retype it, and chooses Fix time or Keep for a wrong one (faster than an earlier place),
 * which shows amber on every phone. Each change sends the whole column at once.
 */
export function OrderAndTimesCard({screen,phoneId,offer}:{screen:RaceScreenRead;phoneId:string;offer:Offer}) {
  const {event,race,stageComplete,holds}=screen,final=race.kind==='final',place=entryWord(event.relay);
  const columns:Column[]=final?['order']:['order','times'];
  const {busy,error,write}=useRaceWrite(event.code,offer);
  const {pending,sending,send:sendOrder}=useColumnWrites<OrderColumn&{raceId:string|null;added:number[];keptWarnings:number[];addedTeams:string[]}>(write,'order',race.parts.finish.version);
  const timesWrites=useColumnWrites<{raceId:string|null;places:number[];keptWrong:number[]}>(write,'times',race.parts.times.version);
  type Step='place'|'no-place'|'add'|'move';
  // The card stays open as the event moves on to its next race, which starts at placing again.
  const [stepOf,setStepOf]=useState<{raceId:string|null;step:Step}>({raceId:race.id,step:'place'});
  const step=stepOf.raceId===race.id?stepOf.step:'place',setStep=(next:Step)=>setStepOf({raceId:race.id,step:next});
  /** The time pad: the digits typed, and the place being retyped (none: the next place). It starts afresh on the next race. */
  const [padOf,setPadOf]=useState<{raceId:string|null;typed:string;retype:number|null}>({raceId:race.id,typed:'',retype:null});
  const pad=padOf.raceId===race.id?padOf:{typed:'',retype:null},setPad=(typed:string,retype:number|null)=>setPadOf({raceId:race.id,typed,retype});
  /** Sends the order holder's latest column, with any runners (or on a relay, teams by id) added at the finish. */
  const send=(column:OrderColumn,added:number[]=[],kept:number[]=[],addedTeams:string[]=[])=>sendOrder({raceId:race.id,...column,added,keptWarnings:kept,addedTeams});
  const finish=race.parts.finish.value,shown:OrderColumn=pending||{order:finish?.order||[],didNotFinish:finish?.didNotFinish||[],didNotRun:[]};
  const runners=(race.parts.runners.value||[]).filter(runner=>!shown.didNotRun.includes(runner.id)),byId=new Map(runners.map(runner=>[runner.id,runner]));
  // A runner check-in has just taken off drops out, and later places move up, as the server does.
  const {order,didNotFinish}=onlyRunners(shown,runners);
  const unplaced=runners.filter(runner=>!order.includes(runner.id) && !didNotFinish.includes(runner.id));
  const change=(next:Partial<OrderColumn>)=>void send({order,didNotFinish,didNotRun:shown.didNotRun,...next});
  // A No finisher mark (only ever at the bottom, from the old Times job or a lead) is no time here.
  const stored=race.parts.times.value,places=final?[]:timesWrites.pending?.places||(stored?.places||[]).filter((time):time is number=>time!==null),timed=places.length;
  const keptWrong=timesWrites.pending?.keptWrong||stored?.keptWrong||[],wrong=wrongTimesByPlace(places);
  const unkept=[...wrong.values()].find(item=>!keptWrong.includes(item.index));
  const timing=holds.times?.id===phoneId && !stageComplete && !final;
  // The timer types the next place's time once it has a wristband. A wrong time waits for Fix time or Keep first.
  const retype=timing && pad.retype!==null && pad.retype<places.length?pad.retype:null,held=timing && retype===null && !!unkept;
  const target=held?unkept!.index:retype??places.length,typing=timing && (held || retype!==null || places.length<order.length);
  // A held pad shows the wrong time waiting for Fix time or Keep.
  const padDigits=held?digitsForTime(places[target]):pad.typed;
  function sendTime() {
    const time=parseTimeDigits(pad.typed);
    if(time===null) return;
    const next=[...places];next[target]=time;
    // A retyped time is new, so it is no longer kept.
    const stillWrong=wrongTimesByPlace(next);
    void timesWrites.send({raceId:race.id,places:next,keptWrong:keptWrong.filter(index=>index!==target && stillWrong.has(index))});
    setPad('',null);
  }
  const ordering=holds.order?.id===phoneId && !stageComplete;
  // "+ Team not on the list" offers the relay's teams still to run that nobody is changing: never a new team.
  const addable=(screen.teams||[]).filter(team=>stillToRun(team) && !changingName(team));
  const next=ordering && step==='place' && unplaced.length?order.length:-1;
  const rows=Math.max(runners.length-didNotFinish.length,order.length,places.length);
  const time=(place:number)=>places[place-1]==null?'':formatTime(places[place-1]!);
  const who=(column:Column)=>{const holder=holds[column];return !holder?'Nobody':holder.id===phoneId?'You':holder.name;};
  const status=columns.some(column=>holds[column])?columns.map(column=>`${columnNames[column]}: ${who(column)}`).join(' · ')
    :order.length || timed?(final?`${order.length} placed`:`${order.length} placed · ${timed} ${timed===1?'time':'times'}`):stageComplete?'Nobody':'Nobody yet · open to start';
  function open() {
    if(stageComplete || columns.some(column=>holds[column]?.id===phoneId)) return;
    const free=columns.filter(column=>!holds[column]);
    if(free.length===1) void write('hold',{job:free[0]});
  }
  return <RaceCard title={final?'Finishing order':'Order and Times'} status={status} onOpen={open}>
    {error && <p role="alert">{error}</p>}
    <div className="race-columns">{columns.map(column=>{
      const holder=holds[column];
      return <div className="race-column" key={column}><span className="race-column-name">{columnNames[column]}</span>
        {!holder?stageComplete?<span className="race-column-who">Nobody</span>:<button className="button-small" disabled={busy} onClick={()=>void write('hold',{job:column})}>{column==='order'?'Do the order':'Do the times'}</button>
        :holder.id===phoneId?<span className="race-column-who race-column-you">You</span>
        :<><span className="race-column-who">{holder.name}</span>{!stageComplete && <TakeOver job={column} holder={holder.name} busy={busy} onConfirm={()=>void write('take-over',{job:column})}/>}</>}
      </div>;
    })}</div>
    {ordering && step==='move'?<>
      <p className="race-hint">Drag a {place} to its place: times stay by place.</p>
      <SortableList label="Finishing order" items={order} itemKey={id=>id} itemName={id=>entryName(byId.get(id)!)} onReorder={moved=>change({order:moved})}
        renderItem={(id,place)=><><span className="race-move-place">{ordinal(place)}{time(place) && <small>{time(place)}</small>}</span><span className="race-move-runner"><EntryLabel entry={byId.get(id)!}/></span></>}/>
    </>:runners.length?<table className={event.relay?'race-table race-teams':'race-table'} aria-label={final?'Finishing order':'Order and times'}>
      <thead><tr><th>Place</th><th>{event.relay?'Team':'Wristband'}</th>{!final && <th>Time</th>}</tr></thead>
      <tbody>{Array.from({length:rows},(_,index)=>{
        const runner=byId.get(order[index]);
        return <tr key={index}><td>{ordinal(index+1)}</td>
          <td>{runner?<EntryLabel entry={runner}/>:index===next?<span className="race-next">Next</span>:''}</td>
          {!final && <td className={wrong.has(index)?'time-wrong':undefined}>{places[index]===undefined?index===target && typing && <span className="race-next">Next</span>
            // The timer taps a placed time to retype it; a time left at a place with no wristband stays for a lead.
            :timing && index<order.length?<button className="race-time" disabled={held} aria-label={`${ordinal(index+1)} place · ${time(index+1)}${wrong.has(index)?` · ${wrong.get(index)!.reason}`:''}`}
              onClick={()=>setPad(digitsForTime(places[index]),index)}>{time(index+1)}<WrongTimeReason wrong={wrong.get(index)}/></button>
            :<>{time(index+1)}<WrongTimeReason wrong={wrong.get(index)}/></>}</td>}
        </tr>;
      })}</tbody>
    </table>:<p className="race-empty">Places appear here once {event.relay?'teams':'runners'} are checked in</p>}
    {didNotFinish.length>0 && <ul className="race-no-place" aria-label="No place">{didNotFinish.map(id=><li key={id}><strong>{entryName(byId.get(id)!)}</strong><span>Did not finish</span>
      {ordering && <button className="button-small button-secondary" aria-label={`Give a place to ${entryName(byId.get(id)!)}`} onClick={()=>change({order:[...order,id],didNotFinish:didNotFinish.filter(other=>other!==id)})}>Give a place</button>}
    </li>)}</ul>}
    {wrong.size>0 && !unkept && <p className="calm-note">Kept as typed. A zone lead will check it.</p>}
    {ordering && step==='move' && <button className="button-secondary" onClick={()=>setStep('place')}>Done</button>}
    {ordering && step==='add' && event.relay && <div className="race-order">
      <h3 className="race-question">Which team crossed the line?</h3>
      <p className="race-hint">Teams that haven't run a heat. A team not here is added on the Teams screen first.</p>
      {addable.length?<div className="pick-list">{addable.map(team=><button key={team.id} disabled={sending}
        onClick={async()=>{if(typeof await send({order,didNotFinish,didNotRun:shown.didNotRun},[],[],[team.id])==='object') setStep('place');}}>
        Team {team.number}<small>{team.legs.map(leg=>leg.wristband??'-').join(' · ')}</small></button>)}</div>
      :<p className="calm-note">Every team has run or is in this heat.</p>}
      <button className="button-quiet" onClick={()=>setStep('place')}>Cancel</button>
    </div>}
    {ordering && step==='add' && !event.relay && <>
      <WristbandEntry event={event} raceId={race.id} busy={busy || sending} label="Runner not on the list: wristband number" taken={runnersOf(runners).map(runner=>runner.wristband)}
        onSave={async(wristband,kept)=>{const sent=await send({order,didNotFinish,didNotRun:shown.didNotRun},[wristband],kept?[wristband]:[]);if(typeof sent==='object') setStep('place');return sent;}}/>
      <button className="button-quiet" onClick={()=>setStep('place')}>Back to the order</button>
    </>}
    {ordering && (step==='place' || step==='no-place') && <div className="race-order">
      {!runners.length?<p className="race-hint">{event.relay?'Teams':'Runners'} to tap appear here as they are checked in.</p>
      :!unplaced.length?<p className="calm-note" role="status">{event.relay?'Every team has a place':'Everyone has a place'}</p>
      :step==='no-place'?<>
        <h3 className="race-question">{noPlaceName(unplaced[0])} has no place. What happened?</h3>
        <div className="race-pair"><button className="button-secondary" onClick={()=>change({didNotFinish:[...didNotFinish,unplaced[0].id]})}>Did not finish</button><button className="button-secondary" onClick={()=>change({didNotRun:[...shown.didNotRun,unplaced[0].id]})}>Didn't run</button></div>
        {event.relay && <p className="race-hint">Didn't run puts the team back with those still to run, for the next heat.</p>}
        <button className="button-quiet" onClick={()=>setStep('place')}>{event.relay?'Cancel':'Back to the order'}</button>
      </>:<>
        <h3 className="race-question">Who came {ordinal(order.length+1)}?</h3>
        <div className={event.relay?'race-numbers race-teams':'race-numbers'}>{unplaced.map(runner=><button key={runner.id} onClick={()=>change({order:[...order,runner.id]})}>{event.relay?<EntryLabel entry={runner}/>:entryName(runner)}</button>)}</div>
        <button className="button-secondary" onClick={()=>setStep('no-place')}>Nobody else crossed the line</button>
      </>}
      {runners.length>0 && <div className="race-order-more">
        <button className="button-quiet" disabled={sending} onClick={()=>setStep('add')}>{event.relay?'+ Team not on the list':'+ Runner not on the list'}</button>
        {order.length>1 && <button className="button-quiet" onClick={()=>setStep('move')}>Change the order</button>}
      </div>}
    </div>}
    {timing && (typing?<div className="race-order">
      <h3 className="race-question">{ordinal(target+1)} place time?</h3>
      <NumberEntry inline label="Place time" placeholder="e.g. 1234" value={padDigits} held={held} onChange={digits=>setPad(digits,retype)} onNext={sendTime}
        selectKey={`${race.id}:${target}:${retype===null?'next':'retype'}`} display={<p className="time-shows">Shows as <strong>{formatTimeDigits(padDigits)}</strong></p>}
        extraAction={retype!==null && <button className="button-secondary" onClick={()=>setPad('',null)}>Cancel</button>}/>
      {held && <div className="warning-box" role="alert">
        <p>{wrongTimesBanner([unkept!])} Fix it, or keep it if the timer really shows that.</p>
        <div className="warning-actions"><button onClick={()=>setPad('',unkept!.index)}>Fix time</button>
          <button className="button-secondary" onClick={()=>void timesWrites.send({raceId:race.id,places,keptWrong:[...keptWrong,unkept!.index]})}>Keep</button></div>
      </div>}
      {!held && <p className="race-hint">{event.relay && 'One time per team: the start to the 4th leg crossing. '}Type digits only: 1234 shows as 12.34, 13240 as 1:32.40. Tap a time to retype it.</p>}
    </div>
    // A runner came off the order after the times were in: Submit Race waits until the timer removes the time left over.
    :places.length>order.length?<div className="race-order">
      <p className="calm-note">{ordinal(order.length+1)} place has a time but no {place}.</p>
      <button className="button-secondary" disabled={timesWrites.sending} onClick={()=>void timesWrites.send({raceId:race.id,places:places.slice(0,order.length),keptWrong:keptWrong.filter(index=>index<order.length)})}>
        {places.length-order.length===1?`Remove ${ordinal(order.length+1)} place's time`:`Remove the ${places.length-order.length} times with no ${place}`}</button>
    </div>
    :runners.length && !unplaced.length?<p className="calm-note" role="status">Every place has a time</p>
    :<p className="race-hint">The next time goes in once {ordinal(places.length+1)} place has a {place}.</p>)}
  </RaceCard>;
}
