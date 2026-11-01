import { useEffect,useId,useRef,useState } from 'react';
import { api } from '../api.js';
import { clock } from '../../shared/clock.js';
import { raceLabel,replacedByRerun,runnersText,type RaceRead } from '../../shared/races.js';
import { Callout,Icon } from '../races/parts.js';
/** Rows that each open a race: "Open Heat 1" named, with its meta line read as the row's description. */
export function RaceRows({rows,onRace}:{rows:ReadonlyArray<{id:string;label:string;meta:string}>;onRace:(id:string)=>void}) {
  const id=useId();
  return <ul className="rz-list">{rows.map((row,index)=><li key={row.id}><button type="button" className="rz-listrow" aria-label={row.label} aria-describedby={`${id}-${index}`} onClick={()=>onRace(row.id)}>
    <span className="rz-listrow__main"><span className="rz-listrow__label">{row.label}</span><span className="rz-listrow__meta" id={`${id}-${index}`}>{row.meta}</span></span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>;
}
/** An event's deleted races, newest first, each opening its race page and named with when it was deleted (none for a race deleted before the time was kept). */
export function DeletedRaces({eventCode,onOpen}:{eventCode:string;onOpen:(id:string)=>void}) {
  const [races,setRaces]=useState<RaceRead[]|null>(null),[error,setError]=useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {const races=await api<RaceRead[]>(`lead/events/${encodeURIComponent(eventCode)}/deleted-races`);if(generation===request.current){setRaces(races);setError('');}}
    catch(error) {if(generation===request.current) setError(error instanceof Error?error.message:'Could not open Deleted races');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>{request.current++;clearInterval(timer);};},[eventCode]);
  if(error) return <Callout message={error}/>;
  if(!races) return <p className="rz-empty">Opening…</p>;
  if(!races.length) return <p className="rz-empty">Deleted races appear here when a lead deletes a race.</p>;
  return <RaceRows rows={races.map(race=>({id:race.id,label:`Open deleted ${raceLabel(race)}${race.deletedAt?` · deleted ${clock(race.deletedAt)}`:''}`,meta:[replacedByRerun(race),runnersText(race.parts.runners.value?.length??0)].filter(Boolean).join(' · ')}))} onRace={onOpen}/>;
}
