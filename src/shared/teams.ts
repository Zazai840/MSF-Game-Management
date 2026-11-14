import type { Section } from './results-rules.js';
import { plainWristbandWarning,wristbandWarnings } from './wristband-checks.js';
/** A warning on one leg of a relay team, in the volunteer's words. Save stores it only once kept. */
export interface TeamWarning { kind:'unknown-number'|'wrong-section'|'other-heat'; message:string; kept:boolean }
/** One leg of a relay team: its child's wristband (null while the box is empty) and that child's kept warnings. */
export interface TeamLeg { wristband:number|null; warnings:TeamWarning[] }
/** A team in a race marked Here whole: each of its children here, an empty leg not. */
export const teamHere=<Team extends {legs:readonly TeamLeg[]}>(team:Team)=>({...team,legs:team.legs.map(leg=>({...leg,here:leg.wristband!==null}))});
/** A race holding a relay team: one of its relay's races that is not deleted. */
export interface TeamRace { id:string; kind:'heat'|'final'|'race'; number:number; state:'in progress'|'saved' }
/**
 * A relay team, made by typing it into a heat: Team 1, Team 2, ... numbered within its relay, with its four legs in leg
 * order, its version and whose profile last set it (a late Save names them), and the races holding it (worked out from
 * the races, never stored), oldest first.
 */
export interface RelayTeam { id:string; number:number; legs:TeamLeg[]; version:number; changedBy:{id:string|null;name:string}|null; races:TeamRace[] }
/** A relay as its team checks see it: the relay a team is in. */
export interface TeamList { code:string; name:string; section:Section; teams:readonly RelayTeam[] }
/** How many of a team's four boxes hold a wristband: a team with fewer is not complete ("3 of 4"). */
export const filledLegs=(team:{legs:ReadonlyArray<{wristband:number|null}>})=>team.legs.filter(leg=>leg.wristband!==null).length;
/** Still to run: no race of its relay holds the team, apart from deleted races: taken off a heat, did not run, or typed ahead on an older build. */
export const stillToRun=(team:Pick<RelayTeam,'races'>)=>!team.races.length;
/** The unsaved race holding the team, if any: the team is changed only at that race's check-in, and a lead's Correct teams reads "In heat 2". */
export const unsavedRace=(team:Pick<RelayTeam,'races'>)=>team.races.find(race=>race.state!=='saved')??null;
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
/** The teams of the relay that race `raceId` holds, apart from team `teamId`: no race, no team. */
const teamsInRace=(teams:readonly RelayTeam[],teamId:string|null,raceId:string)=>teams.filter(team=>team.id!==teamId && team.races.some(race=>race.id===raceId));
/**
 * Why the number in box `index` can't go in (Fix number only): it is already in another box of this team, or in
 * another team of this race (`raceId`, the heat or final being checked in or corrected). Each child runs for one team.
 */
export function legRefusal(teams:readonly RelayTeam[],teamId:string|null,legs:readonly (number|null)[],index:number,raceId:string):string|null {
  const number=legs[index];
  if(number===null) return null;
  if(legs.some((other,at)=>at!==index && other===number)) return `${number} is already in this team.`;
  const other=teamsInRace(teams,teamId,raceId).find(team=>team.legs.some(leg=>leg.wristband===number));
  if(!other) return null;
  const race=other.races.find(item=>item.id===raceId)!;
  return `${number} is already in Team ${other.number} in this ${race.kind==='final'?'final':'heat'}. Each child runs for one team.`;
}
/**
 * What looks wrong about a leg's number, for Fix number or Keep: no Section uses it, it is another Section's (any
 * Beaver number is in range for both Beaver relays), or the child is in another team of this relay that race `raceId`
 * doesn't hold ("2022 already ran in Heat 1, in Team 2."). A child may run for a team of another relay too.
 */
export function legWarnings(number:number,relay:TeamList,teamId:string|null,raceId:string):Array<Omit<TeamWarning,'kept'>> {
  const warnings=wristbandWarnings(number,relay.section,[],{skipAlreadyRan:true}).map(warning=>({kind:warning.kind as TeamWarning['kind'],message:plainWristbandWarning(warning,number,relay.section)}));
  const inRace=teamsInRace(relay.teams,teamId,raceId);
  for(const team of relay.teams) if(team.id!==teamId && !inRace.includes(team) && team.legs.some(leg=>leg.wristband===number)) warnings.push({kind:'other-heat',message:otherHeatLine(number,team)});
  return warnings;
}
/**
 * Box `index` as the start line checks it while typing: its refusal (Fix number only), else its warnings (Fix number
 * or Keep); neither for an empty box.
 */
export function legCheck(relay:TeamList,teamId:string|null,legs:readonly (number|null)[],index:number,raceId:string) {
  const refusal=legRefusal(relay.teams,teamId,legs,index,raceId),number=legs[index];
  return {refusal,warnings:refusal || number===null?[]:legWarnings(number,relay,teamId,raceId)};
}
/** A child in another team of this relay, by that team's latest race: "2022 already ran in Heat 1, in Team 2.", "... is already in Heat 2, ...", or still to run. */
function otherHeatLine(number:number,team:Pick<RelayTeam,'number'|'races'>) {
  const race=team.races.at(-1);
  if(!race) return `${number} is already in Team ${team.number}, still to run.`;
  const name=race.kind==='final'?'the Final':`Heat ${race.number}`;
  return race.state==='saved'?`${number} already ran in ${name}, in Team ${team.number}.`:`${number} is already in ${name}, in Team ${team.number}.`;
}
