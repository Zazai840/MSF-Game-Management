import { useEffect,useState } from 'react';
import { canMakeRole, type PhonesRead,type SignedInRow } from '../../shared/phones.js';
import type { Level } from '../../shared/domain.js';
import { roleLabels } from '../../shared/race-flow.js';
import { api,StaleRequest } from '../api.js';
import { clock,clockWithSeconds } from '../../shared/clock.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';
import { useToast } from '../races/Toast.js';
import { ErrorCallout,Sheet } from '../races/parts.js';
import { LeadBar } from './LeadBar.js';
import { UpdatedAt } from '../races/UpdatedAt.js';
/** The role buttons a card offers, in screen order. */
const makeRole:Record<Level,string>={Lead:'Make lead',Volunteer:'Make volunteer'};
const roles=Object.keys(makeRole) as Level[];
/**
 * Signed in today: a card per person signed in on today's Olympics day, oldest first, with the job their phone last
 * reported (ADR 0007) and a lead's way to set a role
 * (saved at once) or remove someone (asked first in a sheet). The phone and access audit notes sit in Notes at the foot.
 */
export function SignedInToday({onSaved}:{onSaved:()=>void}) {
  const [data,setData]=useState<PhonesRead|null>(null);
  const [updated,setUpdated]=useState('');
  const [busy,setBusy]=useState(false);
  const [readError,setReadError]=useState<unknown>(null);
  const [saveError,setSaveError]=useState<unknown>(null);
  const [removing,setRemoving]=useState<SignedInRow|null>(null);
  const toast=useToast();
  async function refresh() {
    try {setData(await api('day/phones'));setUpdated(clockWithSeconds(new Date()));setReadError(null);}
    catch(error) {if(!(error instanceof StaleRequest)) setReadError(error);}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[]);
  async function save(path:string,body:unknown,saved:ToastSave) {
    setBusy(true);setSaveError(null);
    try {await api(path,body);toast({message:toastLine(saved)});onSaved();await refresh();}
    catch(error) {setSaveError(error);}
    finally {setBusy(false);}
  }
  function remove(phone:SignedInRow) {setRemoving(null);void save(`day/phones/${phone.id}/remove`,{},{kind:'removed',name:phone.name});}
  return <LeadBar title="Signed in today" up="Day setup" body={<>
    <main className="rz-main">
      <p className="rz-empty">Role changes last for today only.</p>
      {saveError!==null && <ErrorCallout error={saveError} action="save"/>}
      {readError!==null && <ErrorCallout error={readError} action="read"/>}
      {!data && readError===null && <p className="rz-empty">Opening…</p>}
      {data?.phones.map(phone=><article key={phone.id} className="rz-codecard" aria-label={phone.name}>
        <h3 className="rz-person__name">{phone.name}{phone.id===data.selfId?' (you)':''}</h3><p className="rz-codecard__text">{phone.level}{phone.owner?' · Owner':''}{phone.role?` · ${roleLabels[phone.role]}`:''}</p>
        {phone.id!==data.selfId && <div className="rz-person__actions">
          {/* Skipping the role it already has, and Make volunteer for the owner. */}
          {roles.filter(role=>role!==phone.level && canMakeRole(phone,role)).map(role=>
            <button key={role} type="button" className="rz-btn rz-btn--small" disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/role`,{role},{kind:'role',name:phone.name,role})}>{makeRole[role]}</button>)}
          <button type="button" className="rz-btn rz-btn--small rz-btn--danger" disabled={busy} onClick={()=>setRemoving(phone)}>Remove</button>
        </div>}
      </article>)}
      {!!data?.auditNotes.length && <details className="rz-disclosure"><summary>Notes ({data.auditNotes.length})</summary><div className="rz-disclosure__body">
        {data.auditNotes.map(note=><span key={note.id}>{note.message} · {note.actor} · <time dateTime={note.at}>{clock(note.at)}</time></span>)}</div></details>}
      <UpdatedAt time={updated} onRefresh={()=>void refresh()}/>
    </main>
    {removing && <Sheet title={`Remove ${removing.name}?`} onClose={()=>setRemoving(null)}>
      <p className="rz-sheet__text">Their phone goes back to Join and drops anything it has not saved. They can join again with the Olympics password.</p>
      <div className="rz-sheet__pair">
        <button type="button" className="rz-btn" onClick={()=>setRemoving(null)}>Keep {removing.name}</button>
        <button type="button" className="rz-btn rz-btn--danger" onClick={()=>remove(removing)}>Remove {removing.name}</button>
      </div>
    </Sheet>}
  </>}/>;
}
