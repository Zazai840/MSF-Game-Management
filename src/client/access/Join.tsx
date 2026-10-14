import { useState, type FormEvent } from 'react';
import { api, phoneStorage } from '../api.js';
import type { Phone } from '../../shared/domain.js';
export function Join({onJoined}:{onJoined:()=>void}) {
  const [code,setCode] = useState('');
  const [name,setName] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const joined = await api<{token:string;phone:Phone}>('join',{code,name}); phoneStorage.join(joined.token); onJoined(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not connect - please try again'); }
    finally { setBusy(false); }
  }
  return <section><h1>Join the Running Zone</h1><p>Ask for the day code. Starting the first Olympics day? Use the owner password.</p>
    <form onSubmit={submit}>
      <label>Day code or owner password<input type="password" value={code} onChange={event=>setCode(event.target.value)} autoComplete="off" required /></label>
      <label>Full name<input value={name} onChange={event=>setName(event.target.value)} autoComplete="name" maxLength={80} required /></label>
      {error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Joining…':'Join'}</button>
    </form></section>;
}
