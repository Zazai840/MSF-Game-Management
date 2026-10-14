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
const ranges:Record<WristbandSection,[string,string]>={'Beavers':['Beaver','1 to 999'],'Boy Cubs':['Boy Cubs','1000 to 1999'],'Girl Cubs':['Girl Cubs','2000 to 2999'],'Boy Scouts':['Boy Scouts','3000 to 3999'],'Girl Scouts':['Girl Scouts','4000 to 4999']};
/** The volunteer's wording for a warning: same rules, plain words, and the range that would have been right. */
export function plainWristbandWarning(warning:Pick<WristbandWarning,'kind'>,number:number,section:Section):string {
  if (warning.kind==='unknown-number') return `${number} is not a wristband number. Wristbands are 1 to 4999.`;
  if (warning.kind==='already-ran') return `${number} already ran in another race of this event.`;
  const [name,range]=ranges[section==='Boy Beavers' || section==='Girl Beavers'?'Beavers':section];
  return `${number} is not a ${section} number. ${name} wristbands are ${range}.`;
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
