import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Phone } from '../shared/domain.js';
import type { ResultsTarget } from '../shared/lead-results.js';
import type { Role,Step } from '../shared/race-flow.js';
import { api, phoneStorage,StaleRequest,type HomeTab } from './api.js';
import { SignIn } from './access/SignIn.js';
import { AppHeader } from './shell/AppHeader.js';
import { BackArea } from './flow/BackArrow.js';
import { reloadApp } from './shell/updates.js';
import { useSubmit } from './flow/useSubmit.js';
import { Avatar,HomeBar,RoleChip,Screen } from './races/parts.js';
import { RacesHome } from './races/RacesHome.js';
import { RaceShell,type SavedStep } from './races/RaceShell.js';
import { JobCard,JobChoice,LeadCode,RoleSheet } from './races/RoleSheet.js';
// A failed load (often an old page after a deploy) reloads the app; until then the Opening Lead line stays.
const Lead = lazy(()=>import('./lead/Lead.js').catch(()=>{reloadApp();return new Promise<never>(()=>{});}));
interface HomeRead { phone:Phone; needsYou?:number }
/** Where the phone is. Races (Home) and a race are the race flow, relays too; the lead's Results and Day setup keep the older screens. */
type View={kind:'races'}|{kind:'race';id:string;step?:Step}|{kind:'lead';section:'Results'|'Day setup';target?:ResultsTarget};
/** A race has its own address (/races/:raceId); everything else is the app's root. */
const fromLocation=():View=>{const id=location.pathname.match(/^\/races\/([^/]+)$/)?.[1];return id?{kind:'race',id:decodeURIComponent(id)}:{kind:'races'};};
/** How each screen is named in a tester's bug report. */
const screenName=(view:View,section:string)=>view.kind==='races'?'Races':view.kind==='race'?'Race':section;
export function App() {
  const [signedIn,setSignedIn] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [view,setView] = useState<View>(fromLocation);
  // Kept here as well as on the phone, so the back arrow returns to the tab you came from even when storage fails.
  const [homeTab,setHomeTab]=useState(phoneStorage.homeTab);
  const [role,setRole]=useState<Role|null>(null);
  const [roleSheet,setRoleSheet]=useState(false);
  // The avatar menu, when open: placed under the avatar (or name) that opened it, wherever that sits.
  const [menu,setMenu]=useState<{top:number;right:number}|null>(null);
  const logOut=useSubmit();
  const [saved,setSaved]=useState<SavedStep|null>(null);
  const [openDay,setOpenDay]=useState(false);
  const [leadSection,setLeadSection]=useState('Results');
  const [error,setError] = useState('');
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {
      const data = await api<HomeRead>('home');if(generation!==request.current) return;
      const previous=phoneStorage.dayId();
      if(previous && previous!==data.phone.dayId) {phoneStorage.newDay(data.phone.dayId);return;}
      phoneStorage.rememberDay(data.phone.dayId);setHome(data);setError('');
    }
    catch (error) { if(generation!==request.current || error instanceof StaleRequest) return;setError(error instanceof Error ? error.message : 'Could not connect - tap Refresh'); }
  }
  /** Moves to another screen; opening a race gives it its address, so the phone's Back returns to Races. */
  function go(next:View) {
    setMenu(null);setView(next);
    const path=next.kind==='race'?`/races/${encodeURIComponent(next.id)}`:'/';
    if(location.pathname!==path) history.pushState(null,'',path);
    window.scrollTo(0,0);
  }
  useEffect(()=>{
    const back=()=>{setMenu(null);setView(fromLocation());};
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
  if (!signedIn) return <SignIn onSignedIn={()=>setSignedIn(true)} />;
  if (!home) return <><AppHeader screen="Opening" /><main><p>{error || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh</button></main></>;
  const name=home.phone.name,toRaces=()=>go({kind:'races'});
  // Every avatar, and the older-look header's name, opens this one menu. Log out asks nothing: the phone keeps its listed names.
  const menuLabel=`${name}: ${isLead?'Results, Day setup and Log out':'Log out'}`,openMenu=(anchor:HTMLElement)=>{
    const box=anchor.getBoundingClientRect();
    setMenu(menu?null:{top:box.bottom+6,right:document.documentElement.clientWidth-box.right});
  };
  const menuList=menu && <div className="rz-menu" role="menu" style={menu}>
    {isLead && <><button role="menuitem" type="button" onClick={()=>go({kind:'lead',section:'Results'})}>Results</button>
      <button role="menuitem" type="button" onClick={()=>go({kind:'lead',section:'Day setup'})}>Day setup</button></>}
    <button role="menuitem" type="button" disabled={logOut.busy} onClick={()=>void logOut.submit(async()=>{await api('sign-out',{});phoneStorage.signOut();})}>Log out</button>
    {logOut.error && <p role="alert" className="rz-note">{logOut.error}</p>}
  </div>;
  const avatar=<div style={{position:'relative'}}><Avatar name={name} label={menuLabel} onOpen={openMenu}/>{menuList}</div>;
  if(!role) return <JoinJob avatar={avatar} onChoose={choose} onLead={refresh}/>;
  const sheet=roleSheet && <RoleSheet role={role} lead={isLead} onChoose={choose} onLead={refresh} onClose={()=>setRoleSheet(false)}/>;
  const pickTab=(tab:HomeTab)=>{setHomeTab(tab);phoneStorage.rememberHomeTab(tab);};
  if(view.kind==='races' || view.kind==='race') {
    const bar=<HomeBar><RoleChip role={role} onOpen={()=>setRoleSheet(true)}/>{avatar}</HomeBar>;
    if(view.kind==='race') return <Screen screen="Race"><RaceShell key={view.id} raceId={view.id} me={home.phone.id} step={view.step} role={role} onRole={()=>setRoleSheet(true)} onBack={toRaces}
      onRace={(id,step)=>go({kind:'race',id,step})} onSaved={next=>{setSaved(next);toRaces();}} onResults={item=>go({kind:'lead',section:'Results',target:item})}/>{sheet}</Screen>;
    return <Screen screen="Races" wide>{bar}<RacesHome tab={homeTab} me={name} onTab={pickTab} role={role} onRace={(id,step)=>go({kind:'race',id,step})}
      onResults={target=>go({kind:'lead',section:'Results',target})} saved={saved} onSavedShown={()=>setSaved(null)}/>{sheet}</Screen>;
  }
  // The older look has no race-flow tokens, so the menu brings its own .rz-screen.
  return <><AppHeader name={name} label={menuLabel} screen={screenName(view,leadSection)} onMenu={openMenu}/>{menuList && <div className="rz-screen">{menuList}</div>}<BackArea>
<main>
    {isLead?<Suspense fallback={<p>Opening Lead…</p>}><Lead key={`${home.phone.dayId}:${view.section}:${view.target?.id??''}`} initialDay={openDay} initialSection={view.section} target={view.target}
        onChanged={()=>void refresh()} onHome={()=>{setOpenDay(false);toRaces();}} onSection={setLeadSection}/></Suspense>:<p>Lead access needed</p>}
    {error && <p role="alert">{error}</p>}
  </main></BackArea></>;
}
/**
 * The job choice for a signed-in phone with no job yet (a name tapped under Welcome back, or a lead's access ended):
 * one tap on Start line, Finish line or Timer opens Races. Zone lead asks for the lead code first. The job can be
 * switched on any race.
 */
function JoinJob({avatar,onChoose,onLead}:{avatar:ReactNode;onChoose:(role:Role)=>void;onLead:()=>Promise<void>}) {
  const [asking,setAsking]=useState(false);
  return <Screen screen="Join"><HomeBar>{avatar}</HomeBar>
    <main className="rz-main rz-main--form">
      <h1 className="rz-screen-title">What's your job today?</h1>
      <JobChoice role={null} label="What's your job today?" onChoose={onChoose}/>
      <p className="rz-empty">You can switch job on any race. Zone lead? Tap Zone lead and type the lead code.</p>
      <JobCard role="lead" checked={asking} onChoose={()=>setAsking(true)}/>
      {asking && <LeadCode onLead={async()=>{await onLead();onChoose('lead');}}/>}
    </main>
  </Screen>;
}
