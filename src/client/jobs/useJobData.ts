import { useCallback,useEffect,useRef,useState } from 'react';
import { api,phoneStorage,StaleRequest } from '../api.js';
import type { RaceRead } from '../../shared/races.js';
import { clock } from '../../shared/clock.js';
/** Keep the originally opened version while saving drafts only in their session. */
export function useJobDraft<T>(dayId:string,job:string,restore:(key:string)=>T) {
  const [identity]=useState(()=>({session:phoneStorage.session(),key:`msf:draft:${phoneStorage.token()}:${dayId}:${job}`}));
  const [draft,setDraft]=useState<T>(()=>restore(identity.key));
  useEffect(()=>{
    if(identity.session!==phoneStorage.session()) return;
    if(draft===null) localStorage.removeItem(identity.key);else localStorage.setItem(identity.key,JSON.stringify(draft));
  },[draft,identity]);
  return [draft,setDraft] as const;
}
/** Poll only while mounted and visible; stale work never publishes a new draft. */
export function useJobData<T>(path:string,onRead?:(next:T)=>void) {
  const [data,setData]=useState<T|null>(null),[readError,setReadError]=useState(''),[updated,setUpdated]=useState('');
  const mounted=useRef(false),read=useRef(onRead);read.current=onRead;
  const refresh=useCallback(async()=>{
    try {
      const next=await api<T>(path);if(!mounted.current) return;
      setData(next);setUpdated(clock());setReadError('');read.current?.(next);
    } catch(error) {if(mounted.current && !(error instanceof StaleRequest)) setReadError(error instanceof Error?error.message:'Could not connect');}
  },[path]);
  useEffect(()=>{
    mounted.current=true;void refresh();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);
    return()=>{mounted.current=false;clearInterval(timer);};
  },[refresh]);
  return {data,readError,updated,refresh};
}
/** Shared race selection; the three jobs retain their own entry workflows. */
export function useRaceJob<T extends {waiting:RaceRead[]},D>(dayId:string,job:string,restore:(key:string)=>D|null,fromRace:(race:RaceRead)=>D) {
  const [draft,setDraft]=useJobDraft(dayId,job,restore);
  const reading=useJobData<T>(`jobs/${job}`,next=>setDraft(current=>current || (next.waiting[0]?fromRace(next.waiting[0]):null)));
  const [choosing,setChoosing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function open(race:RaceRead) {
    setBusy(true);
    try {const latest=await api<RaceRead>(`races/${race.id}`);if(!mounted.current) return;setDraft(fromRace(latest));setError('');setChoosing(false);}
    catch(error) {if(mounted.current && !(error instanceof StaleRequest)) setError(error instanceof Error?error.message:'Could not open race');}
    finally {if(mounted.current) setBusy(false);}
  }
  return {...reading,draft,setDraft,choosing,setChoosing,busy,setBusy,error,setError,open};
}
