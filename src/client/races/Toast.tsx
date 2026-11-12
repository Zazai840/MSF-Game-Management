import { createContext,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import type { RacesRead,Step } from '../../shared/race-flow.js';
import { ApiFailure,api } from '../api.js';
import { useLive } from '../live.js';
import { failureLine } from '../../shared/request-failure.js';
import { changedSinceLine } from '../../shared/toast-lines.js';
import { Icon } from './parts.js';
import type { SavedStep } from './RaceShell.js';
/** How long the toast stays, its fade-out included, unless it has focus or is held. */
const showFor=3000;
/** The length of the fade-out in race-flow.css (.rz-toast--out), used only to start it in time: the toast is removed when the fade itself ends. */
const fadeOutFor=150;
/** What the toast shows: one line naming what was saved (see toastLine), and only for a race step, the saved step that makes Undo work. */
export interface ToastShown { message:string; saved?:SavedStep }
/** Shows the app's one toast from any screen; a new toast takes the place of the one showing. */
export const ToastContext=createContext<(toast:ToastShown)=>void>(()=>{});
export const useToast=()=>useContext(ToastContext);
/**
 * The race-flow toast, above any docked button: one line, 3 seconds, paused while focused. A lead save shows its line
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
/**
 * The toast's pill, a rounded box once its line wraps to a second row: it fades in, and fades out to close after
 * 3 seconds. The count waits while the toast is focused or `held`, and starts again after that and when `restartOn` changes.
 */
function ToastBox({held=false,restartOn,onClose,children}:{held?:boolean;restartOn?:unknown;onClose:()=>void;children:ReactNode}) {
  const [focused,setFocused]=useState(false),[wrapped,setWrapped]=useState(false),[leaving,setLeaving]=useState(false),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(focused || held) return;
    // With reduced motion there is no fade to wait for (race-flow.css), so the toast goes at the full time.
    const still=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fade=still?undefined:window.setTimeout(()=>setLeaving(true),showFor-fadeOutFor);
    // The fade's end removes the toast (onTransitionEnd). A fade that never reports its end must not leave an unseen toast in the page, so this closes it just after.
    const close=window.setTimeout(onClose,still?showFor:showFor+fadeOutFor);
    // Focus, a hold or a new count brings back a toast that had started to leave.
    return ()=>{clearTimeout(fade);clearTimeout(close);setLeaving(false);};
  },[focused,held,restartOn]);
  useClearOfButtons(box);
  // CSS cannot tell that a line has wrapped: one row is never taller than the 44px touch size, two rows always are.
  useLayoutEffect(()=>{
    const element=box.current!,observer=new ResizeObserver(()=>setWrapped(element.offsetHeight>44));
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  return <div ref={box} className={`rz-toast${wrapped?' rz-toast--box':''}${leaving?' rz-toast--out':''}`} role="status"
    onTransitionEnd={event=>{if(leaving && event.target===event.currentTarget) onClose();}} onFocus={()=>setFocused(true)} onBlur={event=>{if(!box.current?.contains(event.relatedTarget)) setFocused(false);}}>{children}</div>;
}
/**
 * After a step is saved: "Times saved" with Undo, which reverses only this person's own save and
 * reopens the race at that step. If someone else has changed the same step since, Undo would wipe out their work, so
 * it offers Open race instead. It watches the races list (one shared read for every phone) to see that change.
 */
function StepToast({saved,onOpen,onClose}:{saved:SavedStep;onOpen:(raceId:string,step:Step)=>void;onClose:()=>void}) {
  const {snapshot}=useLive<RacesRead>('live/races');
  const [refusedFor,setRefusedFor]=useState<{by:string|null}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const status=snapshot?.groups.flatMap(group=>group.races).find(race=>race.id===saved.raceId)?.steps[saved.step];
  // Someone changed the step after this save: its version moved on, or the server refused the Undo for it. `by` is null when nobody is named.
  const changed=refusedFor ?? (status && status.version!==saved.version?{by:status.by??null}:null);
  async function undo() {
    setBusy(true);setError('');
    try {await api(`races/${saved.raceId}/steps/${saved.step}/undone`,{version:saved.version});onClose();onOpen(saved.raceId,saved.step);}
    catch(failure) {
      const body=failure instanceof ApiFailure?failure.body as {reason?:string;by?:string|null}:{};
      if(body.reason==='changed-since') setRefusedFor({by:body.by??null});else setError(failureLine(failure,'save'));
    } finally {setBusy(false);}
  }
  // Held while the Undo is on its way: its answer, a failure line included, then gets the full 3 seconds.
  return <ToastBox held={busy} restartOn={Boolean(changed)} onClose={onClose}>
    <span className="rz-toast__msg"><Icon name={error?'warning':'check'}/>{error||(changed?changedSinceLine(changed.by):saved.message)}</span>
    {changed?<button type="button" onClick={()=>{onClose();onOpen(saved.raceId,saved.step);}}>Open race</button>:<button type="button" disabled={busy} onClick={()=>void undo()}>Undo</button>}
  </ToastBox>;
}
