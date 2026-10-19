import { useState,type ReactNode } from 'react';
import { ordinal } from '../../shared/ordinal.js';
import { currentRaceLabel,type RaceScreenRead } from '../../shared/race-screen.js';
import { runnersText } from '../../shared/races.js';
import { formatTime } from '../../shared/time-entry.js';
import { useLive } from '../live.js';
import './race.css';

/** A card opened and closed by its header, side arrow on the right. Closing only tidies this phone's screen. */
function RaceCard({title,status,children}:{title:string;status:string;children:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <section className="race-card">
    <button className="race-card-head" aria-expanded={open} onClick={()=>setOpen(!open)}>
      <span className="race-card-text"><span className="race-card-title">{title}</span><span className="race-card-status">{status}</span></span>
      <span className="race-card-arrow" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>
    </button>
    {open && <div className="race-card-body">{children}</div>}
  </section>;
}

/** The race screen: an event's current race, live from its stream. Read-only for now: the cards show the race as stored. */
export function RaceScreen({eventCode}:{eventCode:string}) {
  const {snapshot,error}=useLive<RaceScreenRead>(`live/race-screen/${encodeURIComponent(eventCode)}`);
  if(!snapshot) return error?<p role="alert">{error}</p>:<p>Opening…</p>;
  const {event,race}=snapshot,final=race.kind==='final';
  const runners=race.parts.runners.value||[],wristbands=new Map(runners.map(runner=>[runner.id,runner.wristband]));
  const order=race.parts.finish.value?.order||[],didNotFinish=race.parts.finish.value?.didNotFinish||[];
  const places=final?[]:race.parts.times.value?.places||[];
  const rows=Math.max(runners.length-didNotFinish.length,order.length,places.length),timed=places.filter(time=>time!==null).length;
  return <section className="race-screen">
    <div className="race-heading"><p className="race-line">{currentRaceLabel(race)} · {runnersText(runners.length)}</p><h1>{event.name} {event.section}</h1></div>
    <RaceCard title="Check-in Wristbands" status={runners.length?`${runners.length} in`:'Nobody yet'}>
      {runners.length?<ul className="race-chips" aria-label="Checked in">{runners.map(runner=><li key={runner.id}>{runner.wristband}</li>)}</ul>:<p className="race-empty">No runners checked in yet</p>}
    </RaceCard>
    <RaceCard title={final?'Finishing order':'Order and Times'} status={!order.length && !timed?'Nobody yet':final?`${order.length} placed`:`${order.length} placed · ${timed} ${timed===1?'time':'times'}`}>
      {runners.length?<table className="race-table" aria-label={final?'Finishing order':'Order and times'}>
        <thead><tr><th>Place</th><th>Wristband</th>{!final && <th>Time</th>}</tr></thead>
        <tbody>{Array.from({length:rows},(_,index)=><tr key={index}>
          <td>{ordinal(index+1)}</td><td>{order[index]===undefined?'':wristbands.get(order[index])}</td>
          {!final && <td>{places[index]==null?'':formatTime(places[index])}</td>}
        </tr>)}</tbody>
      </table>:<p className="race-empty">Places appear here once runners are checked in</p>}
      {didNotFinish.length>0 && <ul className="race-no-place" aria-label="No place">{didNotFinish.map(id=><li key={id}><strong>{wristbands.get(id)}</strong> Did not finish</li>)}</ul>}
    </RaceCard>
  </section>;
}
