import type { Outcome } from './latest-wins.js';
/**
 * Taps that each save on their own (Here / Absent), one at a time in the order tapped: a tap made while a save is on
 * its way waits its turn. Each save starts from the newest race this phone knows when its turn comes: the one the
 * screen holds (`shown`), or the answer of the save before it when the screen does not hold that yet. So this phone's
 * own taps never save at once, and never from a race its own save has replaced. A save that fails leaves the taps
 * behind it to save.
 */
export function inTurn<Tap,Read extends {revision:number}>(save:(tap:Tap,from:Read)=>Promise<Outcome<Read>>,shown:()=>Read) {
  const waiting:Tap[]=[];
  let running=false,answered:Read|null=null;
  return async function tap(next:Tap):Promise<void> {
    waiting.push(next);
    if(running) return;
    running=true;
    try {
      while(waiting.length) {
        const held=shown(),answer=await save(waiting.shift()!,answered && answered.revision>held.revision?answered:held);
        if(typeof answer==='object') answered=answer;
      }
    } finally {waiting.length=0;running=false;}
  };
}
