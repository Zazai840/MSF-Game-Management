import type { FinalField } from './finals.js';
import type { FinishingOrder,RaceRead,Runner } from './races.js';
import type { RaceTimes } from './time-entry.js';
export const raceParts=['runners','finish','times'] as const;
export type RacePartName=typeof raceParts[number];
export type PartValue=Runner[]|FinishingOrder|RaceTimes|null;
export interface PartSave {id:string;part:RacePartName;baseVersion:number;version:number;author:string|null;at:string;value:PartValue;runners:Runner[];runnersBefore:Runner[];active:boolean}
export interface RaceClash {part:RacePartName;candidates:PartSave[]}
export interface LeadRaceRead {race:Omit<RaceRead,'final'> & {final?:FinalField};clashes:RaceClash[];history:PartSave[]}
export const hasClash=(race:Pick<RaceRead,'parts'>)=>raceParts.some(part=>race.parts[part].clash);
export const clashMessage='Two versions - zone lead to check';
export const partLabel=(part:RacePartName)=>part==='runners'?'Runners':part==='finish'?'Finishing order':'Times';
