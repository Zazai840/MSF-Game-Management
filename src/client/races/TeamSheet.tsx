import { useEffect,useId,useState,type ReactNode } from 'react';
import { ordinal } from '../../shared/ordinal.js';
import { changedLine,type RaceFlowRead,type RaceGroup,type RacesRead } from '../../shared/race-flow.js';
import { legsText,stillToRun,teamListOf,teamState,teamsSheetLine,type RelayTeam,type TeamList } from '../../shared/teams.js';
import { api } from '../api.js';
import { digitsOnly } from '../flow/NumberEntry.js';
import { SortableList } from '../flow/SortableList.js';
import { Callout,Icon,Sheet } from './parts.js';
import { useTeamDraft,type TeamDraft } from './team-draft.js';
import { useWrites } from './writes.js';
/** What the sheet shows: the list, a team's leg boxes (Edit), New team's, or the Change anyway question over the list. */
type Mode={kind:'list'}|{kind:'new'}|{kind:'edit';teamId:string}|{kind:'asking';teamId:string};
/**
 * A relay's teams sheet, over the Relays tab: every team with its four children in leg order and what it is doing.
 * Tapping a team still to run turns the sheet into its leg boxes; + New team opens empty ones. Each team saves on its
 * own, against the version this phone saw, and nothing locks. A team someone else set asks first (Change anyway).
 * Once the relay's heats are complete the list is read-only, with the reason in place.
 */
export function TeamSheet({group,relays,me,start,onClose,offer}:{group:RaceGroup;relays:readonly TeamList[];me:string;start:'list'|'new';onClose:()=>void;offer:(next:RacesRead)=>void}) {
  const [mode,setMode]=useState<Mode>({kind:start});
  const relay=teamListOf(group),teams=relay.teams,open=group.heatsOpen;
  const shown=mode.kind==='edit' || mode.kind==='asking'?teams.find(team=>team.id===mode.teamId):undefined;
  // A team that left the list (removed) or a list frozen meanwhile puts the sheet back on the list.
  const current:Mode=(mode.kind==='new' && !open) || ((mode.kind==='edit' || mode.kind==='asking') && !shown)?{kind:'list'}:mode;
  const toList=()=>setMode({kind:'list'});
  if(current.kind==='new' || current.kind==='edit') return <Sheet title={shown?`Edit team ${shown.number}`:`New team ${group.nextTeam}`} onClose={onClose}>
    <TeamForm key={shown?.id??'new'} team={shown??null} number={shown?.number??group.nextTeam!} eventId={group.event.id} relay={relay} relays={relays} offer={offer} onDone={toList}/>
  </Sheet>;
  function choose(team:RelayTeam) {
    setMode(team.changedBy && team.changedBy.id!==me?{kind:'asking',teamId:team.id}:{kind:'edit',teamId:team.id});
  }
  return <Sheet title={`${group.event.name} · ${group.event.section}`} onClose={onClose}>
    <p className="rz-sheet__text">{teamsSheetLine(teams,open)}</p>
    {teams.length>0 && <ul className="rz-teamsheet" aria-label="Teams">{teams.map(team=>{
      const tappable=open && stillToRun(team),body=<>
        <span className="rz-teamsheet__head"><span className="rz-teamsheet__name">Team {team.number}</span><span className="rz-teamsheet__state">{teamState(team)}</span>{tappable && <Icon name="pencil"/>}</span>
        <span className="rz-teamsheet__legs">{team.legs.map((leg,index)=><span key={index} className="rz-teamsheet__leg"><span className="rz-teamsheet__ord">{ordinal(index+1)}</span>{leg.wristband??'–'}</span>)}</span>
      </>;
      return <li key={team.id}>{tappable?<button type="button" className="rz-teamsheet__team rz-teamsheet__team--tap" aria-label={`Change Team ${team.number}: ${legsText(team.legs)}`} onClick={()=>choose(team)}>{body}</button>
        :<div className="rz-teamsheet__team">{body}</div>}</li>;
    })}</ul>}
    {open && <div className="rz-sheet__foot"><button type="button" className="rz-btn rz-btn--display rz-btn--block" onClick={()=>setMode({kind:'new'})}><Icon name="plus"/>New team</button></div>}
    {current.kind==='asking' && shown && <ChangeAnyway team={shown} onCancel={toList} onChange={()=>setMode({kind:'edit',teamId:shown.id})}/>}
  </Sheet>;
}
/** "Aisha Noor has already set this team.": Change anyway opens its leg boxes; the Save is still checked against its version. */
function ChangeAnyway({team,onCancel,onChange}:{team:RelayTeam;onCancel:()=>void;onChange:()=>void}) {
  const id=useId();
  return <div className="rz-confirm" role="alertdialog" aria-modal="true" aria-labelledby={id}>
    <div className="rz-confirm__box">
      <p className="rz-confirm__title" id={id}><strong>{team.changedBy?.name}</strong> has already set this team.</p>
      <p className="rz-confirm__text">Team {team.number} · {legsText(team.legs)}</p>
      {/* Stacked: side by side, "Change anyway" wraps at 360px. */}
      <div className="rz-sheet__actions">
        <button type="button" className="rz-btn rz-btn--primary rz-btn--block" autoFocus onClick={onChange}>Change anyway</button>
        <button type="button" className="rz-btn rz-btn--block" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  </div>;
}
/**
 * The teams sheet opened from a team card at check-in: Edit opens the team's leg boxes straight away (no Change
 * anyway), and New team's saved team joins this heat. Each Save answers with the race as it then stands.
 */
