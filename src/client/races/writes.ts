import { useRef,useState } from 'react';
import { ApiFailure,api } from '../api.js';
import type { RaceFlowRead } from '../../shared/race-flow.js';
import type { RacePartName } from '../../shared/races.js';
import { latestWins } from './latest-wins.js';
/** Hands a write's answer (the race as it then stands) to the screen, which keeps the newest. */
export type Offer=(next:RaceFlowRead)=>void;
/** Someone else changed what this phone was writing, so the write was refused: their name, for the banner. */
export interface Changed { by:string|null }
/**
 * One race's writes in the race flow. Each answers with the race as it then stands. A write made on an older version
 * (someone changed the step meanwhile) is never stored: it comes back as `changed`, for "Tom Barker changed this a
 * moment ago" with Show latest. Any other refusal shows as `error`.
 */
export function useFlowWrite(raceId:string,offer:Offer) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[changed,setChanged]=useState<Changed|null>(null);
  /** Sends one write: the race once the server has it, 'refused' when the server said no, false when it could not be sent. */
  async function write(what:string,body:object):Promise<RaceFlowRead|false|'refused'> {
    setBusy(true);setError('');
    try {const answer=await api<RaceFlowRead>(`races/${raceId}/${what}`,body);offer(answer);setChanged(null);return answer;}
    catch(failure) {
      const body=failure instanceof ApiFailure?failure.body as {reason?:string;by?:string|null}:{};
      if(body.reason==='changed') setChanged({by:body.by??null});
      else setError(failure instanceof Error?failure.message:'Could not connect - please try again');
      return failure instanceof ApiFailure?'refused':false;
    } finally {setBusy(false);}
  }
  return {busy,error,setError,changed,clearChanged:()=>setChanged(null),write};
}
/**
 * One step's writes, latest wins (latestWins): each change sends the whole step with the part version last answered.
 * A change made while a write is on its way shows at once as `pending` and goes in the next write, so quick taps on a
 * slow link are never lost; each send resolves with the outcome of the write that carried it.
 */
export function useStepWrites<Body extends object>(write:ReturnType<typeof useFlowWrite>['write'],what:string,part:RacePartName,raceId:string,version:number) {
  const [pending,setPending]=useState<Body|null>(null),[sending,setSending]=useState(false);
  // The queue outlives renders, so it calls the latest write.
  const latest=useRef(write);latest.current=write;
  const queue=useRef<ReturnType<typeof latestWins<Body,RaceFlowRead>>|null>(null);
  queue.current??=latestWins<Body,RaceFlowRead>((body,seen)=>latest.current(what,{...body,raceId,version:seen}),answer=>answer.race.parts[part].version,()=>{setSending(false);setPending(null);});
  function send(body:Body) {
    setPending(body);setSending(true);
    return queue.current!(body,version);
  }
  return {pending,sending,send};
}
