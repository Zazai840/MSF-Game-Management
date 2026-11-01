import { useEffect,type ComponentProps,type RefObject } from 'react';
import { formatTimeDigits,typedTimeDigits } from '../../shared/time-entry.js';
/** Keeps only the digits, whatever the keyboard or a paste let through. */
export const digitsOnly=(value:string)=>value.replace(/\D/g,'');
/**
 * A box on the phone's own number pad, holding digits. A time box (`time`) shows the time itself, filling from the
 * right like a calculator (1 2 3 4 shows 12.34), so a screen reader reads the time; backspace takes off the last
 * digit, and the point key, any other non-digit and a 7th digit do nothing.
 */
export function NumberBox({ref,time=false,value,onChange,...rest}:Omit<ComponentProps<'input'>,'ref'|'value'|'onChange'>&{
  ref:RefObject<HTMLInputElement|null>; time?:boolean; value:string; onChange:(digits:string)=>void;
}) {
  useEffect(()=>{
    const box=ref.current;
    if(!time || !box) return;
    // A phone's backspace arrives as a cancellable beforeinput: take off the last digit, wherever the cursor is.
    // Without one, the browser's own delete at the end of the box does the same, read back by onChange.
    const backspace=(event:InputEvent)=>{
      if(event.inputType!=='deleteContentBackward' || !event.cancelable || box.readOnly || box.selectionStart!==box.selectionEnd) return;
      event.preventDefault();onChange(value.slice(0,-1));
    };
    box.addEventListener('beforeinput',backspace);
    return ()=>box.removeEventListener('beforeinput',backspace);
  },[ref,time,value,onChange]);
  return <input ref={ref} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" autoCorrect="off" spellCheck={false} {...rest}
    value={time?value && formatTimeDigits(value):value} onChange={event=>onChange(time?typedTimeDigits(value,event.target.value):digitsOnly(event.target.value))}/>;
}
