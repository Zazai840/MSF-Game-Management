import { useEffect,useState } from 'react';
import type { PhonesRead } from '../../shared/phones.js';
import type { Level } from '../../shared/domain.js';
import { api } from '../api.js';
/** The role buttons a row offers, in screen order. */
const makeRole:Record<Level,string>={Lead:'Make lead','Scoring team':'Make scoring team',Volunteer:'Make volunteer'};
const roles=Object.keys(makeRole) as Level[];
/** Signed in today: who is signed in on today's Olympics day, and the scoring team's way to set a role or remove someone. */
export function Phones({onChanged,onSaved}:{onChanged:()=>Promise<void>;onSaved:()=>void}) {
  const [data,setData]=useState<PhonesRead|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [failed,setFailed]=useState(false);
  async function refresh() {
    try {setData(await api('day/phones'));setError('');}
    catch(error) {setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[]);
  async function save(path:string,body:unknown) {
    setBusy(true);setError('');setFailed(false);
    try {await api(path,body);onSaved();await Promise.all([refresh(),onChanged()]);}
    catch(error) {setError(error instanceof Error?error.message:'Could not connect');setFailed(true);}
    finally {setBusy(false);}
  }
  return <section className="day-setup" aria-label="Signed in today">
    <p className="day-intro">Everyone signed in today, oldest first. Role changes last for today only. Remove signs that person out and sends their phone to the Olympics password screen, dropping anything it hasn't saved.</p>
    {failed && <p className="day-not-saved">Not saved - try again</p>}{error && <p role="alert">{error}</p>}
    {!data && !error && <p className="day-intro">Opening Signed in today…</p>}
    <div className="day-events">{data?.phones.map(phone=><article key={phone.id} className="day-card" aria-label={phone.name}>
      <h3>{phone.name}{phone.id===data.selfId?' (you)':''}</h3><p className="day-text">{phone.level}{phone.owner?' · Owner':''}</p>
      {phone.id!==data.selfId && <div className="day-actions">
        {/* Skipping the role it already has, and every role below the owner's. */}
        {roles.filter(role=>role!==phone.level && !(phone.owner && role!=='Scoring team')).map(role=>
          <button key={role} className="button-secondary button-small" disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/role`,{role})}>{makeRole[role]}</button>)}
        <button className="button-secondary button-small" disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/remove`,{})}>Remove</button>
      </div>}
    </article>)}</div>
    {!!data?.auditNotes.length && <details className="day-card day-audit"><summary>Phone and access audit notes</summary><ol>{data.auditNotes.map(note=><li key={note.id}>{note.message} · {note.actor} · <time dateTime={note.at}>{new Date(note.at).toLocaleString()}</time></li>)}</ol></details>}
  </section>;
}
