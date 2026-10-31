import { useEffect,useRef,useState } from 'react';
import type { RaceSummary,Step } from '../../shared/race-flow.js';
import { ApiFailure,api } from '../api.js';
import { failureLine } from './writes.js';
import { Icon } from './parts.js';
import type { SavedStep } from './RaceShell.js';
/** How long the toast stays, unless it has focus. */
const showFor=6000;
/**
 * The toast on Races after a step is saved: "Times saved · Girl Cubs Heat 2" with Undo, which reverses only this
 * person's own save and reopens the race at that step. If someone else has changed the same step since, Undo would
 * wipe out their work, so it offers Open race instead. 6 seconds, paused while focused.
 */
export function Toast({saved,race,onOpen,onClose}:{saved:SavedStep;race:RaceSummary|undefined;onOpen:(raceId:string,step:Step)=>void;onClose:()=>void}) {
  const [changedBy,setChangedBy]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [focused,setFocused]=useState(false),box=useRef<HTMLDivElement>(null);
  const status=race?.steps[saved.step];
  // Someone changed the step after this save: its version moved on.
  const changed=changedBy ?? (status && status.version!==saved.version?status.by??'Someone':null);
  useEffect(()=>{if(focused) return;const timer=window.setTimeout(onClose,showFor);return ()=>clearTimeout(timer);},[focused,changed]);
  async function undo() {
    setBusy(true);setError('');
    try {await api(`races/${saved.raceId}/steps/${saved.step}/undone`,{version:saved.version});onClose();onOpen(saved.raceId,saved.step);}
    catch(failure) {
      const body=failure instanceof ApiFailure?failure.body as {reason?:string;by?:string|null}:{};
      if(body.reason==='changed-since') setChangedBy(body.by??'Someone');else setError(failureLine(failure));
    } finally {setBusy(false);}
  }
  return <div ref={box} className="rz-toast" role="status" onFocus={()=>setFocused(true)} onBlur={event=>{if(!box.current?.contains(event.relatedTarget)) setFocused(false);}}>
    <span className="rz-toast__msg"><Icon name={error?'warning':'check'}/>{error||(changed?`${changed} changed this since. Open the race to edit it.`:saved.message)}</span>
    {changed?<button type="button" onClick={()=>{onClose();onOpen(saved.raceId,saved.step);}}>Open race</button>:<button type="button" disabled={busy} onClick={()=>void undo()}>Undo</button>}
  </div>;
}
