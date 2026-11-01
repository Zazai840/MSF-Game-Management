import { useId } from 'react';
/** A lead screen's comment box (kept on the ruling's audit note): "Comment (optional)", or "Comment" when the screen needs one. */
export function Comment({value,onChange,required=false}:{value:string;onChange:(value:string)=>void;required?:boolean}) {
  const id=useId();
  return <div className="rz-field rz-field--text rz-field--comment"><label className="rz-field__label" htmlFor={id}>{required?'Comment':'Comment (optional)'}</label>
    <textarea className="rz-field__input" id={id} maxLength={1000} value={value} onChange={event=>onChange(event.target.value)}/></div>;
}
