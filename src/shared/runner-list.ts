/** A wristband number refused as already in the race, on the phone and the server: "2001 is already in this race". */
export const alreadyInRaceLine=(number:number)=>`${number} is already in this race`;
/** Hard refusals shared by Start line's wristband entry and the server. Warnings come separately. */
export function runnerListRefusal(value:unknown):string|null {
  if (!Array.isArray(value) || value.length===0) return 'Enter at least one wristband number';
  const seen=new Set<number>();
  for (const number of value) {
    if (!Number.isSafeInteger(number) || number<0) return 'Enter a whole wristband number';
    if (seen.has(number)) return alreadyInRaceLine(number);
    seen.add(number);
  }
  return null;
}
