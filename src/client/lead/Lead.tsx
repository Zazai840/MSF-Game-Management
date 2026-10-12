import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Phone } from '../../shared/domain.js';
export default function Lead({phone}:{phone:Phone}) {
  const [tab,setTab] = useState<'Results'|'Day'>('Results');
  const [day,setDay] = useState<{dayCode:string;leadCode:string}|null>(null);
  const [error,setError] = useState('');
  const [updated,setUpdated] = useState('');
  async function refresh() {
    try {
      if (tab === 'Day') setDay(await api('day'));
      else await api('lead');
      setUpdated(new Date().toLocaleTimeString()); setError('');
    } catch (error) { setDay(null); setError(error instanceof Error ? error.message : 'Could not connect'); }
  }
  useEffect(()=>{ void refresh(); const timer=window.setInterval(()=>void refresh(),5000); return ()=>clearInterval(timer); },[tab]);
  return <section><nav aria-label="Lead tabs"><button onClick={()=>setTab('Results')}>Results</button>{phone.level === 'Scoring team' && <button onClick={()=>setTab('Day')}>Day</button>}</nav>
    <h1>{tab}</h1>{error && <p role="alert">{error}</p>}
    {tab === 'Results' ? <p>No events recorded yet</p> : day && <dl><dt>Day code</dt><dd className="code">{day.dayCode}</dd><dt>Lead code</dt><dd className="code">{day.leadCode}</dd></dl>}
    <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh lead</button></footer>
  </section>;
}
