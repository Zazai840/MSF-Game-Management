import { useState, type FormEvent } from 'react';
import { api } from '../api.js';
export function BecomeLead({onDone}:{onDone:()=>void}) {
  const [code,setCode] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('become-lead',{code}); onDone(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not connect - please try again'); }
    finally { setBusy(false); }
  }
  return <section><h1>Become lead</h1><form onSubmit={submit}>
    <label>Lead code or owner password<input type="password" autoComplete="off" value={code} onChange={event=>setCode(event.target.value)} required /></label>
    {error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Checking…':'Become lead'}</button>
  </form></section>;
}
