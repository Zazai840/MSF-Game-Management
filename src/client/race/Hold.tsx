import { useState } from 'react';
import { ApiFailure,api } from '../api.js';
import { jobWords,type RaceJob,type RaceScreenRead } from '../../shared/race-screen.js';
/** Hands a write's answer (the race screen as it then stands) to the screen, which keeps the newest. */
export type Offer=(next:RaceScreenRead)=>void;
/**
 * One card's writes on the race screen: taking a hold, Take over, writing the job's column. Each answers with the
 * race screen as it then stands. A refusal shows on the card and leaves the card showing what the server has.
 */
export function useRaceWrite(eventCode:string,offer:Offer) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  /** Sends one write; true once the server has it, 'refused' when the server said no, false when it could not be sent. */
  async function write(what:string,body:object):Promise<true|false|'refused'> {
    setBusy(true);setError('');
    try {offer(await api<RaceScreenRead>(`race-screen/${encodeURIComponent(eventCode)}/${what}`,body));return true;}
    catch(failure) {setError(failure instanceof Error?failure.message:'Could not connect - please try again');return failure instanceof ApiFailure?'refused':false;}
    finally {setBusy(false);}
  }
  return {busy,error,setError,write};
}
/** Take over beside a job's holder. It confirms inline in the card first. */
export function TakeOver({job,holder,busy,onConfirm}:{job:RaceJob;holder:string;busy:boolean;onConfirm:()=>void}) {
  const [asking,setAsking]=useState(false);
  if(!asking) return <button className="button-quiet race-take-over" disabled={busy} onClick={()=>setAsking(true)}>Take over {jobWords[job]}</button>;
  return <div className="warning-box">
    <p>Take over {jobWords[job]} from {holder}? {holder}'s phone shows it read-only from now on. Everything already entered stays.</p>
    <div className="warning-actions"><button disabled={busy} onClick={()=>{setAsking(false);onConfirm();}}>Take over</button><button className="button-secondary" onClick={()=>setAsking(false)}>Cancel</button></div>
  </div>;
}
