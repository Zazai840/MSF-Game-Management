import { useEffect,useState } from 'react';
import { canMakeRole, type PhonesRead,type SignedInRow } from '../../shared/phones.js';
import type { Level } from '../../shared/domain.js';
import { roleLabels } from '../../shared/race-flow.js';
import { api,StaleRequest } from '../api.js';
import { clock,clockWithSeconds } from '../../shared/clock.js';
import { toastLine,type ToastSave } from '../../shared/toast-lines.js';
import { useToast } from '../races/Toast.js';
import { ErrorCallout,Icon,Sheet } from '../races/parts.js';
import { LeadBar } from './LeadBar.js';
import { UpdatedAt } from '../races/UpdatedAt.js';
/** The role buttons a person's sheet offers, in screen order. */
const makeRole:Record<Level,string>={Lead:'Make lead',Volunteer:'Make volunteer'};
const roles=Object.keys(makeRole) as Level[];
/**
 * Signed in today: a row per person signed in on today's Olympics day, oldest first, with the job their phone last
 * reported (ADR 0007). A tap on another person's row opens their sheet: a lead's way to set a role (saved at once) or
 * remove them (asked first in a second sheet). The lead's own row opens nothing. The phone and access audit notes sit
 * in Notes at the foot.
 */
export function SignedInToday({onSaved}:{onSaved:()=>void}) {
  const [data,setData]=useState<PhonesRead|null>(null);
  const [updated,setUpdated]=useState('');
  const [busy,setBusy]=useState(false);
  const [readError,setReadError]=useState<unknown>(null);
  const [saveError,setSaveError]=useState<unknown>(null);
  const [removing,setRemoving]=useState<SignedInRow|null>(null);
  const [openId,setOpenId]=useState<string|null>(null);
  const toast=useToast();
  async function refresh() {
    try {setData(await api('day/phones'));setUpdated(clockWithSeconds(new Date()));setReadError(null);}
    catch(error) {if(!(error instanceof StaleRequest)) setReadError(error);}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[]);
  async function save(path:string,body:unknown,saved:ToastSave) {
    setOpenId(null);setBusy(true);setSaveError(null);
    try {await api(path,body);toast({message:toastLine(saved)});onSaved();await refresh();}
    catch(error) {setSaveError(error);}
    finally {setBusy(false);}
  }
  function remove(phone:SignedInRow) {setRemoving(null);void save(`day/phones/${phone.id}/remove`,{},{kind:'removed',name:phone.name});}
  // Read from the newest list, so the sheet never offers a role the person already has and closes when they are gone.
  const open=data?.phones.find(phone=>phone.id===openId);
  return <LeadBar title="Signed in today" up="Day setup" body={<>
    <main className="rz-main">
      <p className="rz-empty">Role changes last for today only.</p>
      {saveError!==null && <ErrorCallout error={saveError} action="save"/>}
      {readError!==null && <ErrorCallout error={readError} action="read"/>}
      {!data && readError===null && <p className="rz-empty">Opening…</p>}
      {!!data?.phones.length && <ul className="rz-list">{data.phones.map(phone=>{
        const main=<span className="rz-listrow__main"><span className="rz-listrow__label">{phone.name}{phone.id===data.selfId?' (you)':''}</span>
          <span className="rz-listrow__meta">{phone.level}{phone.owner?' · Owner':''}{phone.role?` · ${roleLabels[phone.role]}`:''}</span></span>;
        return <li key={phone.id}>{phone.id===data.selfId?<div className="rz-listrow">{main}</div>
          :<button type="button" className="rz-listrow" disabled={busy} onClick={()=>setOpenId(phone.id)}>{main}<Icon name="chevron-right" className="rz-icon--bold"/></button>}</li>;
      })}</ul>}
      {!!data?.auditNotes.length && <details className="rz-disclosure"><summary>Notes ({data.auditNotes.length})</summary><div className="rz-disclosure__body">
        {data.auditNotes.map(note=><span key={note.id}>{note.message} · {note.actor} · <time dateTime={note.at}>{clock(note.at)}</time></span>)}</div></details>}
      <UpdatedAt time={updated} onRefresh={()=>void refresh()}/>
    </main>
    {open && <Sheet title={open.name} onClose={()=>setOpenId(null)}>
      <div className="rz-sheet__actions">
        {/* Skipping the role it already has, and Make volunteer for the owner. */}
        {roles.filter(role=>role!==open.level && canMakeRole(open,role)).map(role=>
          <button key={role} type="button" className="rz-btn rz-btn--block" onClick={()=>void save(`day/phones/${open.id}/role`,{role},{kind:'role',name:open.name,role})}>{makeRole[role]}</button>)}
        <button type="button" className="rz-btn rz-btn--block rz-btn--danger rz-sheet__apart" onClick={()=>{setOpenId(null);setRemoving(open);}}>Remove</button>
      </div>
    </Sheet>}
    {removing && <Sheet title={`Remove ${removing.name}?`} onClose={()=>setRemoving(null)}>
      <p className="rz-sheet__text">Their phone goes back to Join and drops anything it has not saved. They can join again with the Olympics password.</p>
      <div className="rz-sheet__pair">
        <button type="button" className="rz-btn" onClick={()=>setRemoving(null)}>Keep {removing.name}</button>
        <button type="button" className="rz-btn rz-btn--danger" onClick={()=>remove(removing)}>Remove {removing.name}</button>
      </div>
    </Sheet>}
  </>}/>;
}
