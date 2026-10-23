import { ordinal } from '../../shared/ordinal.js';
import type { RaceScreenRead } from '../../shared/race-screen.js';
import { isTeamEntry,type TeamEntry } from '../../shared/races.js';
import { changingName,filledLegs,stillToRun,teamCount,type RelayTeam } from '../../shared/teams.js';
import { RaceCard } from './RaceCard.js';
import { useRaceWrite,type Offer } from './Hold.js';

const here=(entry:TeamEntry)=>entry.legs.filter(leg=>leg.here).length;
/**
 * Check-in Teams on a relay heat (ADR 0002): anyone on the race screen works it, with no hold. One list of the relay's
 * teams still to run and the teams in this heat, by number: a tick puts a team in the heat on every phone, and a
 * ticked team opens to its four children in leg order, each tapped as here. Cancel takes a team just ticked off again.
 */
export function CheckInTeamsCard({screen,offer}:{screen:RaceScreenRead;offer:Offer}) {
  const {event,race,stageComplete}=screen,teams=screen.teams||[];
  const entries=(race.parts.runners.value||[]).filter(isTeamEntry),entryOf=(team:RelayTeam)=>entries.find(entry=>entry.team.id===team.id);
  const listed=teams.filter(team=>entryOf(team) || stillToRun(team));
  const {busy,error,write}=useRaceWrite(event.code,offer);
  const tap=(what:'tick'|'take-off'|'here',team:RelayTeam,body:object={})=>void write(what,{raceId:race.id,teamId:team.id,...body});
  const status=entries.length?`${teamCount(entries.length)} in · ${entries.reduce((sum,entry)=>sum+here(entry),0)} of ${entries.length*4} here`:stageComplete?'Nobody':'Nobody yet · open to start';
  return <RaceCard title="Check-in Teams" status={status}>
    {error && <p role="alert">{error}</p>}
    {!teams.length?<p className="race-empty">No teams yet. They are typed on the Teams screen at the prep area.</p>:<>
      {listed.length>0 && !stageComplete && <p className="race-hint">Tick the teams running {race.kind==='heat'?`heat ${race.number}`:'this race'}, then tap each child as they arrive.</p>}
      <div className="ci-list">{listed.map(team=>{
        const entry=entryOf(team),changer=changingName(team);
        if(!entry) return <div key={team.id} className="ci-pick">
          <button className="ci-row" aria-pressed="false" disabled={busy || stageComplete || Boolean(changer)} onClick={()=>tap('tick',team)}>
            <span className="ci-tick" aria-hidden="true"/>
            <span className="ci-row-text"><strong>Team {team.number}</strong><span>{team.legs.map(leg=>leg.wristband??'-').join(' · ')}{filledLegs(team)<4 && ` · ${filledLegs(team)} of 4`}</span></span>
          </button>
          {changer && <p className="race-hint">{changer} is changing this team</p>}
        </div>;
        const count=here(entry),short=count>0 && count<4;
        return <div key={team.id} className="ci-team in-list">
          <div className="ci-head">
            <span className="ci-tick is-ticked" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
            <span className="ci-row-text"><strong>Team {team.number}</strong><span className={short?'is-short':undefined}>{count} of 4 here</span></span>
            {count===0 && !stageComplete && <button className="button-quiet" disabled={busy} aria-label={`Cancel Team ${team.number}`} onClick={()=>tap('take-off',team)}>Cancel</button>}
          </div>
          <div className="ci-legrows">{entry.legs.map((leg,index)=>leg.wristband===null
            ?<div key={index}><span className="ci-leg-n">{ordinal(index+1)}</span><span className="ci-leg-w is-empty">-</span></div>
            :<button key={index} aria-pressed={leg.here} disabled={stageComplete} onClick={()=>tap('here',team,{leg:index,here:!leg.here})}>
              <span className="ci-leg-n">{ordinal(index+1)}</span><span className="ci-leg-w">{leg.wristband}</span><span className="ci-leg-here">{leg.here?'Here':'Tap when here'}</span>
            </button>)}</div>
          {changer && <p className="race-hint">{changer} is changing this team</p>}
          {short && <p className="ci-short">{count} of 4 here. A team can run short: a lead sees it in To check.</p>}
        </div>;
      })}</div>
      {!teams.some(team=>stillToRun(team) && !entryOf(team)) && <p className="race-hint">Every other team has run.</p>}
    </>}
  </RaceCard>;
}
