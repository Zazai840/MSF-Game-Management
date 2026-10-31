import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import type { RacesRead } from '../../shared/race-flow.js';
import { ApiFailure,api } from '../api.js';
import { useLive } from '../live.js';
import { Icon } from './parts.js';
import type { SavedStep } from './RaceShell.js';
/** How long the toast stays, unless it has focus. */
const showFor=6000;
/** What the toast shows: one line naming what was saved (see toastLine), and only for a race step, the saved step that makes Undo work. */
export interface ToastShown { message:string; saved?:SavedStep }
/** Shows the app's one toast from any screen; a new toast takes the place of the one showing. */
export const ToastContext=createContext<(toast:ToastShown)=>void>(()=>{});
export const useToast=()=>useContext(ToastContext);
/**
 * The race-flow toast, above any docked button: one line, 6 seconds, paused while focused. A lead save shows its line
 * alone; a race step's save also offers Undo.
 */
export function Toast({toast,onOpen,onClose}:{toast:ToastShown;onOpen:(raceId:string)=>void;onClose:()=>void}) {
  return toast.saved?<StepToast saved={toast.saved} onOpen={onOpen} onClose={onClose}/>
    :<ToastBox onClose={onClose}><span className="rz-toast__msg"><Icon name="check"/>{toast.message}</span></ToastBox>;
}
/** The toast's box: it closes after 6 seconds, the count starting again when `again` changes, and waits while focused. */
function ToastBox({again,onClose,children}:{again?:unknown;onClose:()=>void;children:ReactNode}) {
  const [focused,setFocused]=useState(false),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(focused) return;const timer=window.setTimeout(onClose,showFor);return ()=>clearTimeout(timer);},[focused,again]);
  return <div ref={box} className="rz-toast" role="status" onFocus={()=>setFocused(true)} onBlur={event=>{if(!box.current?.contains(event.relatedTarget)) setFocused(false);}}>{children}</div>;
}
/**
 * After a step is saved: "Times saved · Girl Cubs Heat 2" with Undo, which reverses only this person's own save and
 * reopens the race at that step. If someone else has changed the same step since, Undo would wipe out their work, so
 * it offers Open race instead. It watches the races list (one shared read for every phone) to see that change.
 */
function StepToast({saved,onOpen,onClose}:{saved:SavedStep;onOpen:(raceId:string)=>void;onClose:()=>void}) {
  const {snapshot}=useLive<RacesRead>('live/races');
  const [changedBy,setChangedBy]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const status=snapshot?.groups.flatMap(group=>group.races).find(race=>race.id===saved.raceId)?.steps[saved.step];
  // Someone changed the step after this save: its version moved on.
  const changed=changedBy ?? (status && status.version!==saved.version?status.by??'Someone':null);
  async function undo() {
    setBusy(true);setError('');
    try {await api(`races/${saved.raceId}/steps/${saved.step}/undone`,{version:saved.version});onClose();onOpen(saved.raceId);}
    catch(failure) {
      const body=failure instanceof ApiFailure?failure.body as {reason?:string;by?:string|null}:{};
      if(body.reason==='changed-since') setChangedBy(body.by??'Someone');else setError(failure instanceof Error?failure.message:'Could not undo');
    } finally {setBusy(false);}
  }
  return <ToastBox again={changed} onClose={onClose}>
    <span className="rz-toast__msg"><Icon name="check"/>{error||(changed?`${changed} changed this since. Open the race to edit it.`:saved.message)}</span>
    {changed?<button type="button" onClick={()=>{onClose();onOpen(saved.raceId);}}>Open race</button>:<button type="button" disabled={busy} onClick={()=>void undo()}>Undo</button>}
  </ToastBox>;
}
