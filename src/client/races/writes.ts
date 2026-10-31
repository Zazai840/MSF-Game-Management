import { useRef,useState } from 'react';
import { ApiFailure,StaleRequest,api } from '../api.js';
import type { RaceFlowRead } from '../../shared/race-flow.js';
import type { RacePartName } from '../../shared/races.js';
import { latestWins } from './latest-wins.js';
/**
 * A failed race-flow request in the race flow's words: the app's own reason when it refused (a number already in the race),
 * "Not saved" when it failed without one (500), and "Could not connect" when the phone never reached it (no network,
 * or the host's 502-504 while the app is down).
 */
export function failureLine(failure:unknown) {
  if(failure instanceof StaleRequest) return failure.message;
  if(!(failure instanceof ApiFailure) || failure.status>500) return 'Could not connect - try again';
  return failure.status===500?'Not saved - try again':failure.message;
}
/** Hands a write's answer (the race as it then stands) to the screen, which keeps the newest. */
export type Offer=(next:RaceFlowRead)=>void;
/** Someone else changed what this phone was writing, so the write was refused: their name, for the banner. */
export interface Changed { by:string|null }
/**
 * Writes whose answer is what the screen reads (a race, or the races list), handed to `offer`. A write made on an older
 * version (someone changed it meanwhile) is never stored: it comes back as `changed`, for "Tom Barker changed this a
 * moment ago" with Show latest. Any other refusal shows as `error`.
 */
export function useWrites<Answer>(offer:(next:Answer)=>void) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[changed,setChanged]=useState<Changed|null>(null);
  /** Sends one write to `path`: the answer once the server has it, 'refused' when the server said no, false when it could not be sent. */
  async function send(path:string,body:object):Promise<Answer|false|'refused'> {
    setBusy(true);setError('');
    try {const answer=await api<Answer>(path,body);offer(answer);setChanged(null);return answer;}
    catch(failure) {
      const body=failure instanceof ApiFailure?failure.body as {reason?:string;by?:string|null}:{};
      if(body.reason==='changed') setChanged({by:body.by??null});
      else setError(failureLine(failure));
      return failure instanceof ApiFailure?'refused':false;
    } finally {setBusy(false);}
  }
  return {busy,error,setError,changed,clearChanged:()=>setChanged(null),send,offer};
}
/**
 * One race's writes in the race flow, each answering with the race as it then stands: `write` under this race, and
 * `writeTeam` a relay team's Save at check-in (its legs, a drop on its grips), which answers with this race too.
 */
export function useFlowWrite(raceId:string,offer:Offer) {
  const writes=useWrites<RaceFlowRead>(offer);
  const write=(what:string,body:object)=>writes.send(`races/${raceId}/${what}`,body);
  const writeTeam=(eventId:string,teamId:string,body:object)=>writes.send(`relays/${eventId}/teams/${teamId}`,body);
  return {...writes,write,writeTeam};
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
