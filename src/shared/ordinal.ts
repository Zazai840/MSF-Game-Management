/** 1st, 2nd, 3rd, 4th, 11th, 21st: places in a race. */
export function ordinal(number:number):string {
  const tens=number%100,units=number%10;
  return `${number}${tens>=11 && tens<=13?'th':units===1?'st':units===2?'nd':units===3?'rd':'th'}`;
}
