import type { Section } from './results-rules.js';
import { plainWristbandWarning,wristbandWarnings } from './wristband-checks.js';
/** A warning on one leg of a relay team, in the volunteer's words. Done stores it only once kept. */
export interface TeamWarning { kind:'unknown-number'|'wrong-section'|'other-relay'; message:string; kept:boolean }
/** One leg of a relay team: its child's wristband (null while the box is empty) and that child's kept warnings. */
export interface TeamLeg { wristband:number|null; warnings:TeamWarning[] }
/** A race holding a relay team: one of its relay's races that is not deleted. */
export interface TeamRace { id:string; kind:'heat'|'final'|'race'; number:number; state:'in progress'|'submitted'|'saved' }
/**
 * A relay team on its relay's team list: Team 1, Team 2, ... with its four legs in leg order, who has it open to
 * change ("Priya Shah is changing this team") since when, or null, and the races holding it (worked out from the
 * races, never stored), oldest first. A team any race holds can't be removed.
 */
export interface RelayTeam { id:string; number:number; legs:TeamLeg[]; version:number; changing:{id:string;name:string;since:string}|null; races:TeamRace[] }
/** A relay as its team checks see it: the relay a team is in, or another of the day's relays. */
export interface TeamList { code:string; name:string; section:Section; teams:readonly RelayTeam[] }
/** How many of a team's four boxes hold a wristband: a team with fewer is not complete ("3 of 4"). */
export const filledLegs=(team:Pick<RelayTeam,'legs'>)=>team.legs.filter(leg=>leg.wristband!==null).length;
/** Still to run: no race of its relay holds the team, apart from deleted races. Removed teams are not on the list at all. */
export const stillToRun=(team:Pick<RelayTeam,'races'>)=>!team.races.length;
/** The unsaved race holding the team, if any: on the Teams screen it reads "In heat 2" and can't be changed there. */
export const unsavedRace=(team:Pick<RelayTeam,'races'>)=>team.races.find(race=>race.state!=='saved')??null;
/**
 * Who is changing the team now, or null: the name on its "being changed by" marker. A team being changed can't be
 * ticked into a race, and other phones see "Priya Shah is changing this team" under it.
 */
export const changingName=(team:Pick<RelayTeam,'changing'>)=>team.changing?.name??null;
/** "1 team", "5 teams". */
export const teamCount=(count:number)=>`${count} ${count===1?'team':'teams'}`;
/** A relay card's status line on the Teams screen: "You are entering · 5 teams · Team 5 is 3 of 4", "Sam Patel is entering · 5 teams", "5 teams" or "No teams yet · open to start". */
export function teamsStatus({teams,teamsHolder}:{teams:readonly RelayTeam[];teamsHolder:{id:string;name:string}|null},phoneId:string) {
  // Only the holder is told which team is not complete.
  const mine=teamsHolder?.id===phoneId,short=mine?teams.find(team=>filledLegs(team)<4):undefined;
  return [teamsHolder?(mine?'You are entering':`${teamsHolder.name} is entering`):'',teams.length?teamCount(teams.length):'No teams yet',
    short?`Team ${short.number} is ${filledLegs(short)} of 4`:'',!teamsHolder && !teams.length?'open to start':''].filter(Boolean).join(' · ');
}
/** The Teams button's badge: every relay's teams, then how many are not complete; empty with no teams. */
export function teamsBadge(relays:ReadonlyArray<{teams?:readonly RelayTeam[]}>) {
  const teams=relays.flatMap(relay=>relay.teams||[]),short=teams.filter(team=>filledLegs(team)<4).length;
  return teams.length?[teamCount(teams.length),short?`${short} not complete`:''].filter(Boolean).join(' · '):'';
}
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
export function legWarnings(number:number,relay:Pick<TeamList,'code'|'section'>,relays:readonly TeamList[]):Array<Omit<TeamWarning,'kept'>> {
  const warnings=wristbandWarnings(number,relay.section,[],{skipAlreadyRan:true}).map(warning=>({kind:warning.kind as TeamWarning['kind'],message:plainWristbandWarning(warning,number,relay.section)}));
  for(const other of relays) if(other.code!==relay.code) for(const team of other.teams) if(team.legs.some(leg=>leg.wristband===number)) warnings.push({kind:'other-relay',message:`${number} is also in Team ${team.number} of ${other.name} ${other.section}.`});
  return warnings;
}
