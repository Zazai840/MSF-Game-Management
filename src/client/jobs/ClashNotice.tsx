import { clashMessage,hasClash } from '../../shared/race-clashes.js';
import type { RaceRead } from '../../shared/races.js';
export function ClashNotice({race}:{race:RaceRead|undefined|null}) {return race && hasClash(race)?<p className="number-warning">{clashMessage}</p>:null;}
