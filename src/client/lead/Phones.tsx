import { useEffect,useState } from 'react';
import type { PhonesRead } from '../../shared/phones.js';
import { api } from '../api.js';
export function Phones({onChanged}:{onChanged:()=>Promise<void>}) {
  const [data,setData]=useState<PhonesRead|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  async function refresh() {
    try {setData(await api('day/phones'));setError('');}
    catch(error) {setError(error instanceof Error?error.message:'Could not connect');}
  }
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[]);
  async function save(path:string,body:unknown,success:string) {
    setBusy(true);setError('');setMessage('');
    try {await api(path,body);setMessage(success);await Promise.all([refresh(),onChanged()]);}
    catch(error) {setError(error instanceof Error?error.message:'Could not connect');setMessage('Not saved - try again');}
    finally {setBusy(false);}
  }
  return <section aria-label="Managing phones and leads">
    <div className="day-actions">
      <button disabled={busy} onClick={()=>void save('day/day-code',{},'New day code made. Joined phones stay in.')}>Make new day code</button>
      <button disabled={busy} onClick={()=>void save('day/lead-code',{},'New lead code made. Ordinary leads are volunteers again.')}>Make new lead code</button>
    </div>
    <p>New day codes stop new joins with the old code. A new lead code turns ordinary leads back into volunteers; the scoring team keeps access.</p>
    <h2>Joined phones</h2>
    <p role="status">{message}</p>{error && <p role="alert">{error}</p>}
    {!data && !error && <p>Opening joined phones…</p>}
    <div className="joined-phones">{data?.phones.map(phone=><article key={phone.id} aria-label={`Phone ${phone.name}`}>
      <h3>{phone.name}{phone.id===data.selfId?' (you)':''}</h3><p>{phone.level}</p>
      {phone.id!==data.selfId && <div className="day-actions">
        {phone.level==='Lead' && <button disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/scoring-team`,{scoringTeam:true},`Made ${phone.name} scoring team`)}>Make scoring team</button>}
        {phone.level==='Scoring team' && <button disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/scoring-team`,{scoringTeam:false},`Removed ${phone.name} from the scoring team`)}>Remove from scoring team</button>}
        <button disabled={busy} onClick={()=>void save(`day/phones/${phone.id}/remove`,{},`Removed ${phone.name}`)}>Remove</button>
      </div>}
    </article>)}</div>
    <p>Remove sends that phone back to Join on its next request and drops anything it hasn’t saved.</p>
    {!!data?.auditNotes.length && <details><summary>Phone and access audit notes</summary><ol>{data.auditNotes.map(note=><li key={note.id}>{note.message} · {note.actor} · <time dateTime={note.at}>{new Date(note.at).toLocaleString()}</time></li>)}</ol></details>}
  </section>;
}
