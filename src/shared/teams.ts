import type { Section } from './results-rules.js';
import { plainWristbandWarning,wristbandWarnings } from './wristband-checks.js';
/** A warning on one leg of a relay team, in the volunteer's words. Done stores it only once kept. */
export interface TeamWarning { kind:'unknown-number'|'wrong-section'|'other-relay'; message:string; kept:boolean }
/** One leg of a relay team: its child's wristband (null while the box is empty) and that child's kept warnings. */
export interface TeamLeg { wristband:number|null; warnings:TeamWarning[] }
/** A relay team on its relay's team list: Team 1, Team 2, ... with its four legs in leg order. */
export interface RelayTeam { id:string; number:number; legs:TeamLeg[]; version:number }
/** A relay as its team checks see it: the relay a team is in, or another of the day's relays. */
export interface TeamRelay { code:string; name:string; section:Section; teams:readonly RelayTeam[] }
/** Why the number in box `index` can't go in: it is already in another box of this team, or in another team of the relay. */
export function legRefusal(teams:readonly RelayTeam[],teamId:string|null,legs:readonly (number|null)[],index:number):string|null {
  const number=legs[index];
  if(number===null) return null;
  if(legs.some((other,at)=>at!==index && other===number)) return `${number} is already in this team. Check the wristband.`;
  const other=teams.find(team=>team.id!==teamId && team.legs.some(leg=>leg.wristband===number));
  return other?`${number} is already in Team ${other.number}. Check the wristband.`:null;
}
/**
 * What looks wrong about a leg's number, for Fix number or Keep: no Section uses it, it is another Section's (any
 * Beaver number is in range for both Beaver relays), or the child is already in a team of another relay.
 */
export function legWarnings(number:number,relay:Pick<TeamRelay,'code'|'section'>,relays:readonly TeamRelay[]):Array<Omit<TeamWarning,'kept'>> {
  const warnings=wristbandWarnings(number,relay.section,[],{skipAlreadyRan:true}).map(warning=>({kind:warning.kind as TeamWarning['kind'],message:plainWristbandWarning(warning,number,relay.section)}));
  for(const other of relays) if(other.code!==relay.code) for(const team of other.teams) if(team.legs.some(leg=>leg.wristband===number)) warnings.push({kind:'other-relay',message:`${number} is also in Team ${team.number} of ${other.name} ${other.section}.`});
  return warnings;
}
