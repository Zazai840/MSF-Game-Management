import { useState } from 'react';
import { heatsFinishedLine,volunteerFinalLine,type RaceGroup,type Step } from '../../shared/race-flow.js';
import type { ResultsTarget } from '../../shared/lead-results.js';
import { Callout,FinalReasonButton,Sheet } from './parts.js';
/** What New race makes: an event group, a heat (with its number) or the final. `direct` is a card's "+": pre-selected. */
const tabs=[['races','Races'],['hurdles','Hurdles']] as const;
export interface NewRaceChoice { eventCode?:string; kind?:'heat'|'final'; number?:number; direct?:boolean }
/** "Girl Cubs already has heats 1 to 4." */
function already(group:RaceGroup) {
  const heats=group.races.filter(race=>race.kind!=='final').map(race=>race.number);
  if(!heats.length) return `${group.event.section} has no heats yet.`;
  return heats.length===1?`${group.event.section} already has heat ${heats[0]}.`:`${group.event.section} already has heats ${heats[0]} to ${heats.at(-1)}.`;
}
/**
 * New race, over Races: the event (every tab's, under Races and Hurdles, so a volunteer on the wrong tab still finds theirs), its section (with its code in the Zone lead role), and the race: the next heat, or for a lead
 * the final once every heat has times. Anyone can make a heat; the server answers a heat someone made a moment ago with
 * theirs. Once a section's heats are complete it offers no heat, and says so.
 */
export function NewRaceSheet({groups,lead,choice,failure,onClose,onCreate,onRace,onResults}:{groups:readonly RaceGroup[];lead:boolean;choice:NewRaceChoice;failure:string;onClose:()=>void;
  onCreate:(choice:Required<NewRaceChoice>)=>void;onRace:(id:string,step:Step)=>void;onResults:(target:ResultsTarget)=>void}) {
  const chosen=groups.find(group=>group.event.code===choice.eventCode);
  const names=[...new Set(groups.map(group=>group.event.name))];
  const [name,setName]=useState(chosen?.event.name??(names.length===1?names[0]:''));
  const [code,setCode]=useState(chosen?.event.code??'');
  const [kind,setKind]=useState<'heat'|'final'>(choice.kind??'heat');
  // The heat number offered when the section was chosen stays put, so a heat someone makes a moment before the tap
  // opens theirs rather than making the next one.
  const [heat,setHeat]=useState<number|null>(chosen?choice.number??chosen.nextHeat:null);
  const sections=groups.filter(group=>group.event.name===name);
  const group=sections.find(item=>item.event.code===code);
  const hasFinal=lead && group?.event.format==='heats',finalMade=group?.races.some(race=>race.kind==='final');
  // A final the server would refuse is greyed, with why in the hint.
  const blocked=!finalMade && (!group?.finalAvailable || !!group.finalReason);
  const race=group && (kind==='final' && hasFinal?'final':'heat'),number=heat??group?.nextHeat;
  return <Sheet title="New race" onClose={onClose}>
    {tabs.map(([type,label])=>{
      const listed=names.filter(item=>groups.some(group=>group.event.name===item && group.event.type===type));
      return listed.length>0 && <fieldset key={type}><legend className="rz-field__label">{label}</legend><div className="rz-choices">
        {listed.map(item=><button key={item} type="button" className="rz-choice" aria-pressed={item===name} onClick={()=>{setName(item);setCode('');setKind('heat');setHeat(null);}}>{item}</button>)}
      </div></fieldset>;
    })}
    {name && <fieldset><legend className="rz-field__label">Section</legend><div className="rz-choices rz-choices--grid">
      {sections.map(item=><button key={item.event.code} type="button" className="rz-choice" aria-pressed={item.event.code===code} onClick={()=>{setCode(item.event.code);setKind('heat');setHeat(item.nextHeat);}}>{item.event.section}{lead && <span className="rz-code-tag">{item.event.code}</span>}</button>)}
    </div></fieldset>}
    {group && <fieldset><legend className="rz-field__label">Race</legend>{(group.heatsOpen || hasFinal) && <div className="rz-choices">
      {group.heatsOpen && <button type="button" className="rz-choice" aria-pressed={race==='heat'} onClick={()=>setKind('heat')}>Heat {number}</button>}
      {hasFinal && <button type="button" className="rz-choice" aria-pressed={race==='final'} disabled={blocked} onClick={()=>setKind('final')}>Final</button>}
    </div>}
      <p className="rz-field__hint">{already(group)}{hasFinal?finalMade?' The final is made: open it from the card.':group.finalReason?'':' The final opens when every heat has times, with the fastest 6 filled in.'
        :volunteerFinalLine(group)?` ${volunteerFinalLine(group)}`:''}</p>
      {hasFinal && !finalMade && group.finalReason && <FinalReasonButton group={group} onRace={onRace} onResults={onResults}/>}
    </fieldset>}
    {failure && <Callout message={failure}/>}
    {group && race==='heat' && !group.heatsOpen?<Callout status message={heatsFinishedLine(group)}/>
      :<button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!group}
        onClick={()=>group && onCreate({eventCode:group.event.code,kind:race!,number:race==='final'?0:number!,direct:!!choice.direct})}>
        {!group?'Choose the event and section':race==='final'?finalMade?'Open the final':'Create the final':`Create heat ${number}`}</button>}
  </Sheet>;
}
