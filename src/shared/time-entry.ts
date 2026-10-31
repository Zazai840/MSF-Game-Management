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
/** Race length in metres from the event name: "60m Hurdles" is 60, "4x100m Relay" is 400; null when the name has none. */
function metres(eventName:string):number|null {
  const match=/^(?:(\d+)x)?(\d+)m/.exec(eventName);
  return match?Number(match[1]||1)*Number(match[2]):null;
}
/**
 * A race's limits in hundredths, from the distance in its event name: faster than `fastest` (10 m/s) is refused,
 * slower than `slowest` (1.5 m/s) is held for Fix time or Keep. Null for an event with no known distance.
 */
export function timeLimits(eventName:string):{fastest:number;slowest:number}|null {
  const distance=metres(eventName);
  return distance?{fastest:distance*100/10,slowest:Math.round(distance*100/1.5)}:null;
}
const checkTimer='Check the timer and type it again.';
/**
 * Why the time box's digits cannot be a time for this event (seconds over 59, 0.00, faster than 10 m/s for its
 * distance), or null. The phone checks the digits as typed; the server checks a saved time's digits.
 */
export function timeRefusal(digits:string,eventName:string):string|null {
  const typed=digits.replace(/^0+/,'');
  if(!typed) return `0.00 is not a time. ${checkTimer}`;
  if(Number(typed.padStart(4,'0').slice(-4,-2))>59) return `Seconds go up to 59, so ${formatTimeDigits(typed)} is not a time. ${checkTimer}`;
  const limits=timeLimits(eventName),time=parseTimeDigits(typed);
  if(!limits || time===null || time>=limits.fastest) return null;
  const tip=typed.length<=2?`For ${typed} seconds, type ${typed}00.`:checkTimer;
  return `${formatTimeDigits(typed)} is too fast for ${eventName}. No one runs ${metres(eventName)}m in under ${formatTime(limits.fastest)}. ${tip}`;
}
export const digitsForTime=(hundredths:number)=>formatTime(hundredths).replace(/[:.]/g,'');
export function timesOutOfOrder(places:readonly(number|null)[]):boolean {
  let previous:number|null=null;
  for(const time of places) {if(time===null) continue;if(previous!==null && time<previous) return true;previous=time;}
  return false;
}
