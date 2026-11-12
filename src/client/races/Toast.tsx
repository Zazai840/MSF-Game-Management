import { createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import type { RacesRead,Step } from '../../shared/race-flow.js';
import { ApiFailure,api } from '../api.js';
import { useLive } from '../live.js';
import { failureLine } from '../../shared/request-failure.js';
import { Icon,useWayOut } from './parts.js';
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
export function Toast({toast,onOpen,onClose}:{toast:ToastShown;onOpen:(raceId:string,step:Step)=>void;onClose:()=>void}) {
  return toast.saved?<StepToast saved={toast.saved} onOpen={onOpen} onClose={onClose}/>
    :<ToastBox onClose={onClose}><span className="rz-toast__msg"><Icon name="check"/>{toast.message}</span></ToastBox>;
}
/**
 * Where the toast sits: just above whatever is fixed at the foot of the screen (an open sheet, a docked button, the
 * lead's bar), so it never covers a button. The "Updated at" line is not in its way: the toast may cover it.
 */
function useClearOfButtons(box:{current:HTMLElement|null}) {
  useLayoutEffect(()=>{
    const place=()=>{
      const tops=[...document.querySelectorAll<HTMLElement>('.rz-leads-bar, .rz-footer--sticky > :not(.rz-refresh, .rz-pull)')].map(fixed=>fixed.getBoundingClientRect()).filter(rect=>rect.height).map(rect=>rect.top);
      // A sheet by where it ends up, not where it is on its way in.
      for(const sheet of document.querySelectorAll<HTMLElement>('.rz-scrim:not([data-closing]) > .rz-sheet')) tops.push(sheet.parentElement!.getBoundingClientRect().top+sheet.offsetTop);
      const floor=Math.min(innerHeight,...tops);
      if(box.current) box.current.style.bottom=floor<innerHeight?`${innerHeight-floor+8}px`:'';
    };
    place();
    const observer=new MutationObserver(place);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-closing','data-keyboard']});
    addEventListener('resize',place);
    return ()=>{observer.disconnect();removeEventListener('resize',place);};
  },[]);
}
/** The toast's box: it closes after 6 seconds, the count starting again when `restartOn` changes, and waits while focused. */
function ToastBox({restartOn,onClose,children}:{restartOn?:unknown;onClose:()=>void;children:ReactNode}) {
  const [focused,setFocused]=useState(false),box=useRef<HTMLDivElement>(null),out=useWayOut(onClose);
  useEffect(()=>{if(focused) return;const timer=window.setTimeout(out.start,showFor);return ()=>clearTimeout(timer);},[focused,restartOn]);
  useClearOfButtons(box);
  return <div ref={box} className="rz-toast" data-leaving={out.leaving?'':undefined} role="status" onFocus={()=>setFocused(true)} onBlur={event=>{if(!box.current?.contains(event.relatedTarget)) setFocused(false);}}>{children}</div>;
}
/**
 * After a step is saved: "Times saved · Girl Cubs Heat 2" with Undo, which reverses only this person's own save and
 * reopens the race at that step. If someone else has changed the same step since, Undo would wipe out their work, so
 * it offers Open race instead. It watches the races list (one shared read for every phone) to see that change.
 */
function StepToast({saved,onOpen,onClose}:{saved:SavedStep;onOpen:(raceId:string,step:Step)=>void;onClose:()=>void}) {
  const {snapshot}=useLive<RacesRead>('live/races');
  const [changedBy,setChangedBy]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const status=snapshot?.groups.flatMap(group=>group.races).find(race=>race.id===saved.raceId)?.steps[saved.step];
  // Someone changed the step after this save: its version moved on.
  const changed=changedBy ?? (status && status.version!==saved.version?status.by??'Someone':null);
  async function undo() {
    setBusy(true);setError('');
    try {await api(`races/${saved.raceId}/steps/${saved.step}/undone`,{version:saved.version});onClose();onOpen(saved.raceId,saved.step);}
    catch(failure) {
      const body=failure instanceof ApiFailure?failure.body as {reason?:string;by?:string|null}:{};
      if(body.reason==='changed-since') setChangedBy(body.by??'Someone');else setError(failureLine(failure,'save'));
    } finally {setBusy(false);}
  }
  return <ToastBox restartOn={changed} onClose={onClose}>
    <span className="rz-toast__msg"><Icon name={error?'warning':'check'}/>{error||(changed?`${changed} changed this since. Open the race to edit it.`:saved.message)}</span>
    {changed?<button type="button" onClick={()=>{onClose();onOpen(saved.raceId,saved.step);}}>Open race</button>:<button type="button" disabled={busy} onClick={()=>void undo()}>Undo</button>}
  </ToastBox>;
}
