import { useState } from 'react';
import type { LeadRaceRead } from '../../shared/lead-results.js';
import { isTeamEntry,raceLabel,type TeamEntry } from '../../shared/races.js';
import { stillToRun,type RelayTeam,type TeamList } from '../../shared/teams.js';
import { TeamCells,TeamEdit } from './TeamEdit.js';
import './race-page.css';
/** One team of the race as Correct teams sends it: kept as it is, its four children corrected, or added from the team list. */
type TeamChoice={entryId:string;legs?:Array<number|null>}|{teamId:string};
/** A team in the race as the team editor reads a team: its four children as they ran in this race. */
const asTeam=(entry:TeamEntry):RelayTeam=>({id:entry.team.id,number:entry.team.number,legs:entry.legs,version:0,changedBy:null,changing:null,races:[]});
/**
 * Correct teams, a relay race's "Correct runner list": tap a team to correct its four children (they keep the team's
 * place and time, and on the team's latest race the teams sheet changes too), take a team off the race (it is still to
 * run again) or add a team still to run. Each change saves at once, checked as the teams sheet checks a team.
 */
export function RaceTeamsEditor({race,teams,relays,busy,onSave,onClose}:{race:LeadRaceRead['race'];teams:readonly RelayTeam[];relays:readonly TeamList[];busy:boolean;onSave:(body:unknown)=>Promise<void>;onClose:()=>void}) {
  const entries=(race.parts.runners.value||[]).filter(isTeamEntry),label=raceLabel(race);
  const [editing,setEditing]=useState<string|null>(null),[removing,setRemoving]=useState<string|null>(null),[adding,setAdding]=useState(false);
  const relay={code:race.event.code,name:race.event.name,section:race.event.section,teams},available=teams.filter(stillToRun);
  const kept:TeamChoice[]=entries.map(entry=>({entryId:entry.id}));
  async function save(next:TeamChoice[],keptWarnings:number[]=[]) {
    setEditing(null);setRemoving(null);setAdding(false);
    await onSave({baseVersion:race.parts.runners.version,finishVersion:race.parts.finish.version,teams:next,keptWarnings});
  }
  return <div className="sheet-stack">
    <p className="sheet-hint">Tap a team to correct its children: the team keeps its place and time. On the team's latest race, the teams sheet changes too.</p>
    <ol className="lead-team-rows" aria-label="Teams">{entries.map(entry=>{
      const name=`Team ${entry.team.number}`;
      return <li key={entry.id}>{editing===entry.id?<TeamEdit team={asTeam(entry)} relay={relay} relays={relays} busy={busy} onCancel={()=>setEditing(null)}
        onDone={done=>void save(entries.map(other=>other===entry?{entryId:other.id,legs:done.legs}:{entryId:other.id}),done.keptWarnings)}/>
      :removing===entry.id?<div className="warning-box"><p>Take {name} off {label}? It is still to run again.</p>
        <div className="warning-actions"><button disabled={busy} onClick={()=>void save(kept.filter(item=>'entryId' in item && item.entryId!==entry.id))}>Take off</button><button className="button-secondary" onClick={()=>setRemoving(null)}>Keep {name}</button></div></div>
      :<div className="lead-team-row"><button type="button" className="team-row team-row-tap" disabled={busy || editing!==null} aria-label={`Change ${name}`} onClick={()=>setEditing(entry.id)}><TeamCells team={asTeam(entry)}/></button>
        <button type="button" className="lead-remove" disabled={busy || editing!==null} aria-label={`Take ${name} off ${label}`} onClick={()=>setRemoving(entry.id)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>}</li>;
    })}</ol>
    {entries.length===0 && <p className="sheet-hint">No teams</p>}
    {adding?<div className="sheet-stack"><p><strong>Add a team still to run</strong></p>
      {available.map(team=><button key={team.id} type="button" className="team-row team-row-tap" disabled={busy} aria-label={`Add Team ${team.number}`} onClick={()=>void save([...kept,{teamId:team.id}])}><TeamCells team={team}/></button>)}
      {!available.length && <p className="sheet-hint">Every team has run.</p>}
      <button className="button-secondary" onClick={()=>setAdding(false)}>Cancel</button></div>
    :editing===null && <button type="button" className="button-secondary" disabled={busy} onClick={()=>setAdding(true)}>+ Add team</button>}
    {editing===null && <button className="button-secondary" disabled={busy} onClick={onClose}>Done</button>}
  </div>;
}
