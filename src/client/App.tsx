import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Phone, Job as JobName, WaitingCounts } from '../shared/domain.js';
import { api, phoneStorage,StaleRequest } from './api.js';
import { SignIn, type Renamed } from './access/SignIn.js';
import { BecomeLead } from './access/BecomeLead.js';
import { YourProfile } from './access/YourProfile.js';
import { Home, LeadEntry } from './home/Home.js';
import { Job } from './jobs/Job.js';
import { RaceScreen } from './race/RaceScreen.js';
import type { HomeEvent } from '../shared/race-screen.js';
import { AppHeader } from './shell/AppHeader.js';
import { TrailArea } from './flow/Trail.js';
import { clock } from '../shared/clock.js';
const Lead = lazy(()=>import('./lead/Lead.js'));
interface HomeRead { phone:Phone; events:HomeEvent[]; waiting:WaitingCounts; needsYou?:number }
type Screen = 'home'|'become-lead'|'lead'|'race'|JobName;
/** Jobs whose own breadcrumb trail replaces the Home and lead buttons. */
const trailJobs:readonly Screen[]=['Start line','Finish order','Times','lead'];
/** How each screen is named in a tester's bug report. */
const screenNames:Partial<Record<Screen,string>>={home:'Home','become-lead':'Become lead',race:'Race screen'};
export function App() {
  const [signedIn,setSignedIn] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [screen,setScreen] = useState<Screen>('home');
  // The event whose race screen is open.
  const [raceEvent,setRaceEvent]=useState('');
  // Your profile screen opens over whichever screen you were on, and Back returns to it.
  const [profileOpen,setProfileOpen]=useState(false);
  const [openDay,setOpenDay]=useState(false);
  const [leadSection,setLeadSection]=useState('Dashboard');
  const [updated,setUpdated] = useState('');
  const [error,setError] = useState('');
  const [renamed,setRenamed]=useState<Renamed>();
  const request=useRef(0);
  function updateCount(count:number) {request.current++;setHome(current=>current?{...current,needsYou:count}:current);}
  async function refresh() {
    const generation=++request.current;
    try {
      const data = await api<HomeRead>('home');if(generation!==request.current) return;
      const previous=phoneStorage.dayId();
      if(previous && previous!==data.phone.dayId) {phoneStorage.newDay(data.phone.dayId);return;}
      phoneStorage.rememberDay(data.phone.dayId);setHome(data);setUpdated(clock());setError('');
    }
    catch (error) { if(generation!==request.current || error instanceof StaleRequest) return;setError(error instanceof Error ? error.message : 'Could not connect - tap Refresh'); }
  }
  useEffect(()=>{
    const removed = () => {request.current++;setSignedIn(false);setHome(null);setScreen('home');setProfileOpen(false);setError('');};
    const session=(event:Event)=>{
      const newDay=(event as CustomEvent<{newDay:boolean}>).detail.newDay;
      request.current++;setSignedIn(Boolean(phoneStorage.token()));setHome(null);setScreen(newDay?'lead':'home');setProfileOpen(false);setOpenDay(newDay);setError('');
      if(phoneStorage.token()) void refresh();
    };
    window.addEventListener('msf:removed',removed);
    window.addEventListener('msf:session',session);
    return ()=>{window.removeEventListener('msf:removed',removed);window.removeEventListener('msf:session',session);};
  },[]);
  // The numbered-name line shows on Home until the phone moves on.
  useEffect(()=>{if(screen!=='home') setRenamed(undefined);},[screen]);
  useEffect(()=>{
    if (!signedIn) return;
    void refresh(); const timer=window.setInterval(()=>void refresh(),5000);
    const visible=()=>{if (document.visibilityState === 'visible') void refresh();};
    document.addEventListener('visibilitychange',visible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[signedIn]);
  if (!signedIn) return <SignIn onSignedIn={numbered=>{setRenamed(numbered);setSignedIn(true);}} />;
  if (!home) return <><AppHeader screen="Opening" /><main><p>{error || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh</button></main></>;
  const isLead = home.phone.level !== 'Volunteer';
  const goHome=()=>{setScreen('home');setOpenDay(false);};
  if (profileOpen) return <><AppHeader name={home.phone.name} screen="Your profile" onProfile={()=>{}} /><main><YourProfile phone={home.phone} onBack={()=>setProfileOpen(false)} /></main></>;
  return <><AppHeader name={home.phone.name} screen={screen==='lead'?leadSection:screenNames[screen]??screen} onProfile={()=>setProfileOpen(true)} /><TrailArea>{screen==='race' ? <nav className="app-nav" aria-label="Running Zone"><button className="back-arrow" aria-label="Back to Home" onClick={goHome}><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button></nav> : !trailJobs.includes(screen) && <nav className={screen==='home'?'app-nav app-nav-home':'app-nav'} aria-label="Running Zone">{screen!=='home' && <button className="button-secondary" onClick={goHome}>Home</button>}
    {screen!=='become-lead' && <LeadEntry isLead={isLead} toCheck={home.needsYou||0} onDashboard={()=>setScreen('lead')} onBecomeLead={()=>setScreen('become-lead')} />}
  </nav>}<main>
    {screen === 'home' && renamed && <p role="status" className="calm-note">{renamed.taken} is already taken, so you're signed in as <strong>{renamed.name}</strong></p>}
    {screen === 'home' ? <Home events={home.events} waiting={home.waiting} onEvent={code=>{setRaceEvent(code);setScreen('race');}} onJob={setScreen} /> : screen === 'race' ? <RaceScreen key={raceEvent} eventCode={raceEvent} /> : screen === 'become-lead' ? <BecomeLead onDone={()=>{setScreen('home');void refresh();}} /> : screen === 'lead' && isLead ? <Suspense fallback={<p>Opening Lead…</p>}><Lead key={home.phone.dayId} phone={home.phone} initialDay={openDay} onCount={updateCount} onChanged={()=>void refresh()} onHome={goHome} onSection={setLeadSection}/></Suspense> : screen === 'lead' ? <p>Lead access needed</p> : <Job job={screen} phone={home.phone} onHome={goHome} />}
    {error && <p role="alert">{error}</p>}{screen!=='Start line' && screen!=='Finish order' && screen!=='Times' && screen!=='lead' && screen!=='race' && <footer><span>Updated at {updated || '…'}</span><button onClick={()=>void refresh()}>Refresh</button></footer>}
  </main></TrailArea></>;
}
