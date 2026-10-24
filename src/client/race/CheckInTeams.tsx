import { useEffect,useState } from 'react';
import { api } from '../api.js';
import { ordinal } from '../../shared/ordinal.js';
import type { RaceScreenRead } from '../../shared/race-screen.js';
import { isTeamEntry,type TeamEntry } from '../../shared/races.js';
import { changingName,filledLegs,stillToRun,teamCount,type RelayTeam } from '../../shared/teams.js';
import { RaceCard } from './RaceCard.js';
import { useRaceWrite,type Offer } from './Hold.js';
import { ChangeAnyway,TeamEdit,type Done } from '../teams/TeamsScreen.js';

const here=(entry:TeamEntry)=>entry.legs.filter(leg=>leg.here).length;
/**
 * Check-in Teams on a relay heat (ADR 0002): anyone on the race screen works it, with no hold. One list of the relay's
 * teams still to run and the teams in this heat, by number: a tick puts a team in the heat on every phone, and a
 * ticked team opens to its four children in leg order, each tapped as here. Cancel takes a team just ticked off again.
 * Edit opens a ticked team's four boxes, as on the Teams screen: Done changes it in this race and on its team list.
 * On a Final the seeded teams are already ticked, each labelled "1st seed", "Called up" or "Added", with Absent in
 * place of Cancel: Absent frees the team's seed, and tapping the team again brings it back.
 */
