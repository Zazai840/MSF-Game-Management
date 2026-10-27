import { useState } from 'react';
import type { RaceGroup } from '../../shared/race-flow.js';
import { Sheet } from './parts.js';
/** What New race makes: an event group, a heat (with its number) or the final. `direct` is a card's "+": pre-selected. */
export interface NewRaceChoice { eventCode?:string; kind?:'heat'|'final'; number?:number; direct?:boolean }
/** "Girl Cubs already has heats 1 to 4." */
function already(group:RaceGroup) {
  const heats=group.races.filter(race=>race.kind!=='final').map(race=>race.number);
  if(!heats.length) return `${group.event.section} has no heats yet.`;
  return heats.length===1?`${group.event.section} already has heat ${heats[0]}.`:`${group.event.section} already has heats ${heats[0]} to ${heats.at(-1)}.`;
}
/**
 * New race, over Races: the event (this tab's), its section with the code, and the race: the next heat, or the final
 * once every heat has times. Anyone can create; the server answers a heat someone made a moment ago with theirs.
 */
export function NewRaceSheet({groups,choice,onClose,onCreate}:{groups:readonly RaceGroup[];choice:NewRaceChoice;onClose:()=>void;onCreate:(choice:Required<NewRaceChoice>)=>void}) {
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
  const hasFinal=group?.event.format==='heats',finalMade=group?.races.some(race=>race.kind==='final');
  const race=group && (kind==='final' && hasFinal?'final':'heat'),number=heat??group?.nextHeat;
  return <Sheet title="New race" onClose={onClose}>
    <fieldset><legend className="rz-field__label">Event</legend><div className="rz-choices">
      {names.map(item=><button key={item} type="button" className="rz-choice" aria-pressed={item===name} onClick={()=>{setName(item);setCode('');setKind('heat');setHeat(null);}}>{item}</button>)}
    </div></fieldset>
    {name && <fieldset><legend className="rz-field__label">Section</legend><div className="rz-choices rz-choices--grid">
      {sections.map(item=><button key={item.event.code} type="button" className="rz-choice" aria-pressed={item.event.code===code} onClick={()=>{setCode(item.event.code);setKind('heat');setHeat(item.nextHeat);}}>{item.event.section}<span className="rz-code-tag">{item.event.code}</span></button>)}
    </div></fieldset>}
    {group && <fieldset><legend className="rz-field__label">Race</legend><div className="rz-choices">
      <button type="button" className="rz-choice" aria-pressed={race==='heat'} onClick={()=>setKind('heat')}>Heat {number}</button>
      {hasFinal && <button type="button" className="rz-choice" aria-pressed={race==='final'} disabled={!group.finalAvailable && !finalMade} onClick={()=>setKind('final')}>Final</button>}
    </div>
      <p className="rz-field__hint">{already(group)}{hasFinal?finalMade?' The final is made: open it from the card.':' The final opens when every heat has times, with the fastest 6 filled in.':''}</p>
    </fieldset>}
    <button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!group}
      onClick={()=>group && onCreate({eventCode:group.event.code,kind:race!,number:race==='final'?0:number!,direct:!!choice.direct})}>
      {!group?'Choose the event and section':race==='final'?finalMade?'Open the final':'Create the final':`Create heat ${number}`}</button>
  </Sheet>;
}
