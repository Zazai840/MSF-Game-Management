import { useId,useState,type ReactNode } from 'react';
import { changeReasons,type ChangeReason } from '../../shared/rulings.js';
import { Sheet } from './parts.js';
/**
 * "Why the change?" after a final's line-up is changed by hand: one tap on a reason, and "More (optional)", which Other
 * needs. "Wrong number" shows only on a replace (`wrongNumber`). Save answers the reason; Cancel or Close saves nothing.
 */
export function ReasonSheet({wrongNumber,onSave,onClose}:{wrongNumber:boolean;onSave:(reason:ChangeReason)=>void;onClose:()=>void}) {
  const id=useId(),[reason,setReason]=useState<ChangeReason['reason']|null>(null),[text,setText]=useState('');
  const other=reason==='Other',ready=reason!==null && (!other || text.trim()!=='');
  return <Sheet title="Why the change?" onClose={onClose}>
    <div className="rz-choices rz-choices--stack" role="group" aria-label="Why the change?">
      {changeReasons.filter(item=>wrongNumber || item!=='Wrong number').map(item=><button key={item} type="button" className="rz-choice" aria-pressed={item===reason} onClick={()=>setReason(item)}>{item}</button>)}
    </div>
    <div className="rz-field rz-field--text"><label className="rz-field__label" htmlFor={id}>{other?'More':'More (optional)'}</label>
      <textarea className="rz-field__input rz-field__input--comment" id={id} value={text} maxLength={1000} onChange={event=>setText(event.target.value)}/></div>
    <div className="rz-sheet__pair">
      <button type="button" className="rz-btn" onClick={onClose}>Cancel</button>
      <button type="button" className="rz-btn rz-btn--primary" disabled={!ready} onClick={()=>onSave({reason:reason!,text:text.trim()||null})}>Save</button>
    </div>
  </Sheet>;
}
/**
 * "Ask why first" on a final: `ask(pending)` opens "Why the change?" for a change waiting on it (a number, a team), and
 * Save calls `onSave` with it and the reason. `sheet` is the sheet to draw. Cancel or Close saves nothing.
 */
export function useReason<Pending>(wrongNumber:boolean,onSave:(pending:Pending,reason:ChangeReason)=>unknown):{ask:(pending:Pending)=>void;sheet:ReactNode} {
  const [waiting,setWaiting]=useState<{pending:Pending}|null>(null);
  const sheet=waiting && <ReasonSheet wrongNumber={wrongNumber} onClose={()=>setWaiting(null)} onSave={reason=>{setWaiting(null);void onSave(waiting.pending,reason);}}/>;
  return {ask:pending=>setWaiting({pending}),sheet};
}
