import { ordinal } from '../../shared/ordinal.js';
import { currentRaceLabel,type RaceScreenRead } from '../../shared/race-screen.js';
import { runnersText } from '../../shared/races.js';
import { formatTime } from '../../shared/time-entry.js';
import { useLive } from '../live.js';
import { CheckInCard } from './CheckIn.js';
import { RaceCard } from './RaceCard.js';
import './race.css';

/** The race screen: an event's current race, live from its stream, worked together. Order and Times is read-only for now. */
export function RaceScreen({eventCode,phoneId}:{eventCode:string;phoneId:string}) {
  const {snapshot,error,offer}=useLive<RaceScreenRead>(`live/race-screen/${encodeURIComponent(eventCode)}`);
  if(!snapshot) return error?<p role="alert">{error}</p>:<p>Opening…</p>;
  const {event,race}=snapshot,final=race.kind==='final';
  const runners=race.parts.runners.value||[],wristbands=new Map(runners.map(runner=>[runner.id,runner.wristband]));
  const order=race.parts.finish.value?.order||[],didNotFinish=race.parts.finish.value?.didNotFinish||[];
  const places=final?[]:race.parts.times.value?.places||[];
  const rows=Math.max(runners.length-didNotFinish.length,order.length,places.length),timed=places.filter(time=>time!==null).length;
  return <section className="race-screen">
    <div className="race-heading"><p className="race-line">{currentRaceLabel(race)} · {runnersText(runners.length)}</p><h1>{event.name} {event.section}</h1></div>
    {snapshot.stageComplete && <p role="status" className="warning-box">Stage complete - ask a lead</p>}
    <CheckInCard screen={snapshot} phoneId={phoneId} offer={offer}/>
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
