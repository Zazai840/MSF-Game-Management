import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Phone, Job as JobName, WaitingCounts } from '../shared/domain.js';
import { api, phoneStorage,StaleRequest } from './api.js';
import { Join } from './access/Join.js';
import { BecomeLead } from './access/BecomeLead.js';
import { Home } from './home/Home.js';
import { Job } from './jobs/Job.js';
import { AppHeader } from './shell/AppHeader.js';
import { TrailArea } from './flow/Trail.js';
const Lead = lazy(()=>import('./lead/Lead.js'));
interface HomeRead { phone:Phone; waiting:WaitingCounts; needsYou?:number }
type Screen = 'home'|'become-lead'|'lead'|JobName;
/** Jobs whose own breadcrumb trail replaces the Home and lead buttons. */
const trailJobs:readonly Screen[]=['Start line'];
export function App() {
  const [joined,setJoined] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [screen,setScreen] = useState<Screen>('home');
  const [openDay,setOpenDay]=useState(false);
  const [updated,setUpdated] = useState('');
  const [error,setError] = useState('');
  const request=useRef(0);
  function updateCount(count:number) {request.current++;setHome(current=>current?{...current,needsYou:count}:current);}
  async function refresh() {
    const generation=++request.current;
    try {
      const data = await api<HomeRead>('home');if(generation!==request.current) return;
      const previous=phoneStorage.dayId();
      if(previous && previous!==data.phone.dayId) {phoneStorage.newDay(data.phone.dayId);return;}
      phoneStorage.rememberDay(data.phone.dayId);setHome(data);setUpdated(new Date().toLocaleTimeString());setError('');
    }
    catch (error) { if(generation!==request.current || error instanceof StaleRequest) return;setError(error instanceof Error ? error.message : 'Could not connect - tap Refresh'); }
  }
  useEffect(()=>{
    const removed = () => {request.current++;setJoined(false);setHome(null);setScreen('home');setError('');};
    const session=(event:Event)=>{
      const newDay=(event as CustomEvent<{newDay:boolean}>).detail.newDay;
      request.current++;setJoined(Boolean(phoneStorage.token()));setHome(null);setScreen(newDay?'lead':'home');setOpenDay(newDay);setError('');
      if(phoneStorage.token()) void refresh();
    };
    window.addEventListener('msf:removed',removed);
    window.addEventListener('msf:session',session);
    return ()=>{window.removeEventListener('msf:removed',removed);window.removeEventListener('msf:session',session);};
  },[]);
  useEffect(()=>{
    if (!joined) return;
    void refresh(); const timer=window.setInterval(()=>void refresh(),5000);
    const visible=()=>{if (document.visibilityState === 'visible') void refresh();};
    document.addEventListener('visibilitychange',visible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[joined]);
  if (!joined) return <><AppHeader /><main><Join onJoined={()=>setJoined(true)} /></main></>;
  if (!home) return <><AppHeader /><main><p>{error || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh</button></main></>;
  const isLead = home.phone.level !== 'Volunteer';
  const goHome=()=>{setScreen('home');setOpenDay(false);};
  return <><AppHeader name={home.phone.name} /><TrailArea>{!trailJobs.includes(screen) && <nav className="app-nav" aria-label="Running Zone"><button className="button-secondary" onClick={goHome}>Home</button>
    {isLead ? <button onClick={()=>setScreen('lead')}>Lead · <span className={home.needsYou?'lead-count':'lead-count-empty'}>{home.needsYou || 0}</span> needing you</button> : <button className="button-secondary" onClick={()=>setScreen('become-lead')}>Become lead</button>}
  </nav>}<main>
    {screen === 'home' ? <Home waiting={home.waiting} onJob={setScreen} /> : screen === 'become-lead' ? <BecomeLead onDone={()=>{setScreen('home');void refresh();}} /> : screen === 'lead' && isLead ? <Suspense fallback={<p>Opening Lead…</p>}><Lead key={home.phone.dayId} phone={home.phone} initialDay={openDay} initialCount={home.needsYou||0} onCount={updateCount} onChanged={()=>void refresh()}/></Suspense> : screen === 'lead' ? <p>Lead access needed</p> : <Job job={screen} phone={home.phone} onHome={goHome} />}
    {error && <p role="alert">{error}</p>}{screen!=='Start line' && screen!=='Finish order' && screen!=='Times' && screen!=='lead' && <footer>Updated at {updated || '…'} <button onClick={()=>void refresh()}>Refresh</button></footer>}
  </main></TrailArea></>;
}
