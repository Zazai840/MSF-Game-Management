import { useEffect,useRef,useState,type KeyboardEvent } from 'react';
const focusable='button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]';
/**
 * A sheet's focus: the sheet takes focus as it opens (no field does), Tab and Shift+Tab stay inside it, Escape closes
 * it, and closing gives focus back to what opened it while that is still on the page. Put `ref` and `onKeyDown` on
 * the sheet's dialog.
 */
export function useSheetFocus(onClose:()=>void) {
  const ref=useRef<HTMLDivElement>(null);
  // Read while rendering, before a box inside can take focus with autoFocus.
  const [opener]=useState(()=>document.activeElement);
  useEffect(()=>{
    // A box inside that took focus as it opened (a leg box's autoFocus) keeps it, so its number pad stays open.
    if(!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape') onClose();};
    addEventListener('keydown',key);
    return ()=>{removeEventListener('keydown',key);if(opener instanceof HTMLElement && opener.isConnected) opener.focus();};
  },[]);
  function onKeyDown(event:KeyboardEvent<HTMLDivElement>) {
    if(event.key!=='Tab') return;
    const items=[...event.currentTarget.querySelectorAll<HTMLElement>(focusable)],at=items.indexOf(document.activeElement as HTMLElement);
    const to=!items.length?event.currentTarget:event.shiftKey?(at<=0?items[items.length-1]:null):(at===-1 || at===items.length-1?items[0]:null);
    if(to) {event.preventDefault();to.focus();}
  }
  return {ref,onKeyDown};
}
