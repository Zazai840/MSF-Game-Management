import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Phone } from '../shared/domain.js';
import type { DayLeadItem } from '../shared/lead-results.js';
import type { Role } from '../shared/race-flow.js';
import { api, phoneStorage,StaleRequest,type HomeTab } from './api.js';
import { SignIn, type Renamed } from './access/SignIn.js';
import { YourProfile } from './access/YourProfile.js';
import { Home } from './home/Home.js';
import { RaceScreen } from './race/RaceScreen.js';
import { TeamsScreen } from './teams/TeamsScreen.js';
import { AppHeader } from './shell/AppHeader.js';
import { BackArea,BackArrow } from './flow/BackArrow.js';
import { clock } from '../shared/clock.js';
import { reloadApp } from './shell/updates.js';
import { Avatar,HomeBar,RoleChip,Screen } from './races/parts.js';
import { EventTabs,RacesHome } from './races/RacesHome.js';
import { RaceShell,type SavedStep } from './races/RaceShell.js';
import { JobCard,JobChoice,LeadCode,RoleSheet } from './races/RoleSheet.js';
// A failed load (often an old page after a deploy) reloads the app; until then the Opening Lead line stays.
const Lead = lazy(()=>import('./lead/Lead.js').catch(()=>{reloadApp();return new Promise<never>(()=>{});}));
interface HomeRead { phone:Phone; needsYou?:number }
/**
 * Where the phone is. Races (Home) and a race are the race flow; a relay's race screen, the Teams screen, the lead's
 * Results and Day setup, and your profile keep the older screens.
 */
