import { currentRaceLabel,type RaceScreenRead } from '../../shared/race-screen.js';
import { decidedWithoutFinalLine } from '../../shared/event-state.js';
import { raceFinishedLine } from '../../shared/race-flow.js';
import { runnersText } from '../../shared/races.js';
import { teamCount } from '../../shared/teams.js';
import { useLive } from '../live.js';
import { CheckInCard } from './CheckIn.js';
import { CheckInTeamsCard } from './CheckInTeams.js';
import { OrderAndTimesCard } from './OrderAndTimes.js';
import { ResultsCard,SubmitDock } from './Submit.js';
import './race.css';

/**
 * The race screen: an event's current race, live from its stream, worked together. Once submitted, the cards give
 * way to its results. Once saved, the event's next race shows here with "Heat 1 saved" over it.
 */
export function RaceScreen({eventCode,phoneId,lead}:{eventCode:string;phoneId:string;lead:boolean}) {
  const {snapshot,error,offer}=useLive<RaceScreenRead>(`live/race-screen/${encodeURIComponent(eventCode)}`);
  if(!snapshot) return error?<p role="alert">{error}</p>:<p>Opening…</p>;
  const {event,race,lastSaved}=snapshot;
  const entries=race.parts.runners.value?.length||0;
  const saved=race.state==='saved'?race:race.id===null && lastSaved?.kind===race.kind && lastSaved.number===race.number-1?lastSaved:null;
  return <section className="race-screen">
    <div className="race-heading"><p className="race-line">{snapshot.decidedWithoutFinal?decidedWithoutFinalLine:`${currentRaceLabel(race)} · ${event.relay?teamCount(entries):runnersText(entries)}`}</p><h1>{event.name} {event.section}</h1></div>
    {error && <p role="status" className="calm-note">{error}</p>}
    {snapshot.stageComplete && <p role="status" className="warning-box">{raceFinishedLine({kind:snapshot.race.kind,event:snapshot.event})}</p>}
    {/* Decided without a final, the event has no further heat or final to offer. */}
    {!snapshot.decidedWithoutFinal && <>
      {saved && <p role="status" className="race-saved">{currentRaceLabel(saved)} saved</p>}
      {/* Hidden, not gone, while the results show: each card stays as this phone left it for the next race. */}
      <div className="race-cards" hidden={race.state!=='in progress'}>
        {event.relay?<CheckInTeamsCard screen={snapshot} phoneId={phoneId} offer={offer}/>:<CheckInCard screen={snapshot} phoneId={phoneId} offer={offer}/>}
        <OrderAndTimesCard screen={snapshot} phoneId={phoneId} offer={offer}/>
      </div>
      {race.state!=='in progress' && <ResultsCard screen={snapshot} phoneId={phoneId} offer={offer}/>}
      {!snapshot.stageComplete && race.state!=='saved' && <SubmitDock screen={snapshot} phoneId={phoneId} lead={lead} offer={offer}/>}
    </>}
  </section>;
}
