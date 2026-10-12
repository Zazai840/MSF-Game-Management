import { useEffect,useRef,type KeyboardEvent,type ReactNode } from 'react';
const focusable='button:not(:disabled),select:not(:disabled),textarea:not(:disabled),input:not(:disabled),a[href]';
/** A modal sheet also works on supported iOS 15 browsers without native dialog. */
export function ActionSheet({title,busy=false,focusKey,children,onClose}:{title:string;busy?:boolean;focusKey?:string;children:ReactNode;onClose:()=>void}) {
  const sheet=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  useEffect(()=>{sheet.current?.querySelector<HTMLElement>(focusable)?.focus();},[focusKey]);
  function keyboard(event:KeyboardEvent) {
    if(event.key==='Escape') {event.preventDefault();event.stopPropagation();if(!busy) onClose();}
    if(event.key!=='Tab') return;
    const items=Array.from(sheet.current?.querySelectorAll<HTMLElement>(focusable)||[]);
    const first=items[0],last=items[items.length-1];
    if(!first) {event.preventDefault();sheet.current?.focus();}
    else if(event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
  }
  return <div className="action-sheet-overlay"><section ref={sheet} className="runner-actions" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={keyboard}>{children}</section></div>;
}
