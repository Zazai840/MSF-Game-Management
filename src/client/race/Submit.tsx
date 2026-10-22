import { useState } from 'react';
import { ordinal } from '../../shared/ordinal.js';
import { andList,jobs,submitBlocker,waitingOn,type RaceScreenRead } from '../../shared/race-screen.js';
import { formatTime } from '../../shared/time-entry.js';
import { ActionBar } from '../flow/ActionBar.js';
import { TakeOver,useRaceWrite,type Offer } from './Hold.js';

const jobNames={'check-in':'Check-in',order:'Order',times:'Times'} as const;
/**
 * The race once submitted (or a saved final): its results by place, read-only on every phone, with who holds each job
 * and Take over beside the others, so a stuck holder can be replaced and the new holder presses Submit Race.
 */
export function ResultsCard({screen,phoneId,offer}:{screen:RaceScreenRead;phoneId:string;offer:Offer}) {
  const {race,holds}=screen,final=race.kind==='final',saved=race.state==='saved';
  const {busy,error,write}=useRaceWrite(screen.event.code,offer);
  const runners=race.parts.runners.value||[],finish=race.parts.finish.value,places=race.parts.times.value?.places||[];
  const wristband=(id:string)=>runners.find(runner=>runner.id===id)?.wristband;
  return <section className="race-card race-results"><div className="race-card-body">
    <div><h2>{final && saved?'Final results':'Results'}</h2><p className="race-hint">{saved?'Saved. Corrections go through a zone lead.':'Check them. Spot a mistake? Tap Not yet.'}</p></div>
    {error && <p role="alert">{error}</p>}
    <table className="race-table" aria-label="Results"><thead><tr><th>Place</th><th>Wristband</th>{!final && <th>Time</th>}</tr></thead>
      <tbody>{(finish?.order||[]).map((id,index)=><tr key={id}><td>{ordinal(index+1)}</td><td>{wristband(id)}</td>{!final && <td>{places[index]==null?'':formatTime(places[index]!)}</td>}</tr>)}</tbody></table>
    {!!finish?.didNotFinish.length && <ul className="race-no-place" aria-label="No place">{finish.didNotFinish.map(id=><li key={id}><strong>{wristband(id)}</strong><span>Did not finish</span></li>)}</ul>}
    {!saved && <div className="race-columns">{jobs.filter(job=>holds[job]).map(job=>{
      const holder=holds[job]!;
      return <div className="race-column" key={job}><span className="race-column-name">{jobNames[job]}</span>
        {holder.id===phoneId?<span className="race-column-who race-column-you">You</span>
        :<><span className="race-column-who">{holder.name}</span><TakeOver job={job} holder={holder.name} busy={busy} onConfirm={()=>void write('take-over',{job})}/></>}
      </div>;
    })}</div>}
  </div></section>;
}
/**
 * Submit Race, docked at the bottom of the screen, for those asked to press it (anyone, once nobody is left to ask).
 * In progress, it shows why it is blocked under it, on every phone. Once submitted it says who it is waiting on, with
 * Submit Race for those still to press and Not yet for anyone. The last press saves. A lead also has Save as lead,
 * which saves after a confirm without the presses still missing.
 */
export function SubmitDock({screen,phoneId,lead,offer}:{screen:RaceScreenRead;phoneId:string;lead:boolean;offer:Offer}) {
  const {race,asked,pressed}=screen;
  const {busy,error,write}=useRaceWrite(screen.event.code,offer);
  const [confirming,setConfirming]=useState(false);
  // Watchers (holding nothing with entries on this race) are not asked to submit.
  const asking=!asked.length || asked.some(holder=>holder.id===phoneId);
  const submit=(blocked=false)=>asking && <button disabled={busy || blocked} onClick={()=>void write('submit',{raceId:race.id})}>Submit Race</button>;
  if(race.state==='in progress') {
    const blocked=submitBlocker(race);
    if(!asking && !blocked && !error) return null;
    return <ActionBar stacked>{error && <p role="alert">{error}</p>}{blocked && <p className="race-blocked">{blocked}</p>}{submit(!!blocked)}</ActionBar>;
  }
  const waiting=waitingOn(asked,pressed),mine=pressed.some(holder=>holder.id===phoneId);
  // A lead saves without the presses still missing from others; their own is Submit Race.
  const others=waiting.filter(holder=>holder.id!==phoneId).map(holder=>holder.name);
  return <ActionBar stacked>{error && <p role="alert">{error}</p>}
    <p className="race-waiting" role="status">{waiting.length?`${mine?'You submitted. ':''}Waiting on ${andList(waiting.map(holder=>holder.id===phoneId?'you':holder.name))}`:'Nobody else to wait on: Submit Race saves it'}</p>
    <div className="race-dock-row">{(!mine || !waiting.length) && submit()}<button className="button-secondary" disabled={busy} onClick={()=>void write('not-yet',{raceId:race.id})}>Not yet</button></div>
    {lead && others.length>0 && (confirming?<div className="warning-box">
      <p>{andList(others)} {others.length===1?"hasn't":"haven't"} submitted. Save anyway?</p>
      <div className="warning-actions"><button disabled={busy} onClick={()=>{setConfirming(false);void write('save-as-lead',{raceId:race.id});}}>Save anyway</button><button className="button-secondary" onClick={()=>setConfirming(false)}>Cancel</button></div>
    </div>:<button className="button-secondary" disabled={busy} onClick={()=>setConfirming(true)}>Save as lead</button>)}
  </ActionBar>;
}
