import { useEffect,useState } from 'react';
import { ApiFailure,api } from '../api.js';
import type { HomeEvent,HomeSnapshot,Holder } from '../../shared/race-screen.js';
import { stillToRun,teamsStatus,unsavedRace,type RelayTeam } from '../../shared/teams.js';
import { useLive } from '../live.js';
import { RaceCard } from '../race/RaceCard.js';
import { TakeOver } from '../race/Hold.js';
import '../race/race.css';
import { TeamCells,TeamEdit,type Done } from '../lead/TeamEdit.js';

/** A relay as Home's snapshot carries it: with its team list and teams holder. */
type Relay=HomeEvent & {teams:RelayTeam[];teamsHolder:Holder|null};

/**
 * The Teams screen: every switched-on relay's team list, live from Home's day-wide stream, one card per relay grouped
 * as on the Relays tab. Opening a card takes its teams hold when nobody has it; everyone else sees it read-only, with
 * Take over. The holder taps a team (or + Add team) to change its four boxes, and Done saves them on every phone.
 */
export function TeamsScreen({phoneId}:{phoneId:string}) {
  const {snapshot,error,offer}=useLive<HomeSnapshot>('live/home');
  if(!snapshot) return error?<p role="alert">{error}</p>:<p>Opening…</p>;
  const relays=snapshot.events.filter(event=>event.relay) as Relay[];
  return <section className="race-screen">
    <div className="teams-head"><h1>Teams</h1><p className="race-hint">Type each child's wristband in running order, 1st leg first. Other phones see a team once you tap Done.</p></div>
    {error && <p role="status" className="calm-note">{error}</p>}
    {[...new Set(relays.map(relay=>relay.name))].map(name=><section className="teams-group" key={name} aria-label={name}><h2>{name}</h2>
      {relays.filter(relay=>relay.name===name).map(relay=><RelayCard key={relay.code} relay={relay} relays={relays} phoneId={phoneId} offer={offer}/>)}
    </section>)}
  </section>;
}

/** One relay's Teams writes. Each answers with Home as it then stands; a refusal shows on the card. Answers true once the server has it, 'refused' when it said no, false when it could not be sent. */
function useTeamsWrite(code:string,offer:(next:HomeSnapshot)=>void) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function write(what:string,body:object):Promise<boolean|'refused'> {
    setBusy(true);setError('');
    try {offer(await api<HomeSnapshot>(`teams/${encodeURIComponent(code)}/${what}`,body));return true;}
    catch(failure) {setError(failure instanceof Error?failure.message:'Could not connect - please try again');return failure instanceof ApiFailure?'refused':false;}
    finally {setBusy(false);}
  }
  return {busy,error,write};
}

function RelayCard({relay,relays,phoneId,offer}:{relay:Relay;relays:Relay[];phoneId:string;offer:(next:HomeSnapshot)=>void}) {
  const holder=relay.teamsHolder,mine=!holder || holder.id===phoneId;
  const {busy,error,write}=useTeamsWrite(relay.code,offer);
  /** The team this phone is changing ('new' for + Add team), and the team someone else is changing that it asks to change anyway. */
  const [editing,setEditing]=useState<string|null>(null),[asking,setAsking]=useState<string|null>(null);
  // Once someone takes over the teams, this phone's open team closes: the server cleared its mark.
  useEffect(()=>{if(!mine) {setEditing(null);setAsking(null);}},[mine]);
  const open=mine?editing:null;
  async function change(team:RelayTeam,changeAnyway=false) {
    setAsking(null);
    if(await write('open',{teamId:team.id,changeAnyway})===true) setEditing(team.id);
  }
  // A refused Done or Remove closes the team: its row shows the server's copy, to check and open again.
  const finish=async(what:string,body:Done|{teamId:string;version:number})=>{
    const result=await write(what,body);
    if(result==='refused' && body.teamId) void api<HomeSnapshot>(`teams/${encodeURIComponent(relay.code)}/cancel`,{teamId:body.teamId}).then(offer).catch(()=>{});
    if(result) setEditing(null);
  };
  const edit=(team:RelayTeam|null)=><TeamEdit key={team?.id||'new'} team={team} relay={relay} relays={relays} busy={busy}
    onCancel={()=>{if(team) void write('cancel',{teamId:team.id});setEditing(null);}} onDone={done=>void finish('done',done)} onRemove={team && stillToRun(team)?version=>void finish('remove',{teamId:team.id,version}):undefined}/>;
  return <RaceCard title={relay.section} status={teamsStatus(relay,phoneId)} onOpen={()=>{if(!holder) void write('hold',{});}}>
    {error && <p role="alert">{error}</p>}
    {holder && !mine && <div className="relay-who"><span><strong>{holder.name}</strong> is entering. You see it read-only.</span>
      <TakeOver job="teams" holder={holder.name} busy={busy} onConfirm={()=>void write('take-over',{})}/></div>}
    {mine && open===null && relay.teams.some(team=>!unsavedRace(team)) && <p className="race-hint">Tap a team to change it.</p>}
    {relay.teams.map(team=>{
      if(open===team.id) return edit(team);
      const by=team.changing && team.changing.id!==phoneId?team.changing.name:null;
      return <div key={team.id} className="team-item">
        {mine && open===null && !unsavedRace(team)?<button className="team-row team-row-tap" aria-label={`Change Team ${team.number}`} disabled={busy} onClick={()=>by?setAsking(team.id):void change(team)}><TeamCells team={team}/></button>
          :<div className="team-row"><TeamCells team={team}/></div>}
        {by && asking!==team.id && <p className="race-hint">{by} is changing this team</p>}
        {by && asking===team.id && mine && <ChangeAnyway by={by} busy={busy} onConfirm={()=>void change(team,true)} onCancel={()=>setAsking(null)}/>}
      </div>;
    })}
    {open==='new' && edit(null)}
    {mine && open===null && <button className="button-secondary button-small add-team" onClick={()=>setEditing('new')}>+ Add team</button>}
  </RaceCard>;
}

/** The confirm before changing a team someone else has open: their mark moves to this phone, and their Done is refused. */
export function ChangeAnyway({by,busy,onConfirm,onCancel}:{by:string;busy:boolean;onConfirm:()=>void;onCancel:()=>void}) {
  return <div className="warning-box"><p>{by} is changing this team. Change it anyway? Their changes will be lost.</p>
    <div className="warning-actions"><button disabled={busy} onClick={onConfirm}>Change anyway</button><button className="button-secondary" onClick={onCancel}>Cancel</button></div></div>;
}
