import { lazy, Suspense, useEffect, useState } from 'react';
import type { Phone, Job as JobName, WaitingCounts } from '../shared/domain.js';
import { api, phoneStorage } from './api.js';
import { Join } from './access/Join.js';
import { BecomeLead } from './access/BecomeLead.js';
import { Home } from './home/Home.js';
import { Job } from './jobs/Job.js';
const Lead = lazy(()=>import('./lead/Lead.js'));
interface HomeRead { phone:Phone; waiting:WaitingCounts; needsYou?:number }
type Screen = 'home'|'become-lead'|'lead'|JobName;
export function App() {
  const [joined,setJoined] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [screen,setScreen] = useState<Screen>('home');
  const [updated,setUpdated] = useState('');
  const [error,setError] = useState('');
  async function refresh() {
    try { const data = await api<HomeRead>('home'); setHome(data); setUpdated(new Date().toLocaleTimeString()); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not connect - tap Refresh'); }
  }
  useEffect(()=>{
    const removed = () => {setJoined(false);setHome(null);setScreen('home');setError('');};
    window.addEventListener('msf:removed',removed);
    return ()=>window.removeEventListener('msf:removed',removed);
  },[]);
  useEffect(()=>{
    if (!joined) return;
    void refresh(); const timer=window.setInterval(()=>void refresh(),5000);
    const visible=()=>{if (document.visibilityState === 'visible') void refresh();};
    document.addEventListener('visibilitychange',visible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[joined]);
  if (!joined) return <main><Join onJoined={()=>setJoined(true)} /></main>;
  if (!home) return <main><h1>Running Zone</h1><p>{error || 'Opening…'}</p><button onClick={()=>void refresh()}>Refresh</button></main>;
  const isLead = home.phone.level !== 'Volunteer';
  return <main><header><p>{home.phone.name}</p><nav aria-label="Running Zone"><button onClick={()=>setScreen('home')}>Home</button>
    {isLead ? <button onClick={()=>setScreen('lead')}>Lead · {home.needsYou || 0} needing you</button> : <button onClick={()=>setScreen('become-lead')}>Become lead</button>}
  </nav></header>
    {screen === 'home' ? <Home waiting={home.waiting} onJob={setScreen} /> : screen === 'become-lead' ? <BecomeLead onDone={()=>{setScreen('home');void refresh();}} /> : screen === 'lead' && isLead ? <Suspense fallback={<p>Opening Lead…</p>}><Lead phone={home.phone} /></Suspense> : screen === 'lead' ? <p>Lead access needed</p> : <Job job={screen} phone={home.phone} />}
    {error && <p role="alert">{error}</p>}{screen!=='Start line' && screen!=='Finish order' && screen!=='Times' && screen!=='lead' && <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh</button></footer>}
  </main>;
}