export function CheckInTeamSheet({read,teamId,offer,onClose}:{read:RaceFlowRead;teamId:string|null;offer:(next:RaceFlowRead)=>void;onClose:()=>void}) {
  const {group}=read,relay=teamListOf({...group,teams:read.teams}),team=teamId===null?null:relay.teams.find(item=>item.id===teamId);
  if(team===undefined) return null;
  return <Sheet title={team?`Edit team ${team.number}`:'New team · joins this heat'} onClose={onClose}>
    <TeamForm team={team} number={team?.number??group.nextTeam!} eventId={group.event.id} raceId={read.race.id} offer={offer} onDone={onClose}
      relay={relay} relays={read.relays||[]}/>
  </Sheet>;
}
/**
 * One team's four leg boxes, 1st leg first, each with a grip to drag it to another leg, with Fix number / Keep, then
 * Cancel and Save team 9. Edit on a team never
 * in a race also has Remove team 7. A Save someone overtook shows who, with Show latest to start again from theirs.
 * From check-in (`raceId`) a Save also writes the team's entry in that race, and New team joins it. While a team is
 * open, other phones see "Aisha Noor is changing this team".
 */
function TeamForm<Answer>({team,number,eventId,raceId,relay,relays,offer,onDone}:{team:RelayTeam|null;number:number;eventId:string;raceId?:string;relay:TeamList;relays:readonly TeamList[];offer:(next:Answer)=>void;onDone:()=>void}) {
  /** The version this team was opened at: Save and Remove send it, so a change made meanwhile refuses them. */
  const [version,setVersion]=useState(team?.version),[fresh,setFresh]=useState(0);
  const [removing,setRemoving]=useState(false),{busy,error,changed,clearChanged,send:write}=useWrites<Answer>(offer);
  // The mark is only a courtesy to other phones, so a failed open or close is not shown; a Save or sign-out clears it too.
  useEffect(()=>{
    if(!team) return;
    const mark=(what:string)=>void api(`relays/${eventId}/teams/${team.id}/${what}`,{}).catch(()=>{});
    mark('open');
    return ()=>mark('close');
  },[]);
  async function send(path:string,body:object) {
    if(typeof await write(`relays/${eventId}/teams${path}`,body)==='object') onDone();
  }
  const save=(draft:TeamDraft)=>void send(team?`/${team.id}`:'',{...draft,...(team?{version,raceId}:{joinRaceId:raceId})});
  return <>
    <p className="rz-sheet__text">{relay.name} · {relay.section}<br/>Type each child's wristband in running order, 1st leg first.</p>
    {changed && <Callout status message={`${changedLine(changed.by)}.`}
      actions={<button type="button" className="rz-btn rz-btn--primary" onClick={()=>{clearChanged();setVersion(team?.version);setFresh(fresh+1);}}>Show latest</button>}/>}
    <LegBoxes key={fresh} team={team} number={number} relay={relay} relays={relays} busy={busy} error={error} removing={removing}
      onSave={save} onCancel={onDone} onRemove={team && stillToRun(team)?()=>setRemoving(true):undefined}
      removeActions={team && <><button type="button" className="rz-btn rz-btn--danger" disabled={busy} onClick={()=>void send(`/${team.id}/remove`,{version})}>Remove</button>
        <button type="button" className="rz-btn" onClick={()=>setRemoving(false)}>Keep it</button></>}/>
  </>;
}
function LegBoxes({team,number,relay,relays,busy,error,removing,onSave,onCancel,onRemove,removeActions}:{team:RelayTeam|null;number:number;relay:TeamList;relays:readonly TeamList[];busy:boolean;error:string;
  removing:boolean;onSave:(draft:TeamDraft)=>void;onCancel:()=>void;onRemove?:()=>void;removeActions:ReactNode}) {
  const entry=useTeamDraft(team,relay,relays),{boxes,refusals,warnings,amber,inputs}=entry;
  return <>
    {/* A grip drag reorders the draft only: Save sends it, Cancel drops it. */}
    <SortableList label="Legs" items={entry.keys} itemKey={key=>key} onReorder={entry.move}
      itemName={key=>{const index=entry.keys.indexOf(key);return boxes[index]||`empty ${ordinal(index+1)} leg`;}}
      look={{list:'rz-legboxes',row:'rz-legbox',handle:'rz-orderrow__handle',icon:<Icon name="drag"/>,handleName:what=>`Move ${what}`}}
      renderItem={(key,place)=>{
        const index=entry.keys.indexOf(key),box=boxes[index];
        return <label className={amber(index)?'rz-field rz-field--warn':'rz-field'}>
          <span className="rz-field__label">{ordinal(place)} leg</span>
          <input ref={input=>{inputs.current[index]=input;}} className="rz-field__input" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint={index<3?'next':'done'}
            placeholder="Wristband" value={box} autoFocus={index===Math.max(0,boxes.indexOf(''))} readOnly={busy}
            onFocus={()=>entry.focus(index)} onBlur={()=>entry.focus(null)} onChange={event=>entry.type(index,digitsOnly(event.target.value))}
            onKeyDown={event=>{if(event.key!=='Enter' || event.nativeEvent.isComposing) return;event.preventDefault();if(index<3) inputs.current[index+1]?.focus();else event.currentTarget.blur();}}/>
        </label>;
      }}/>
    {entry.legs.map((_,index)=>refusals[index]?<Callout key={index} message={refusals[index]} actions={<button type="button" className="rz-btn rz-btn--primary" onClick={()=>entry.fix(index)}>Fix number</button>}/>
      :amber(index)?<Callout key={index} message={warnings[index].map(warning=>warning.message).join(' ')}
        actions={<><button type="button" className="rz-btn rz-btn--primary" onClick={()=>entry.fix(index)}>Fix number</button><button type="button" className="rz-btn" onClick={()=>entry.keep(index)}>Keep</button></>}/>:null)}
    {error && <Callout message={error}/>}
    {removing && team && <Callout message={`Remove Team ${team.number}? Its number won't be used again.`} actions={removeActions}/>}
    {!removing && <div className="rz-sheet__foot">
      <div className="rz-footer__pair">
        {/* Pressing Cancel keeps focus in the box: leaving it would show the box's warning and move Cancel from under the tap. */}
        <button type="button" className="rz-btn" onMouseDown={event=>event.preventDefault()} onClick={onCancel}>Cancel</button>
        <button type="button" className="rz-btn rz-btn--primary" disabled={busy || !entry.ready} onClick={()=>onSave(entry.draft())}>Save team {number}</button>
      </div>
      {onRemove && <button type="button" className="rz-btn rz-btn--small rz-btn--block rz-teamsheet__remove" onClick={onRemove}>Remove team {number}</button>}
    </div>}
  </>;
}
