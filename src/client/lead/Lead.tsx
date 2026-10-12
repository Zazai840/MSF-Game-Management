import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import type { DayRead } from '../../shared/day.js';
import { Results } from './Results.js';
import { Day } from './Day.js';
export default function Lead({phone}:{phone:Phone}) {
  const [tab,setTab] = useState<'Results'|'Day'>('Results');
  const [day,setDay] = useState<DayRead|null>(null);
  const [error,setError] = useState('');
  const [updated,setUpdated] = useState('');
  async function refresh() {
    try {
      if (tab === 'Day') setDay(await api('day'));
      setUpdated(new Date().toLocaleTimeString()); setError('');
    } catch (error) { setDay(null); setError(error instanceof Error ? error.message : 'Could not connect'); }
  }
  useEffect(()=>{if(tab!=='Day') return;void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==='visible') void refresh();},5000);return()=>clearInterval(timer);},[tab]);
  useEffect(()=>{if (phone.level!=='Scoring team') {setTab('Results');setDay(null);}},[phone.level]);
  return <section><nav aria-label="Lead tabs"><button onClick={()=>setTab('Results')}>Results</button>{phone.level === 'Scoring team' && <button onClick={()=>setTab('Day')}>Day</button>}</nav>
    <h1>{tab}</h1>{tab==='Day' && error && <p role="alert">{error}</p>}
    {tab === 'Results' ? <Results /> : phone.level==='Scoring team' && day && <Day day={day} onChanged={refresh} />}
    {tab==='Day' && <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh lead</button></footer>}
  </section>;
}
