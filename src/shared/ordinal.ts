/** A place as people say it: 1st, 2nd, 3rd, 4th, 11th, 21st, 112th. */
export function ordinal(place:number):string {
  const lastTwo=place%100,last=place%10;
  const suffix=lastTwo>=11 && lastTwo<=13?'th':last===1?'st':last===2?'nd':last===3?'rd':'th';
  return `${place}${suffix}`;
}
