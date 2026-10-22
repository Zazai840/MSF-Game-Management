import { useRef,useState } from 'react';
import { ApiFailure,api } from '../api.js';
import { jobWords,type Job,type RaceScreenRead } from '../../shared/race-screen.js';
/** Hands a write's answer (the race screen as it then stands) to the screen, which keeps the newest. */
export type Offer=(next:RaceScreenRead)=>void;
/**
 * One card's writes on the race screen: taking a hold, Take over, writing the job's column. Each answers with the
 * race screen as it then stands. A refusal shows on the card and leaves the card showing what the server has.
 */
export function useRaceWrite(eventCode:string,offer:Offer) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  /** Sends one write; the race screen it answers once the server has it, 'refused' when the server said no, false when it could not be sent. */
  async function write(what:string,body:object):Promise<RaceScreenRead|false|'refused'> {
    setBusy(true);setError('');
    try {const answer=await api<RaceScreenRead>(`race-screen/${encodeURIComponent(eventCode)}/${what}`,body);offer(answer);return answer;}
    catch(failure) {setError(failure instanceof Error?failure.message:'Could not connect - please try again');return failure instanceof ApiFailure?'refused':false;}
    finally {setBusy(false);}
  }
  return {busy,error,setError,write};
}
/**
 * One column's writes (the order or the times), latest wins: each change sends the holder's whole column with the
 * part version last answered. A change made while a write is on its way shows at once as `pending` and goes in the
 * next write, so quick taps on a slow link are never lost. A refusal leaves the card showing what the server has.
 * `send` answers like `write`, or true when the change was queued behind a write on its way.
 */
export function useColumnWrites<Column extends object>(write:ReturnType<typeof useRaceWrite>['write'],job:'order'|'times',version:number) {
  const queue=useRef<Column|null>(null),running=useRef(false);
  const [pending,setPending]=useState<Column|null>(null),[sending,setSending]=useState(false);
  async function send(column:Column) {
    queue.current=column;setPending(column);
    if(running.current) return true;
    running.current=true;setSending(true);
    let seen=version,sent:Awaited<ReturnType<typeof write>>=false;
    try {
      while(queue.current) {
        const next=queue.current;queue.current=null;
        sent=await write(job,{...next,version:seen});
        if(typeof sent!=='object') break;
        seen=sent.race.parts[job==='order'?'finish':'times'].version;
      }
    } finally {queue.current=null;running.current=false;setSending(false);setPending(null);}
    return sent;
  }
  return {pending,sending,send};
}
/** Take over beside a job's holder. It confirms inline in the card first. */
export function TakeOver({job,holder,busy,onConfirm}:{job:Job;holder:string;busy:boolean;onConfirm:()=>void}) {
  const [asking,setAsking]=useState(false);
  if(!asking) return <button className="button-quiet race-take-over" disabled={busy} onClick={()=>setAsking(true)}>Take over {jobWords[job]}</button>;
  return <div className="warning-box">
    <p>Take over {jobWords[job]} from {holder}? {holder}'s phone shows it read-only from now on. Everything already entered stays.</p>
    <div className="warning-actions"><button disabled={busy} onClick={()=>{setAsking(false);onConfirm();}}>Take over</button><button className="button-secondary" onClick={()=>setAsking(false)}>Cancel</button></div>
  </div>;
}
