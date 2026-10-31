import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Phone } from '../shared/domain.js';
import type { ResultsTarget } from '../shared/lead-results.js';
import type { Role } from '../shared/race-flow.js';
import { api, phoneStorage,StaleRequest,type HomeTab } from './api.js';
import { SignIn } from './access/SignIn.js';
import { AppHeader } from './shell/AppHeader.js';
import { addressOf,entryBack,parentOf,shownName,viewAt,type View } from './shell/addresses.js';
import { reloadApp } from './shell/updates.js';
import { useSubmit } from './flow/useSubmit.js';
import { Avatar,HomeBar,LeadBar,LeadFrame,RoleChip,Screen } from './races/parts.js';
import { RacesHome } from './races/RacesHome.js';
import { RaceShell } from './races/RaceShell.js';
import { Toast,ToastContext,type ToastShown } from './races/Toast.js';
import { JobCard,JobChoice,LeadCode,RoleSheet } from './races/RoleSheet.js';
// A failed load (often an old page after a deploy) reloads the app; until then the Opening Lead line stays.
const Lead = lazy(()=>import('./lead/Lead.js').catch(()=>{reloadApp();return new Promise<never>(()=>{});}));
interface HomeRead { phone:Phone; needsYou?:number }
/** Where Open in Results (or Confirm the medals) lands: a race's item on its race page, anything else on its event. */
const resultsView=(target:ResultsTarget):View=>target.raceId && !target.entryId?{kind:'race-page',code:target.event.code,raceId:target.raceId}:{kind:'event',code:target.event.code,tab:'heats'};
export function App() {
  const [signedIn,setSignedIn] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [view,setView] = useState<View>(()=>viewAt(location.pathname));
  // What Open in Results asked to open on the event (a runner's actions, a tie, a check sheet), on that visit only.
  const [target,setTarget]=useState<ResultsTarget>();
  // Kept here as well as on the phone, so the back arrow returns to the tab you came from even when storage fails.
  const [homeTab,setHomeTab]=useState(phoneStorage.homeTab);
  const [role,setRole]=useState<Role|null>(null);
  const [roleSheet,setRoleSheet]=useState(false);
  // The avatar menu, when open: placed under the avatar (or name) that opened it, wherever that sits.
  const [menu,setMenu]=useState<{top:number;right:number}|null>(null);
  const logOut=useSubmit();
  // The app's one toast; `id` makes a new save's toast start afresh.
  const [toast,setToast]=useState<ToastShown&{id:number}|null>(null);
  const showToast=useMemo(()=>(next:ToastShown)=>setToast(held=>({...next,id:(held?.id??0)+1})),[]);
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
  /**
   * Moves to another screen at its own address. The history entry carries the name of the screen left, for the back
   * arrow; `replace` moves up a level in place of an entry (Back on a screen reached with no history).
   */
  function go(next:View,{replace=false,opening}:{replace?:boolean;opening?:ResultsTarget}={}) {
    setMenu(null);setView(next);setTarget(opening);
    const path=addressOf(next);
    if(replace) history.replaceState(null,'',path);
    else if(location.pathname!==path) history.pushState({back:shownName()},'',path);
    window.scrollTo(0,0);
  }
  useEffect(()=>{
    const back=()=>{setMenu(null);setTarget(undefined);setView(viewAt(location.pathname));};
    addEventListener('popstate',back);return ()=>removeEventListener('popstate',back);
  },[]);
  useEffect(()=>{
    const removed = () => {request.current++;setSignedIn(false);setHome(null);go({kind:'races'});setError('');};
    const session=(event:Event)=>{
      const newDay=(event as CustomEvent<{newDay:boolean}>).detail.newDay;
      request.current++;setSignedIn(Boolean(phoneStorage.token()));setHome(null);go(newDay?{kind:'day'}:{kind:'races'});setError('');
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
  // The older look has no race-flow tokens, so the toast brings its own .rz-screen, as the job sheet does.
  const withToast=(screen:ReactNode)=><ToastContext.Provider value={showToast}>{screen}
    {toast && <div className="rz-screen"><Toast key={toast.id} toast={toast} onOpen={id=>go({kind:'race',id})} onClose={()=>setToast(null)}/></div>}</ToastContext.Provider>;
  return withToast(screen());
  function screen() {
    if (!signedIn) return <SignIn onSignedIn={()=>setSignedIn(true)} />;
    if (!home) return <><AppHeader screen="Opening" /><main><p>{error || 'Opening…'}</p><button className="button-secondary" onClick={()=>void refresh()}>Refresh</button></main></>;
    const name=home.phone.name,toRaces=()=>go({kind:'races'});
    // Every avatar opens this one menu. Log out asks nothing: the phone keeps its listed names.
    const menuLabel=`${name}: ${isLead?'Results, Day setup and Log out':'Log out'}`,openMenu=(anchor:HTMLElement)=>{
      const box=anchor.getBoundingClientRect();
      setMenu(menu?null:{top:box.bottom+6,right:document.documentElement.clientWidth-box.right});
    };
    const menuList=menu && <div className="rz-menu" role="menu" style={menu}>
      {isLead && <><button role="menuitem" type="button" onClick={()=>go({kind:'results'})}>Results</button>
        <button role="menuitem" type="button" onClick={()=>go({kind:'day'})}>Day setup</button></>}
      <button role="menuitem" type="button" disabled={logOut.busy} onClick={()=>void logOut.submit(async()=>{await api('sign-out',{});phoneStorage.signOut();})}>Log out</button>
      {logOut.error && <p role="alert" className="rz-note">{logOut.error}</p>}
    </div>;
    const avatar=<div style={{position:'relative'}}><Avatar name={name} label={menuLabel} onOpen={openMenu}/>{menuList}</div>;
    if(!role) return <JoinJob avatar={avatar} onChoose={choose} onLead={refresh}/>;
    const sheet=roleSheet && <RoleSheet role={role} lead={isLead} onChoose={choose} onLead={refresh} onClose={()=>setRoleSheet(false)}/>;
    const pickTab=(tab:HomeTab)=>{setHomeTab(tab);phoneStorage.rememberHomeTab(tab);};
    const toResults=(opening:ResultsTarget)=>go(resultsView(opening),{opening});
    if(view.kind==='races' || view.kind==='race') {
      const bar=<HomeBar><RoleChip role={role} onOpen={()=>setRoleSheet(true)}/>{avatar}</HomeBar>;
      if(view.kind==='race') return <Screen screen="Race"><RaceShell key={view.id} raceId={view.id} me={home.phone.id} step={view.step} role={role} onRole={()=>setRoleSheet(true)} onBack={toRaces}
        onRace={(id,step)=>go({kind:'race',id,step})} onSaved={saved=>{showToast({message:saved.message,saved});toRaces();}} onResults={toResults}/>{sheet}</Screen>;
      return <Screen screen="Races" wide>{bar}<RacesHome tab={homeTab} me={home.phone.profileId} onTab={pickTab} role={role} onRace={(id,step)=>go({kind:'race',id,step})}
        onResults={toResults}/>{sheet}</Screen>;
    }
    // Back goes where the lead came from; with no history, up a level. A non-lead goes back to Races.
    const back=()=>{if(entryBack()) history.back();else go(isLead?parentOf(view):{kind:'races'},{replace:true});};
    // A lead screen's body keeps the older look, which has no race-flow tokens, so the job sheet brings its own .rz-screen.
    return <LeadFrame.Provider value={{role,onRole:()=>setRoleSheet(true),onBack:back}}>
      {isLead?<Suspense fallback={<main><p>Opening Lead…</p></main>}><Lead key={home.phone.dayId} view={view} target={target} onOpen={next=>go(next)} onBack={back} onChanged={()=>void refresh()}/></Suspense>
        :<><LeadBar title="Zone lead" up="Races"/><main><p>Lead access needed</p></main></>}
      {sheet && <div className="rz-screen rz-zone-running">{sheet}</div>}
    </LeadFrame.Provider>;
  }
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
      <p className="rz-empty">You can switch job on any race.</p>
      <JobCard role="lead" checked={asking} onChoose={()=>setAsking(true)}/>
      {asking && <LeadCode onLead={async()=>{await onLead();onChoose('lead');}}/>}
    </main>
  </Screen>;
}
