import { useId,useState } from 'react';
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