export function CheckInTeamsCard({screen,phoneId,offer}:{screen:RaceScreenRead;phoneId:string;offer:Offer}) {
  const {event,race,stageComplete}=screen,teams=screen.teams||[];
  const entries=(race.parts.runners.value||[]).filter(isTeamEntry),entryOf=(team:RelayTeam)=>entries.find(entry=>entry.team.id===team.id);
  const final=race.kind==='final'?race.final:undefined;
  // A Final's line-up is its seeded teams, those a lead called up or added, Absent ones included; a heat's is the teams in it or still to run.
  const listed=final?final.entries.flatMap(item=>{const team=teams.find(other=>other.id===item.team?.id);return team?[{team,label:item.calledUp?'Called up':item.seed===null?'Added':`${ordinal(item.seed)} seed`}]:[];})
    :teams.filter(team=>entryOf(team) || stillToRun(team)).map(team=>({team,label:null}));
  const {busy,error,write}=useRaceWrite(event.code,offer);
  const tap=(what:'tick'|'take-off'|'here'|'absent-team',team:RelayTeam,body:object={})=>void write(what,{raceId:race.id,teamId:team.id,...body});
  /** The team this phone has open in an Edit, and the team someone else has open that it asks to change anyway. */
  const [editing,setEditing]=useState<string|null>(null),[asking,setAsking]=useState<string|null>(null);
  // Clears this phone's mark without touching the card's refusal: a mark that moved on is left alone by the server.
  const release=(teamId:string)=>void api<RaceScreenRead>(`race-screen/${encodeURIComponent(event.code)}/edit-cancel`,{teamId}).then(offer,()=>{});
  // A team taken off the race while open here closes, and its mark goes.
  useEffect(()=>{if(editing && !entries.some(entry=>entry.team.id===editing)) {release(editing);setEditing(null);}});
  async function edit(team:RelayTeam,changeAnyway=false) {
    setAsking(null);
    if(typeof await write('edit-open',{raceId:race.id,teamId:team.id,changeAnyway})==='object') setEditing(team.id);
  }
  // A refused Done closes the team too: it shows the server's copy, to check and open again.
  async function done(team:RelayTeam,body:Done) {
    const answer=await write('edit-done',{raceId:race.id,...body});
    if(answer) setEditing(null);
    if(answer==='refused') release(team.id);
  }
  const status=entries.length?`${teamCount(entries.length)} in · ${entries.reduce((sum,entry)=>sum+here(entry),0)} of ${entries.length*4} here`:stageComplete?'Nobody':'Nobody yet · open to start';
  return <RaceCard title="Check-in Teams" status={status}>
    {error && <p role="alert">{error}</p>}
    {!teams.length?<p className="race-empty">No teams yet. They are typed on the Teams screen at the prep area.</p>:<>
      {listed.length>0 && !stageComplete && <p className="race-hint">{final?"The seeded teams are in. Tap each child as they arrive, or Absent for a team that isn't here.":`Tick the teams running ${race.kind==='heat'?`heat ${race.number}`:'this race'}, then tap each child as they arrive.`}</p>}
      <div className="ci-list">{listed.map(({team,label})=>{
        const entry=entryOf(team),changer=changingName(team);
        if(!entry && label) return <div key={team.id} className="ci-pick">
          <button className="ci-row is-absent" aria-pressed="false" disabled={busy || stageComplete} onClick={()=>tap('absent-team',team,{absent:false})}>
            <span className="ci-tick" aria-hidden="true"/>
            <span className="ci-row-text"><strong>Team {team.number}</strong><span>{label} · Absent · tap if here</span></span>
          </button>
        </div>;
        if(!entry) return <div key={team.id} className="ci-pick">
          <button className="ci-row" aria-pressed="false" disabled={busy || stageComplete || Boolean(changer)} onClick={()=>tap('tick',team)}>
            <span className="ci-tick" aria-hidden="true"/>
            <span className="ci-row-text"><strong>Team {team.number}</strong><span>{team.legs.map(leg=>leg.wristband??'-').join(' · ')}{filledLegs(team)<4 && ` · ${filledLegs(team)} of 4`}</span></span>
          </button>
          {changer && <p className="race-hint">{changer} is changing this team</p>}
        </div>;
        const count=here(entry),short=count>0 && count<4,open=editing===team.id,by=team.changing && team.changing.id!==phoneId?changer:null;
        return <div key={team.id} className="ci-team in-list">
          <div className="ci-head">
            <span className="ci-tick is-ticked" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
            <span className="ci-row-text"><strong>Team {team.number}</strong>{label && <span>{label}</span>}<span className={short?'is-short':undefined}>{count} of 4 here</span></span>
            {label && !stageComplete && !open && <button className="button-quiet" disabled={busy} aria-label={`Team ${team.number} Absent`} onClick={()=>tap('absent-team',team,{absent:true})}>Absent</button>}
            {!label && count===0 && !stageComplete && !open && <button className="button-quiet" disabled={busy} aria-label={`Cancel Team ${team.number}`} onClick={()=>tap('take-off',team)}>Cancel</button>}
            {!stageComplete && editing===null && <button className="button-quiet" disabled={busy} aria-label={`Edit Team ${team.number}`} onClick={()=>by?setAsking(team.id):void edit(team)}>Edit</button>}
          </div>
          {open?<TeamEdit team={team} relay={{...event,teams}} relays={screen.relays||[]} busy={busy} bare
            onCancel={()=>{void write('edit-cancel',{teamId:team.id});setEditing(null);}} onDone={body=>void done(team,body)}/>
          :<div className="ci-legrows">{entry.legs.map((leg,index)=>leg.wristband===null
            ?<div key={index}><span className="ci-leg-n">{ordinal(index+1)}</span><span className="ci-leg-w is-empty">-</span></div>
            :<button key={index} aria-pressed={leg.here} disabled={stageComplete} onClick={()=>tap('here',team,{leg:index,here:!leg.here})}>
              <span className="ci-leg-n">{ordinal(index+1)}</span><span className="ci-leg-w">{leg.wristband}</span><span className="ci-leg-here">{leg.here?'Here':'Tap when here'}</span>
            </button>)}</div>}
          {by && asking!==team.id && <p className="race-hint">{by} is changing this team</p>}
          {by && asking===team.id && <ChangeAnyway by={by} busy={busy} onConfirm={()=>void edit(team,true)} onCancel={()=>setAsking(null)}/>}
          {short && <p className="ci-short">{count} of 4 here. A team can run short: a lead sees it in To check.</p>}
        </div>;
      })}</div>
      {!final && !teams.some(team=>stillToRun(team) && !entryOf(team)) && <p className="race-hint">Every other team has run.</p>}
    </>}
  </RaceCard>;
}
