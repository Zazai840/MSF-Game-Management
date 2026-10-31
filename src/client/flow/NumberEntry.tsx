import { useEffect,useLayoutEffect,useRef,type ComponentProps,type ReactNode,type RefObject } from 'react';
import { formatTimeDigits,typedTimeDigits } from '../../shared/time-entry.js';
import { ActionBar } from './ActionBar.js';
import './flow.css';
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
/**
 * One number typed on the phone's own number pad, entry after entry (wristbands, times).
 * The same input stays mounted and focused between entries so the keyboard never closes;
 * Enter, the keyboard's Next/Go key and the Next button all call onNext.
 * While `held` (a warning is waiting for Fix or Keep) the keyboard closes; when released it opens again, the box selected.
 */
export function NumberEntry({label,value,onChange,onNext,held=false,busy=false,nextLabel='Next',placeholder,display,extraAction,selectKey,time=false}:{
  label:string; value:string; onChange:(digits:string)=>void; onNext:()=>void;
  /** A time box: see NumberBox. */
  time?:boolean;
  held?:boolean; busy?:boolean; nextLabel?:string; placeholder?:string;
  /** Shown under the input, for example the time box's hint. */
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
  const field=<NumberBox ref={input} time={time} className={held?'number-input number-input-held':'number-input'}
    placeholder={placeholder} value={value} readOnly={busy || held} onChange={onChange}
    onKeyDown={event=>{if(event.key==='Enter' && !event.nativeEvent.isComposing) {event.preventDefault();next();}}}/>;
  // Keep focus in the input on tap, so the keyboard stays open between entries.
  const nextButton=<button type="button" className="action-next" disabled={!ready} onMouseDown={event=>event.preventDefault()} onClick={next}>{busy?'Checking…':nextLabel}</button>;
  return <div className="number-entry">
    <label>{label}{field}</label>
    {display}
    <ActionBar>{extraAction}{nextButton}</ActionBar>
  </div>;
}
