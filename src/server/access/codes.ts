import { randomInt } from 'node:crypto';
export function newDayCode(previous?:string) {
  let code:string;
  do { code=String(randomInt(10000)).padStart(4,'0'); } while(code===previous);
  return code;
}
export function newLeadCode(previous?:string) {
  let code:string;
  do { code=Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); } while(code===previous);
  return code;
}
