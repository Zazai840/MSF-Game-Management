import type { Section } from './results-rules.js';
export { runnerListRefusal } from './runner-list.js';
export interface WristbandWarning { kind:'unknown-number'|'wrong-section'|'already-ran'; message:string }
export interface WristbandRace {id:string;deleted:boolean;wristbands:readonly number[]}
export type WristbandSection='Beavers'|Exclude<Section,'Boy Beavers'|'Girl Beavers'>;
export function sectionForWristband(number:number):WristbandSection|null {
  if (!Number.isSafeInteger(number) || number<1 || number>=5000) return null;
  if (number<1000) return 'Beavers';
  if (number<2000) return 'Boy Cubs';
  if (number<3000) return 'Girl Cubs';
  if (number<4000) return 'Boy Scouts';
  return 'Girl Scouts';
}
/** Races belong to the same event; the caller supplies that event's state. */
export function wristbandWarnings(number:number,section:Section,races:readonly WristbandRace[]=[],options:{currentRaceId?:string;skipAlreadyRan?:boolean}={}):WristbandWarning[] {
  const warnings:WristbandWarning[]=[];
  const found=sectionForWristband(number);
  if (!found) warnings.push({kind:'unknown-number',message:`${number} is not a known wristband number`});
  else if (!(found==='Beavers' && (section==='Boy Beavers' || section==='Girl Beavers')) && found!==section) warnings.push({kind:'wrong-section',message:`${number} belongs to ${found} - this race is ${section}`});
  if (!options.skipAlreadyRan && races.some(race=>!race.deleted && race.id!==options.currentRaceId && race.wristbands.includes(number))) warnings.push({kind:'already-ran',message:`${number} already ran in this event`});
  return warnings;
}
