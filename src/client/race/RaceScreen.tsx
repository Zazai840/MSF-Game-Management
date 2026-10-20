import { currentRaceLabel,type RaceScreenRead } from '../../shared/race-screen.js';
import { runnersText } from '../../shared/races.js';
import { useLive } from '../live.js';
import { CheckInCard } from './CheckIn.js';
import { OrderAndTimesCard } from './OrderAndTimes.js';
import { ResultsCard,SubmitDock } from './Submit.js';
import './race.css';

/**
 * The race screen: an event's current race, live from its stream, worked together. Once submitted, the cards give
 * way to its results. Once saved, the event's next race shows here with "Heat 1 saved" over it.
 */
export function RaceScreen({eventCode,phoneId}:{eventCode:string;phoneId:string}) {
  const {snapshot,error,offer}=useLive<RaceScreenRead>(`live/race-screen/${encodeURIComponent(eventCode)}`);
  if(!snapshot) return error?<p role="alert">{error}</p>:<p>Opening…</p>;
  const {event,race,lastSaved}=snapshot;
  const saved=race.state==='saved'?race:race.id===null && lastSaved?.kind===race.kind && lastSaved.number===race.number-1?lastSaved:null;
  return <section className="race-screen">
    <div className="race-heading"><p className="race-line">{currentRaceLabel(race)} · {runnersText(race.parts.runners.value?.length||0)}</p><h1>{event.name} {event.section}</h1></div>
    {snapshot.stageComplete && <p role="status" className="warning-box">Stage complete - ask a lead</p>}
    {saved && <p role="status" className="race-saved">{currentRaceLabel(saved)} saved</p>}
    {/* Hidden, not gone, while the results show: each card stays as this phone left it for the next race. */}
    <div className="race-cards" hidden={race.state!=='in progress'}>
      <CheckInCard screen={snapshot} phoneId={phoneId} offer={offer}/>
      <OrderAndTimesCard screen={snapshot} phoneId={phoneId} offer={offer}/>
    </div>
    {race.state!=='in progress' && <ResultsCard screen={snapshot} phoneId={phoneId} offer={offer}/>}
    {!snapshot.stageComplete && race.state!=='saved' && <SubmitDock screen={snapshot} phoneId={phoneId} offer={offer}/>}
  </section>;
}
