import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Phone } from '../shared/domain.js';
import { api, phoneStorage,StaleRequest } from './api.js';
import { SignIn, type Renamed } from './access/SignIn.js';
import { BecomeLead } from './access/BecomeLead.js';
import { YourProfile } from './access/YourProfile.js';
import { Home, LeadEntry } from './home/Home.js';
import { RaceScreen } from './race/RaceScreen.js';
import { TeamsScreen } from './teams/TeamsScreen.js';
import { AppHeader } from './shell/AppHeader.js';
import { BackArea,BackArrow } from './flow/BackArrow.js';
import { clock } from '../shared/clock.js';
import { reloadApp } from './shell/updates.js';
// A failed load (often an old page after a deploy) reloads the app; until then the Opening Lead line stays.
const Lead = lazy(()=>import('./lead/Lead.js').catch(()=>{reloadApp();return new Promise<never>(()=>{});}));
interface HomeRead { phone:Phone; needsYou?:number }
type Screen = 'home'|'become-lead'|'lead'|'race'|'teams';
/** How each screen is named in a tester's bug report. */
const screenNames:Record<Exclude<Screen,'lead'>,string>={home:'Home','become-lead':'Become lead',race:'Race screen',teams:'Teams'};
export function App() {
  const [signedIn,setSignedIn] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [screen,setScreen] = useState<Screen>('home');
  // The event whose race screen is open.
  const [raceEvent,setRaceEvent]=useState('');
  // Kept here as well as on the phone, so the back arrow returns to the tab you came from even when storage fails.
  const [homeTab,setHomeTab]=useState(phoneStorage.homeTab);
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
  return <><AppHeader name={home.phone.name} screen={screen==='lead'?leadSection:screenNames[screen]} onProfile={()=>setProfileOpen(true)} /><BackArea>{screen==='home' ? <nav className="app-nav app-nav-home" aria-label="Running Zone"><LeadEntry isLead={isLead} toCheck={home.needsYou||0} onDashboard={()=>setScreen('lead')} onBecomeLead={()=>setScreen('become-lead')} /></nav>
    : (screen==='race' || screen==='teams' || screen==='become-lead' || (screen==='lead' && !isLead)) && <BackArrow to="Home" onBack={goHome}/>}<main>
    {screen === 'home' && renamed && <p role="status" className="calm-note">{renamed.taken} is already taken, so you're signed in as <strong>{renamed.name}</strong></p>}
    {screen === 'home' ? <Home tab={homeTab} onTab={tab=>{setHomeTab(tab);phoneStorage.rememberHomeTab(tab);}} onEvent={code=>{setRaceEvent(code);setScreen('race');}} onTeams={()=>setScreen('teams')} /> : screen === 'teams' ? <TeamsScreen phoneId={home.phone.id} /> : screen === 'race' ? <RaceScreen key={raceEvent} eventCode={raceEvent} phoneId={home.phone.id} lead={isLead} /> : screen === 'become-lead' ? <BecomeLead onDone={()=>{setScreen('home');void refresh();}} /> : screen === 'lead' && isLead ? <Suspense fallback={<p>Opening Lead…</p>}><Lead key={home.phone.dayId} initialDay={openDay} onCount={updateCount} onChanged={()=>void refresh()} onHome={goHome} onSection={setLeadSection}/></Suspense> : <p>Lead access needed</p>}
    {error && <p role="alert">{error}</p>}{screen!=='lead' && screen!=='race' && screen!=='teams' && <footer><span>Updated at {updated || '…'}</span><button onClick={()=>void refresh()}>Refresh</button></footer>}
  </main></BackArea></>;
}
