import { useState } from 'react';
import { timeRefusal } from '../../shared/time-entry.js';
/**
 * A time box's refusal of the digits typed, shared by the Timer and the lead's Correct times. `check` refuses digits
 * no one can run for the event and answers whether it did; each refusal raises `count`, which goes in the box's
 * selectKey so its digits are selected again and the next digit replaces them. `clear` on every edit.
 */
export function useTimeRefusal() {
  const [message,setMessage]=useState<string|null>(null),[count,setCount]=useState(0);
  return {message,count,clear:()=>setMessage(null),check(digits:string,eventName:string) {
    const refused=timeRefusal(digits,eventName);
    if(refused) {setMessage(refused);setCount(previous=>previous+1);}
    return !!refused;
  }};
}
