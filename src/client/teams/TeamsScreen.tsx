import { useEffect,useRef,useState } from 'react';
import { ApiFailure,api } from '../api.js';
import { ordinal } from '../../shared/ordinal.js';
import { currentRaceLabel,type HomeEvent,type HomeSnapshot,type Holder } from '../../shared/race-screen.js';
import { filledLegs,legRefusal,legWarnings,stillToRun,teamsStatus,unsavedRace,type RelayTeam,type TeamRelay } from '../../shared/teams.js';
import { useLive } from '../live.js';
import { digitsOnly } from '../flow/NumberEntry.js';
import { RaceCard } from '../race/RaceCard.js';
import { TakeOver } from '../race/Hold.js';
import '../race/race.css';
import './teams.css';

/** A relay as Home's snapshot carries it: with its team list and teams holder. */
type Relay=HomeEvent & {teams:RelayTeam[];teamsHolder:Holder|null};
/** What Done sends: the team and the version it opened (none for a new team), the four boxes in leg order (null when empty) and the wristbands whose warnings were kept. */
export interface Done { teamId?:string; version?:number; legs:Array<number|null>; keptWarnings:number[] }

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
  const finish=async(what:string,body:object)=>{if(await write(what,body)) setEditing(null);};
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
/**
 * A team read-only: "Team 3" ("3 of 4" under it when not complete, or "In heat 2" while an unsaved race holds it), then its
 * four wristbands, "-" for an empty box and amber for a kept warning.
 */
function TeamCells({team}:{team:RelayTeam}) {
  const filled=filledLegs(team),race=unsavedRace(team);
  return <><span className="team-name"><span>Team {team.number}</span>{race?<small>In {currentRaceLabel(race).toLowerCase()}</small>:filled<4 && <small className="is-short">{filled} of 4</small>}</span>
    {team.legs.map((leg,index)=><span key={index} className={`leg-ro${leg.wristband===null?' is-empty':''}${leg.warnings.length?' is-amber':''}`}>{leg.wristband??'-'}</span>)}</>;
}

/**
 * One team open for changing: its four boxes on the number keyboard, the first box the 1st leg, then Cancel and Done.
 * A number already in this team or another team of the relay is refused as it is typed (Fix number only); one that
 * looks wrong shows amber once its box is left, with Fix number or Keep. Done needs each fixed or kept. At check-in
 * the boxes sit `bare` under the team's own heading, without its name beside them.
 */
export function TeamEdit({team,relay,relays,busy,bare=false,onCancel,onDone,onRemove}:{team:RelayTeam|null;relay:TeamRelay;relays:readonly TeamRelay[];busy:boolean;bare?:boolean;onCancel:()=>void;onDone:(done:Done)=>void;onRemove?:(version:number)=>void}) {
  /** The version this team was opened at: Done and Remove send it, so a change made meanwhile refuses them. */
  const [version]=useState(team?.version),[removing,setRemoving]=useState(false);
  const [boxes,setBoxes]=useState(()=>(team?.legs.map(leg=>leg.wristband===null?'':String(leg.wristband))||['','','','']));
  const [kept,setKept]=useState(()=>team?.legs.flatMap(leg=>leg.wristband!==null && leg.warnings.length?[leg.wristband]:[])||[]);
  /** The box being typed in: its warnings wait until it is left. */
  const [typing,setTyping]=useState<number|null>(null);
  const inputs=useRef<Array<HTMLInputElement|null>>([]);
  const name=team?`Team ${team.number}`:'New team',legs=boxes.map(box=>box===''?null:Number(box));
  // Each box is checked against the boxes before it, so only the later of two equal numbers is refused.
  const refusals=legs.map((_,index)=>legRefusal(relay.teams,team?.id??null,legs.slice(0,index+1),index));
  const warnings=legs.map((number,index)=>number===null || refusals[index] || kept.includes(number)?[]:legWarnings(number,relay,relays));
  const amber=(index:number)=>Boolean(refusals[index]) || (typing!==index && warnings[index].length>0);
  const fix=(index:number)=>{setBoxes(current=>current.map((box,at)=>at===index?'':box));inputs.current[index]?.focus();};
  const ready=!busy && legs.some(number=>number!==null) && refusals.every(refusal=>!refusal) && warnings.every(list=>!list.length);
  return <div className="team-edit">
    <div className={`team-row${bare?' team-row-bare':''}`}>{!bare && <span className="team-name"><span>{name}</span></span>}
      {boxes.map((box,index)=><input key={index} ref={input=>{inputs.current[index]=input;}} className={`leg-box${amber(index)?' is-amber':''}`} type="text" inputMode="numeric" pattern="[0-9]*"
        autoComplete="off" enterKeyHint={index<3?'next':'done'} aria-label={`${name} ${ordinal(index+1)} leg`} value={box} autoFocus={index===Math.max(0,boxes.indexOf(''))}
        onFocus={()=>setTyping(index)} onBlur={()=>setTyping(null)} onChange={event=>{const digits=digitsOnly(event.target.value);setBoxes(current=>current.map((value,at)=>at===index?digits:value));}}
        onKeyDown={event=>{if(event.key!=='Enter' || event.nativeEvent.isComposing) return;event.preventDefault();if(index<3) inputs.current[index+1]?.focus();else event.currentTarget.blur();}}/>)}
    </div>
    {legs.map((number,index)=>refusals[index]?<div key={index} className="warning-box team-warn" role="alert"><p>{refusals[index]}</p><div className="warning-actions"><button onClick={()=>fix(index)}>Fix number</button></div></div>
      :amber(index)?<div key={index} className="warning-box team-warn" role="alert">{warnings[index].map(warning=><p key={warning.message}>{warning.message}</p>)}
        <div className="warning-actions"><button onClick={()=>fix(index)}>Fix number</button><button className="button-secondary" onClick={()=>setKept([...kept,number!])}>Keep</button></div></div>:null)}
    {removing?<div className="warning-box"><p>Remove {name}? Its number won't be used again.</p>
      <div className="warning-actions"><button disabled={busy} onClick={()=>onRemove!(version!)}>Remove</button><button className="button-secondary" onClick={()=>setRemoving(false)}>Cancel</button></div></div>
    :<div className="edit-actions"><button className="button-secondary" onClick={onCancel}>Cancel</button>
      <button disabled={!ready} onClick={()=>onDone({...(team?{teamId:team.id,version}:{}),legs,keptWarnings:kept.filter(number=>legs.includes(number))})}>Done</button></div>}
    {onRemove && !removing && <button className="button-quiet remove-team" onClick={()=>setRemoving(true)}>Remove team</button>}
  </div>;
}
