import { currentRaceLabel,type RaceScreenRead } from '../../shared/race-screen.js';
import { runnersText } from '../../shared/races.js';
import { useLive } from '../live.js';
import { CheckInCard } from './CheckIn.js';
import { OrderAndTimesCard } from './OrderAndTimes.js';
import './race.css';

/** The race screen: an event's current race, live from its stream, worked together. */
export function RaceScreen({eventCode,phoneId}:{eventCode:string;phoneId:string}) {
  const {snapshot,error,offer}=useLive<RaceScreenRead>(`live/race-screen/${encodeURIComponent(eventCode)}`);
  if(!snapshot) return error?<p role="alert">{error}</p>:<p>Opening…</p>;
  const {event,race}=snapshot;
  return <section className="race-screen">
    <div className="race-heading"><p className="race-line">{currentRaceLabel(race)} · {runnersText(race.parts.runners.value?.length||0)}</p><h1>{event.name} {event.section}</h1></div>
    {snapshot.stageComplete && <p role="status" className="warning-box">Stage complete - ask a lead</p>}
    <CheckInCard screen={snapshot} phoneId={phoneId} offer={offer}/>
    <OrderAndTimesCard screen={snapshot} phoneId={phoneId} offer={offer}/>
  </section>;
}
