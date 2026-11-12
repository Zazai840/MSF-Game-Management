import { useId,type ReactNode } from 'react';
import { usePolledRead } from '../live.js';
import { clock } from '../../shared/clock.js';
import { raceLabel,replacedByRerun,runnersText,type RaceRead } from '../../shared/races.js';
import { ErrorCallout,Icon } from '../races/parts.js';
/** Rows that each open a race: "Open Heat 1" named, with its meta line, and `more` under it, read as the row's description. */
export function RaceRows({rows,onRace}:{rows:ReadonlyArray<{id:string;label:string;meta:string;more?:ReactNode}>;onRace:(id:string)=>void}) {
  const id=useId();
  return <ul className="rz-list">{rows.map((row,index)=><li key={row.id}><button type="button" className="rz-listrow" aria-label={row.label} aria-describedby={`${id}-${index}${row.more?` ${id}-${index}-more`:''}`} onClick={()=>onRace(row.id)}>
    <span className={row.more?'rz-listrow__main rz-listrow__main--wide':'rz-listrow__main'}><span className="rz-listrow__label">{row.label}</span><span className="rz-listrow__meta" id={`${id}-${index}`}>{row.meta}</span>
      {row.more && <span className="rz-listrow__more" id={`${id}-${index}-more`}>{row.more}</span>}</span><Icon name="chevron-right" className="rz-icon--bold"/></button></li>)}</ul>;
}
/** Deleted races, heading and list, only when the event has one: an event's deleted races, newest first, each opening its race page and named with when it was deleted (none for a race deleted before the time was kept); a no-break space keeps "deleted 10:42" on one line. */
export function DeletedRaces({eventCode,onOpen}:{eventCode:string;onOpen:(id:string)=>void}) {
  const {read:races,error}=usePolledRead<RaceRead[]>(`lead/events/${encodeURIComponent(eventCode)}/deleted-races`);
  if(error!==null) return <ErrorCallout error={error} action="read"/>;
  if(!races?.length) return null;
  return <><h2 className="rz-section">Deleted races</h2><RaceRows rows={races.map(race=>({id:race.id,label:`Open deleted ${raceLabel(race)}${race.deletedAt?` · deleted\u00a0${clock(race.deletedAt)}`:''}`,meta:[replacedByRerun(race),runnersText(race.parts.runners.value?.length??0)].filter(Boolean).join(' · ')}))} onRace={onOpen}/></>;
}
