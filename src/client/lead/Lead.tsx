import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Phone } from '../../shared/domain.js';
import type { DayRead } from '../../shared/day.js';
import { NeedsYou } from './NeedsYou.js';
import type { DayLeadItem } from '../../shared/lead-results.js';
import { Results } from './Results.js';
import { Day } from './Day.js';
export default function Lead({phone,initialCount,onCount,onChanged}:{phone:Phone;initialCount:number;onCount:(count:number)=>void;onChanged:()=>void}) {
  const [tab,setTab] = useState<'Needs you'|'Results'|'Day'>(initialCount?'Needs you':'Results');
  const [target,setTarget]=useState<DayLeadItem|undefined>();
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
  useEffect(()=>{if (phone.level!=='Scoring team' && tab==='Day') {setTab('Results');setDay(null);}},[phone.level]);
  return <section><nav aria-label="Lead tabs"><button onClick={()=>setTab('Needs you')}>Needs you</button><button onClick={()=>{setTarget(undefined);setTab('Results');}}>Results</button>{phone.level === 'Scoring team' && <button onClick={()=>setTab('Day')}>Day</button>}</nav>
    <h1>{tab}</h1>{tab==='Day' && error && <p role="alert">{error}</p>}
    {tab==='Needs you'?<NeedsYou onCount={onCount} onOpen={item=>{setTarget(item);setTab('Results');}}/>:tab === 'Results' ? <Results key={target?.id||'events'} target={target} onChanged={onChanged}/> : phone.level==='Scoring team' && day && <Day day={day} onChanged={refresh} />}
    {tab==='Day' && <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh lead</button></footer>}
  </section>;
}
