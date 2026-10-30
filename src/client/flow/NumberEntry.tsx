import { useEffect,useLayoutEffect,useRef,type ReactNode } from 'react';
import { ActionBar } from './ActionBar.js';
import './flow.css';
/** Keeps only the digits, whatever the keyboard or a paste let through. */
export const digitsOnly=(value:string)=>value.replace(/\D/g,'');
/**
 * One number typed on the phone's own number pad, entry after entry (wristbands, times).
 * The same input stays mounted and focused between entries so the keyboard never closes;
 * Enter, the keyboard's Next/Go key and the Next button all call onNext.
 * While `held` (a warning is waiting for Fix or Keep) the keyboard closes; when released it opens again, the box selected.
 */
export function NumberEntry({label,value,onChange,onNext,held=false,busy=false,nextLabel='Next',placeholder,display,extraAction,selectKey}:{
  label:string; value:string; onChange:(digits:string)=>void; onNext:()=>void;
  held?:boolean; busy?:boolean; nextLabel?:string; placeholder?:string;
  /** Shown under the input as you type, for example "Shows as 12.95". */
  display?:ReactNode;
  /** A button beside Next, for example Cancel while retyping a time. */
  extraAction?:ReactNode;
  /** Changing this selects whatever is in the input, so the first digit typed replaces it (retyping a time). */
  selectKey?:string|number;
}) {
  const input=useRef<HTMLInputElement>(null);
  const wasHeld=useRef(held);
  useLayoutEffect(()=>{
    if(held) input.current?.blur();
    // Released: anything left in the box (a wristband kept to fix) is selected, so typing replaces it.
    else if(wasHeld.current) {input.current?.focus();input.current?.select();}
    wasHeld.current=held;
  },[held]);
  // Opening the step puts the cursor straight in the input (mount only).
  useEffect(()=>{if(!wasHeld.current) input.current?.focus({preventScroll:true});},[]);
  useLayoutEffect(()=>{if(selectKey!==undefined && !held) input.current?.select();},[selectKey]);
  const ready=!held && !busy && value!=='';
  function next() {input.current?.focus();if(ready) onNext();}
  const field=<input ref={input} className={held?'number-input number-input-held':'number-input'} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" autoComplete="off" autoCorrect="off" spellCheck={false}
    placeholder={placeholder} value={value} readOnly={busy || held}
    onChange={event=>onChange(digitsOnly(event.target.value))}
    onKeyDown={event=>{if(event.key==='Enter' && !event.nativeEvent.isComposing) {event.preventDefault();next();}}}/>;
  // Keep focus in the input on tap, so the keyboard stays open between entries.
  const nextButton=<button type="button" className="action-next" disabled={!ready} onMouseDown={event=>event.preventDefault()} onClick={next}>{busy?'Checking…':nextLabel}</button>;
  return <div className="number-entry">
    <label>{label}{field}</label>
    {display}
    <ActionBar>{extraAction}{nextButton}</ActionBar>
  </div>;
}
