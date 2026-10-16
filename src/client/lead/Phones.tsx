import { useEffect,useState } from 'react';
import type { PhonesRead } from '../../shared/phones.js';
import { api } from '../api.js';
import { clock } from '../../shared/clock.js';
/** v1's joined phones: who joined today, and the scoring team's way to promote, demote or remove a phone. */
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
  return <section className="day-setup" aria-label="Managing phones and leads">
    <p className="day-intro">Everyone who joined today. Remove sends that phone back to Join on its next request and drops anything it hasn't saved.</p>
    {failed && <p className="day-not-saved">Not saved - try again</p>}{error && <p role="alert">{error}</p>}
    {!data && !error && <p className="day-intro">Opening joined phones…</p>}
    <div className="day-events">{data?.phones.map(phone=><article key={phone.id} className="day-card" aria-label={`Phone ${phone.name}`}>
      <h3>{phone.name}{phone.id===data.selfId?' (you)':''}</h3><p className="day-text">{phone.level}</p>
      {phone.id!==data.selfId && <div className="day-actions">
        {phone.level==='Lead' && <button className="button-secondary button-small" disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/scoring-team`,{scoringTeam:true})}>Make scoring team</button>}
        {phone.level==='Scoring team' && <button className="button-secondary button-small" disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/scoring-team`,{scoringTeam:false})}>Remove from scoring team</button>}
        <button className="button-secondary button-small" disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/remove`,{})}>Remove</button>
      </div>}
    </article>)}</div>
    {!!data?.auditNotes.length && <details className="day-card day-audit"><summary>Phone and access audit notes</summary><ol>{data.auditNotes.map(note=><li key={note.id}>{note.message} · {note.actor} · <time dateTime={note.at}>{clock(note.at)}</time></li>)}</ol></details>}
  </section>;
}
