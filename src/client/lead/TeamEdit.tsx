import { ordinal } from '../../shared/ordinal.js';
import { raceName } from '../../shared/race-flow.js';
import { filledLegs,unsavedRace,type RelayTeam,type TeamList } from '../../shared/teams.js';
import { digitsOnly } from '../flow/NumberEntry.js';
import { useTeamDraft } from '../races/team-draft.js';
import './teams.css';
/** What Done sends: the four boxes in leg order (null when empty) and the wristbands whose warnings were kept. */
export interface Done { legs:Array<number|null>; keptWarnings:number[] }
/**
 * A team read-only: "Team 3" ("3 of 4" under it when not complete, or "In heat 2" while an unsaved race holds it), then its
 * four wristbands, "-" for an empty box and amber for a kept warning.
 */
export function TeamCells({team}:{team:RelayTeam}) {
  const filled=filledLegs(team),race=unsavedRace(team);
  return <><span className="team-name"><span>Team {team.number}</span>{race?<small>In {raceName(race).toLowerCase()}</small>:filled<4 && <small className="is-short">{filled} of 4</small>}</span>
    {team.legs.map((leg,index)=><span key={index} className={`leg-ro${leg.wristband===null?' is-empty':''}${leg.warnings.length?' is-amber':''}`}>{leg.wristband??'-'}</span>)}</>;
}

/**
 * A lead's Correct teams, one team open: its four boxes on the number keyboard, the first box the 1st leg, then Cancel
 * and Done. A number already in this team or another team of the relay is refused as it is typed (Fix number only); one
 * that looks wrong shows amber once its box is left, with Fix number or Keep. Done needs each fixed or kept.
 */
export function TeamEdit({team,relay,relays,busy,onCancel,onDone}:{team:RelayTeam;relay:TeamList;relays:readonly TeamList[];busy:boolean;onCancel:()=>void;onDone:(done:Done)=>void}) {
  const entry=useTeamDraft(team,relay,relays),{boxes,refusals,warnings,amber,fix,inputs}=entry;
  const name=`Team ${team.number}`,ready=!busy && entry.ready;
  return <div className="team-edit">
    <div className="team-row"><span className="team-name"><span>{name}</span></span>
      {boxes.map((box,index)=><input key={index} ref={input=>{inputs.current[index]=input;}} className={`leg-box${amber(index)?' is-amber':''}`} type="text" inputMode="numeric" pattern="[0-9]*"
        autoComplete="off" enterKeyHint={index<3?'next':'done'} aria-label={`${name} ${ordinal(index+1)} leg`} value={box} autoFocus={index===Math.max(0,boxes.indexOf(''))}
        onFocus={()=>entry.focus(index)} onBlur={()=>entry.focus(null)} onChange={event=>entry.type(index,digitsOnly(event.target.value))}
        onKeyDown={event=>{if(event.key!=='Enter' || event.nativeEvent.isComposing) return;event.preventDefault();if(index<3) inputs.current[index+1]?.focus();else event.currentTarget.blur();}}/>)}
    </div>
    {entry.legs.map((_,index)=>refusals[index]?<div key={index} className="warning-box team-warn" role="alert"><p>{refusals[index]}</p><div className="warning-actions"><button onClick={()=>fix(index)}>Fix number</button></div></div>
      :amber(index)?<div key={index} className="warning-box team-warn" role="alert">{warnings[index].map(warning=><p key={warning.message}>{warning.message}</p>)}
        <div className="warning-actions"><button onClick={()=>fix(index)}>Fix number</button><button className="button-secondary" onClick={()=>entry.keep(index)}>Keep</button></div></div>:null)}
    <div className="edit-actions">
      {/* Pressing Cancel keeps focus in the box: leaving it would show the box's warning and move Cancel from under the tap. */}
      <button className="button-secondary" onMouseDown={event=>event.preventDefault()} onClick={onCancel}>Cancel</button>
      <button disabled={!ready} onClick={()=>onDone(entry.draft())}>Done</button></div>
  </div>;
}
