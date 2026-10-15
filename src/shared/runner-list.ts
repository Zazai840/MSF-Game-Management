/** Hard refusals shared by Start line's wristband entry and the server. Warnings come separately. */
export function runnerListRefusal(value:unknown):string|null {
  if (!Array.isArray(value) || value.length===0) return 'Enter at least one wristband number';
  const seen=new Set<number>();
  for (const number of value) {
    if (!Number.isSafeInteger(number) || number<0) return 'Enter a whole wristband number';
    if (seen.has(number)) return `${number} is already in this race`;
    seen.add(number);
  }
  return null;
}
