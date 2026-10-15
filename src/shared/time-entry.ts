export interface RaceTimes { places:Array<number|null>; outOfOrder:boolean; acceptedByLead?:boolean }
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
