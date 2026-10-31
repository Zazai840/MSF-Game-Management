export interface RaceTimes { places:Array<number|null>; outOfOrder:boolean; acceptedByLead?:boolean;
  /** The race screen's Keep: the place indexes whose wrong time the timer kept as typed. A retyped time is new, so it is no longer kept. */
  keptWrong?:number[] }
/** The last two digits are hundredths, the next two seconds, then minutes. */
export function parseTimeDigits(digits:string):number|null {
  if(!/^\d+$/.test(digits)) return null;
  const padded=digits.padStart(4,'0');
  const hundredths=Number(padded.slice(-2))+Number(padded.slice(-4,-2))*100+Number(padded.slice(0,-4))*6000;
  return Number.isSafeInteger(hundredths)?hundredths:null;
}
export function formatTimeDigits(digits:string):string {
  if(!digits) return '-';
  const padded=digits.padStart(4,'0');
  const seconds=String(Number(padded.slice(-4,-2)));
  const minutes=Number(padded.slice(0,-4));
  return `${minutes?`${minutes}:${seconds.padStart(2,'0')}`:seconds}.${padded.slice(-2)}`;
}
/** The time box's hint, on the Timer and the lead's Correct times. No-break spaces keep "1 2 3 4" on one line. */
export const timeBoxHint='Type the digits on the timer. They fill from the right: 1\u00a02\u00a03\u00a04 shows 12.34.';
/**
 * The time box's digits after an edit to what it shows: digits only, without leading zeros. An edit that would make
 * a 7th digit does nothing (at most 99:59.99).
 */
export function typedTimeDigits(previous:string,shown:string):string {
  const digits=shown.replace(/\D/g,'').replace(/^0+/,'');
  return digits.length>6?previous:digits;
}
export function formatTime(hundredths:number):string {
  const minutes=Math.floor(hundredths/6000),seconds=Math.floor(hundredths%6000/100),fraction=String(hundredths%100).padStart(2,'0');
  return `${minutes?`${minutes}:${String(seconds).padStart(2,'0')}`:seconds}.${fraction}`;
}
export const digitsForTime=(hundredths:number)=>formatTime(hundredths).replace(/[:.]/g,'');
export function timesOutOfOrder(places:readonly(number|null)[]):boolean {
  let previous:number|null=null;
  for(const time of places) {if(time===null) continue;if(previous!==null && time<previous) return true;previous=time;}
  return false;
}