type View={kind:'races'}|{kind:'race';id:string}|{kind:'relay';code:string}|{kind:'teams'}|{kind:'lead';section:'Results'|'Day setup';target?:DayLeadItem}|{kind:'profile'};
/** A race has its own address (/races/:raceId); everything else is the app's root. */
const fromLocation=():View=>{const id=location.pathname.match(/^\/races\/([^/]+)$/)?.[1];return id?{kind:'race',id:decodeURIComponent(id)}:{kind:'races'};};
/** How each screen is named in a tester's bug report. */
const screenName=(view:View,section:string)=>view.kind==='races'?'Races':view.kind==='race'?'Race':view.kind==='relay'?'Race screen':view.kind==='teams'?'Teams':view.kind==='lead'?section:'Your profile';
export function App() {
  const [signedIn,setSignedIn] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [view,setView] = useState<View>(fromLocation);
  // Kept here as well as on the phone, so the back arrow returns to the tab you came from even when storage fails.
  const [homeTab,setHomeTab]=useState(phoneStorage.homeTab);
  const [role,setRole]=useState<Role|null>(null);
  const [roleSheet,setRoleSheet]=useState(false);
  const [menu,setMenu]=useState(false);
  const [saved,setSaved]=useState<SavedStep|null>(null);
  const [openDay,setOpenDay]=useState(false);
  const [leadSection,setLeadSection]=useState('Results');
  const [updated,setUpdated] = useState('');
  const [error,setError] = useState('');
  const [renamed,setRenamed]=useState<Renamed>();
  const request=useRef(0);
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
  /** Moves to another screen; opening a race gives it its address, so the phone's Back returns to Races. */
  function go(next:View) {
    setMenu(false);setView(next);
    const path=next.kind==='race'?`/races/${encodeURIComponent(next.id)}`:'/';
    if(location.pathname!==path) history.pushState(null,'',path);
    window.scrollTo(0,0);
  }
  useEffect(()=>{
    const back=()=>{setMenu(false);setView(fromLocation());};
    addEventListener('popstate',back);return ()=>removeEventListener('popstate',back);
  },[]);
  useEffect(()=>{
    const removed = () => {request.current++;setSignedIn(false);setHome(null);go({kind:'races'});setError('');};
    const session=(event:Event)=>{
      const newDay=(event as CustomEvent<{newDay:boolean}>).detail.newDay;
      request.current++;setSignedIn(Boolean(phoneStorage.token()));setHome(null);go(newDay?{kind:'lead',section:'Day setup'}:{kind:'races'});setOpenDay(newDay);setError('');
      if(phoneStorage.token()) void refresh();
    };
    window.addEventListener('msf:removed',removed);
    window.addEventListener('msf:session',session);
    return ()=>{window.removeEventListener('msf:removed',removed);window.removeEventListener('msf:session',session);};
  },[]);
  // The numbered-name line shows on Races until the phone moves on.
  useEffect(()=>{if(view.kind!=='races') setRenamed(undefined);},[view.kind]);
  useEffect(()=>{
    if (!signedIn) return;
    void refresh(); const timer=window.setInterval(()=>void refresh(),5000);
    const visible=()=>{if (document.visibilityState === 'visible') void refresh();};
    document.addEventListener('visibilitychange',visible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[signedIn]);
  const dayId=home?.phone.dayId,isLead=!!home && home.phone.level!=='Volunteer';
  // The job comes back from the phone for today. A lead starts as Zone lead; one no longer a lead chooses again.
  useEffect(()=>{
    if(!dayId) return;
    const held=phoneStorage.role(dayId);
    setRole(held==='lead' && !isLead?null:held??(isLead?'lead':null));
  },[dayId,isLead]);
  function choose(next:Role) {if(dayId) phoneStorage.rememberRole(dayId,next);setRole(next);setRoleSheet(false);}
  if (!signedIn) return <SignIn onSignedIn={numbered=>{setRenamed(numbered);setSignedIn(true);}} />;
  if (!home) return <><AppHeader screen="Opening" /><main><p>{error || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh</button></main></>;
  const name=home.phone.name,toRaces=()=>go({kind:'races'});
  if(!role) return <JoinJob name={name} onChoose={choose} onLead={refresh}/>;
  const avatar=<div style={{position:'relative'}}>
    <Avatar name={name} label={isLead?`${name}: Results, Day setup and your details`:undefined} onOpen={()=>isLead?setMenu(!menu):go({kind:'profile'})}/>
    {menu && <div className="rz-menu" role="menu">
      <button role="menuitem" type="button" onClick={()=>go({kind:'lead',section:'Results'})}>Results</button>
      <button role="menuitem" type="button" onClick={()=>go({kind:'lead',section:'Day setup'})}>Day setup</button>
      <button role="menuitem" type="button" onClick={()=>go({kind:'profile'})}>Your details</button>
    </div>}
  </div>;
  const sheet=roleSheet && <RoleSheet role={role} lead={isLead} onChoose={choose} onLead={refresh} onClose={()=>setRoleSheet(false)}/>;
  const pickTab=(tab:HomeTab)=>{setHomeTab(tab);phoneStorage.rememberHomeTab(tab);};
  if(view.kind==='races' || view.kind==='race') {
    const bar=<HomeBar><RoleChip role={role} onOpen={()=>setRoleSheet(true)}/>{avatar}</HomeBar>;
    const note=renamed && <p role="status" className="rz-note" style={{margin:'12px 20px 0'}}>{renamed.taken} is already taken, so you're signed in as <strong>{renamed.name}</strong></p>;
    if(view.kind==='race') return <Screen screen="Race"><RaceShell key={view.id} raceId={view.id} role={role} onRole={()=>setRoleSheet(true)} onBack={toRaces}
      onRace={id=>go({kind:'race',id})} onSaved={next=>{setSaved(next);toRaces();}} onResults={item=>go({kind:'lead',section:'Results',target:item})}/>{sheet}</Screen>;
    // Relays keep today's list and screens, in the older look, under the race flow's tabs.
    if(homeTab==='relays') return <><Screen screen="Races" fill={false} wide>{bar}{note}<EventTabs tab={homeTab} onTab={pickTab}/>{sheet}</Screen>
      <main><Home tab="relays" relaysOnly onTab={pickTab} onEvent={code=>go({kind:'relay',code})} onTeams={()=>go({kind:'teams'})}/>
        <footer><span>Updated at {updated || '…'}</span><button onClick={()=>void refresh()}>Refresh</button></footer></main></>;
    return <Screen screen="Races" wide>{bar}{note}<RacesHome tab={homeTab} onTab={pickTab} role={role} onRace={id=>go({kind:'race',id})} saved={saved} onSavedShown={()=>setSaved(null)}/>{sheet}</Screen>;
  }
  return <><AppHeader name={name} screen={screenName(view,leadSection)} onProfile={()=>go({kind:'profile'})}/><BackArea>
    {view.kind!=='lead' && <BackArrow to="Races" onBack={toRaces}/>}<main>
    {view.kind==='profile'?<YourProfile phone={home.phone} onBack={toRaces}/>
      :view.kind==='teams'?<TeamsScreen phoneId={home.phone.id}/>
      :view.kind==='relay'?<RaceScreen key={view.code} eventCode={view.code} phoneId={home.phone.id} lead={isLead}/>
      :isLead?<Suspense fallback={<p>Opening Lead…</p>}><Lead key={`${home.phone.dayId}:${view.section}:${view.target?.id??''}`} initialDay={openDay} initialSection={view.section} target={view.target}
        onChanged={()=>void refresh()} onHome={()=>{setOpenDay(false);toRaces();}} onSection={setLeadSection}/></Suspense>:<p>Lead access needed</p>}
    {error && <p role="alert">{error}</p>}
  </main></BackArea></>;
}
/**
 * The job choice after signing in, once per day on this phone: Start line, Finish line or Timer, each with its job
 * star. A zone lead types the lead code instead. The job can be switched on any race.
 */
function JoinJob({name,onChoose,onLead}:{name:string;onChoose:(role:Role)=>void;onLead:()=>Promise<void>}) {
  const [job,setJob]=useState<Role|null>(null),[asking,setAsking]=useState(false);
  return <Screen screen="Join"><HomeBar><Avatar name={name} onOpen={()=>{}}/></HomeBar>
    <main className="rz-main rz-main--form">
      <h1 className="rz-screen-title">What's your job today?</h1>
      <JobChoice role={job} label="What's your job today?" onChoose={next=>{setJob(next);setAsking(false);}}/>
      <p className="rz-empty">You can switch job on any race. Zone lead? Tap Zone lead and type the lead code.</p>
      <JobCard role="lead" checked={asking} onChoose={()=>{setAsking(true);setJob(null);}}/>
      {asking && <LeadCode onLead={async()=>{await onLead();onChoose('lead');}}/>}
    </main>
    {!asking && <footer className="rz-footer rz-footer--sticky"><button type="button" className="rz-btn rz-btn--display rz-btn--block" disabled={!job} onClick={()=>job && onChoose(job)}>Join</button></footer>}
  </Screen>;
}
