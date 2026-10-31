import { useEffect,useRef,useState } from 'react';
import { api } from '../api.js';
import { clock } from '../../shared/clock.js';
import { raceLabel,replacedByRerun,type RaceRead } from '../../shared/races.js';
export function DeletedRaces({eventCode,onOpen}:{eventCode:string;onOpen:(id:string)=>void}) {
  const [races,setRaces]=useState<RaceRead[]|null>(null),[error,setError]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const races=await api<RaceRead[]>(`lead/events/${encodeURIComponent(eventCode)}/deleted-races`);if(generation===request.current){setRaces(races);setError('');}}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not open Deleted races');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>{request.current++;clearInterval(timer);};},[eventCode]);
  return <section><h3>Deleted races</h3>{error && <p role="alert">{error}</p>}{races===null?<p>Opening Deleted races…</p>:races.length===0?<p>No deleted races</p>:<div className="race-action-choices">{races.map(race=><button key={race.id} onClick={()=>onOpen(race.id)}>Open deleted {raceLabel(race)}{race.deletedAt?` · deleted ${clock(race.deletedAt)}`:''}{replacedByRerun(race)?` · ${replacedByRerun(race)}`:''}</button>)}</div>}</section>;
}
