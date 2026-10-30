import type { Section } from './results-rules.js';
import { plainWristbandWarning,wristbandWarnings } from './wristband-checks.js';
/** A warning on one leg of a relay team, in the volunteer's words. Done stores it only once kept. */
export interface TeamWarning { kind:'unknown-number'|'wrong-section'|'other-relay'; message:string; kept:boolean }
/** One leg of a relay team: its child's wristband (null while the box is empty) and that child's kept warnings. */
export interface TeamLeg { wristband:number|null; warnings:TeamWarning[] }
/** A race holding a relay team: one of its relay's races that is not deleted. */
export interface TeamRace { id:string; kind:'heat'|'final'|'race'; number:number; state:'in progress'|'saved' }
/**
 * A relay team on its relay's team list: Team 1, Team 2, ... with its four legs in leg order, whose profile last set it
 * ("Aisha Noor has already set this team.", asked only of another profile), who has it open to change ("Priya Shah is changing this team") since
 * when, or null, and the races holding it (worked out from the races, never stored), oldest first. A team any race
 * holds can't be removed.
 */
export interface RelayTeam { id:string; number:number; legs:TeamLeg[]; version:number; changedBy:{id:string|null;name:string}|null; changing:{id:string;name:string;since:string}|null; races:TeamRace[] }
/** A relay as its team checks see it: the relay a team is in, or another of the day's relays. */
export interface TeamList { code:string; name:string; section:Section; teams:readonly RelayTeam[] }
/** How many of a team's four boxes hold a wristband: a team with fewer is not complete ("3 of 4"). */
export const filledLegs=(team:{legs:ReadonlyArray<{wristband:number|null}>})=>team.legs.filter(leg=>leg.wristband!==null).length;
/** Still to run: no race of its relay holds the team, apart from deleted races. Removed teams are not on the list at all. */
export const stillToRun=(team:Pick<RelayTeam,'races'>)=>!team.races.length;
/** The unsaved race holding the team, if any: the team is changed only at that race's check-in, and a lead's Correct teams reads "In heat 2". */
export const unsavedRace=(team:Pick<RelayTeam,'races'>)=>team.races.find(race=>race.state!=='saved')??null;
/**
 * Who else is changing the team now, or null: the name on its "being changed by" marker, unless it is this phone's own
 * (`me`, its sign-in id). A team someone else is changing can't be added to a race, and shows "Priya Shah is changing
 * this team" under it.
 */
export const changerOf=(team:Pick<RelayTeam,'changing'>,me:string|null=null)=>team.changing && team.changing.id!==me?team.changing.name:null;
/** Under a team someone else has open: "Priya Shah is changing this team". */
export const changingLine=(name:string)=>`${name} is changing this team`;
/** How full a team short of four children is, "3 of 4", or null for a full team. */
const shortBy=(team:{legs:ReadonlyArray<{wristband:number|null}>})=>filledLegs(team)<4?`${filledLegs(team)} of 4`:null;
/** A team short of four children runs short: "Runs short · 3 of 4", or null. It never blocks a race, and a lead checks it once saved. */
export const runsShortLine=(team:{legs:ReadonlyArray<{wristband:number|null}>})=>shortBy(team) && `Runs short · ${shortBy(team)}`;
/** A team's four children in leg order, "–" for an empty leg: "2101 · 2134 · 2187 · –". */
export const legsText=(legs:ReadonlyArray<{wristband:number|null}>)=>legs.map(leg=>leg.wristband??'–').join(' · ');
/** "1 child", "3 children": how many of a heat's children are here. */
export const childCount=(count:number)=>`${count} ${count===1?'child':'children'}`;
/** A relay group as its team checks see it: the relay and its teams. */
export const teamListOf=(group:{event:Pick<TeamList,'code'|'name'|'section'>;teams?:readonly RelayTeam[]}):TeamList=>
  ({code:group.event.code,name:group.event.name,section:group.event.section,teams:group.teams||[]});
/**
 * What a team is doing, in the teams sheet: "Heat 1 · ran", "Heat 2 · change it at check-in" (its latest race), or
 * "Still to run", with "· 3 of 4" while it is short.
 */
export function teamState(team:Pick<RelayTeam,'races'|'legs'>) {
  const race=team.races.at(-1),name=race?.kind==='final'?'Final':`Heat ${race?.number}`,short=shortBy(team);
  return race?`${name} · ${race.state==='saved'?'ran':'change it at check-in'}`:`Still to run${short?` · ${short}`:''}`;
}
/** A relay card's Teams row: "Teams 8 · 2 still to run", or "Teams 6" once none is left to run. */
export function teamsRow(teams:readonly Pick<RelayTeam,'races'>[]) {
  const left=teams.filter(stillToRun).length;
  return `Teams ${teams.length}${left?` · ${left} still to run`:''}`;
}
/** The teams sheet's line under its title: how many teams and how many to run, or why the list is read-only. */
export function teamsSheetLine(teams:readonly Pick<RelayTeam,'races'>[],open:boolean) {
  if(!open) return "The final has been made, so the teams can't change. A lead can correct a team in Results.";
  if(!teams.length) return 'No teams yet. Tap New team to type the first.';
  return `${teamCount(teams.length)} · ${teams.filter(stillToRun).length} still to run. Tap a team still to run to change it.`;
}
/** A relay card with teams and no heats yet: "3 teams ready · no heats yet". */
export const teamsReadyLine=(teams:readonly unknown[])=>`${teamCount(teams.length)} ready · no heats yet`;
/** What a race entry is: a runner, or on a relay a team ("This team is already disqualified"). */
export const entryNoun=(relay:boolean)=>relay?'team':'runner';
/** What fills a place in the order: a wristband, or on a relay a team. */
export const entryWord=(relay:boolean)=>relay?'team':'wristband';
/** "1 runner", "5 runners"; on a relay "1 team", "5 teams". */
export const entryCount=(count:number,relay:boolean)=>`${count} ${entryNoun(relay)}${count===1?'':'s'}`;
/** "1 team", "5 teams". */
export const teamCount=(count:number)=>entryCount(count,true);
/** The finish line's and Timer's words, for a relay's teams or a race's runners. */
export const entryWords=(relay:boolean)=>relay?{
  add:'+ Team not on the list',allPlaced:'Every team is placed',who:'Which team',noneElse:'No other team crossed the line',
  hasPlace:'Every team has a place.',appear:'Teams appear here as the start line adds them or marks them Here.',placesWhen:'teams are in the heat',timerMeta:"time each team's 4th leg",
}:{
  add:'+ Runner not on the list',allPlaced:'Everyone is placed',who:'Who',noneElse:'Nobody else crossed the line',
  hasPlace:'Everyone has a place.',appear:'Runners appear here as the start line checks them in. Add one who crossed the line but is not on the list.',placesWhen:'runners are checked in',timerMeta:null,
};
/** A word as it starts a sentence or a column: "Team", "Runners". */
export const capitalised=(word:string)=>word[0].toUpperCase()+word.slice(1);
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
