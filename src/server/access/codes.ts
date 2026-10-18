import { randomInt } from 'node:crypto';
export function newDayCode(previous?:string) {
  let code:string;
  do { code=String(randomInt(10000)).padStart(4,'0'); } while(code===previous);
  return code;
}
const readable=(length:number)=>Array.from({length},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
export function newLeadCode(previous?:string) {
  let code:string;
  do { code=readable(6); } while(code===previous);
  return code;
}
/** The first Olympics password, made when the owner starts the first day; easy to read out. */
export const newOlympicsPassword=()=>readable(8);
