import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Phone } from '../shared/domain.js';
import type { ResultsTarget } from '../shared/lead-results.js';
import { heldRole,holdsRole,type Role,type Step } from '../shared/race-flow.js';
import { api, phoneStorage,StaleRequest,type HomeTab } from './api.js';
import { SignIn } from './access/SignIn.js';
import { addressOf,entryBack,onSheetEntry,parentOf,sameScreen,sectionOf,sheetBack,shownName,viewAt,type View } from './shell/addresses.js';
import { reloadApp } from './shell/updates.js';
import { useSubmit } from './flow/useSubmit.js';
import { Avatar,Callout,HomeBar,JobBand,Screen,Opening as OpeningLine } from './races/parts.js';
import { failureLine } from '../shared/request-failure.js';
import { LeadHeader,LeadFrame,LeadsBar } from './lead/LeadHeader.js';
import { RacesHome } from './races/RacesHome.js';
import { RaceShell } from './races/RaceShell.js';
import { Toast,ToastContext,type ToastShown } from './races/Toast.js';
import { JobCard,JobChoice,LeadCode,RoleSheet } from './races/RoleSheet.js';
// A failed load (often an old page after a deploy) reloads the app; until then Opening Lead stays.
const Lead = lazy(()=>import('./lead/Lead.js').catch(()=>{reloadApp();return new Promise<never>(()=>{});}));
/** `role`: the role the server last heard from this phone today, or null. */
interface HomeRead { phone:Phone; needsYou?:number; role:Role|null }
/** What the next Back (one the app made itself) does in place of opening the screen it lands on. */
let afterBack:(()=>void)|null=null;
/** Where Open in Results lands: a tie on its screen, a race's item on its race page, anything else on its event; a Races card's Confirm the medals on that screen. */
const resultsView=(target:ResultsTarget):View=>target.stage?{kind:'confirm-the-medals',code:target.event.code}:target.tieId?{kind:'tie',code:target.event.code,tieId:target.tieId}
  :target.raceId && !target.entryId?{kind:'race-page',code:target.event.code,raceId:target.raceId}:{kind:'event',code:target.event.code};
export function App() {
  const [signedIn,setSignedIn] = useState(Boolean(phoneStorage.token()));
  const [home,setHome] = useState<HomeRead|null>(null);
  const [view,setView] = useState<View>(()=>viewAt(location.pathname+location.search));
  // What Open in Results asked to open on the event (the runner sheet, a check sheet), on that visit only.
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
  // Why the race this phone had open went back to Races (a lead removed it), until another race is opened.
  const [gone,setGone]=useState('');
  // Why the home read failed, while the app has not opened.
  const [error,setError] = useState<unknown>();
  const request=useRef(0);
  async function refresh() {
    const generation=++request.current;
    try {
      const data = await api<HomeRead>('home');if(generation!==request.current) return;
      const previous=phoneStorage.dayId();
      if(previous && previous!==data.phone.dayId) {phoneStorage.newDay(data.phone.dayId);return;}
      phoneStorage.rememberDay(data.phone.dayId);setHome(data);setError(undefined);
    }
    catch (error) { if(generation!==request.current || error instanceof StaleRequest) return;setError(error); }
  }
  /**
   * Moves to another screen at its own address. The history entry carries the name of the screen left, for the back
   * arrow; `replace` moves up a level in place of an entry (Back on a screen reached with no history), or switches an
   * event's tab in place, keeping the entry's back label and what Open in Results asked to open there. A lead's saved
   * race opens as its race page in place of its Race screen the same way, keeping the entry's back label.
   */
  function go(next:View,{replace=false,over=false,opening}:{replace?:boolean;over?:boolean;opening?:ResultsTarget}={}) {
    const path=addressOf(next),tab=next.kind==='event' && view.kind==='event' && next.code===view.code,page=next.kind==='race-page' && view.kind==='race' && next.raceId===view.id;
    // A screen asks for these two moves by itself, once its read arrives. That can be just after the phone's Back left
    // the screen: the address is then another screen's, and the move would put this one back in its place.
    if(replace && (tab || page) && !sameScreen(viewAt(location.pathname+location.search),view)) return;
    setMenu(null);setView(next);setTarget(replace && tab?target:opening);
    // `over`: the new screen takes the place of this one and the one it was opened from (a re-run's new race replaces the old race and the re-run screen).
    if(over && entryBack()) {afterBack=()=>history.replaceState(history.state,'',path);history.back();}
    else if(replace || over) history.replaceState(tab || page?history.state:null,'',path);
    // A move from a sheet takes the sheet's entry, so Back from the new screen skips the closed sheet.
    else if(location.pathname+location.search!==path) history[onSheetEntry()?'replaceState':'pushState']({back:shownName(),section:sectionOf(view)},'',path);
    window.scrollTo(0,0);
  }
  useEffect(()=>{
    const back=()=>{
      if(afterBack) {const then=afterBack;afterBack=null;then();return;}
      if(sheetBack()) return;setMenu(null);setTarget(undefined);setView(viewAt(location.pathname+location.search));};
    addEventListener('popstate',back);return ()=>removeEventListener('popstate',back);
  },[]);
  useEffect(()=>{
    const removed = () => {request.current++;setSignedIn(false);setHome(null);go({kind:'races'});setError(undefined);};
    const session=(event:Event)=>{
      const newDay=(event as CustomEvent<{newDay:boolean}>).detail.newDay;
      request.current++;setSignedIn(Boolean(phoneStorage.token()));setHome(null);go(newDay?{kind:'day'}:{kind:'races'},{replace:newDay});setError(undefined);
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
    setRole(heldRole(held,isLead)??(isLead?'lead':null));
  },[dayId,isLead]);
  // The phone reports its job on Join and on every switch (ADR 0007), wherever the job was set. Each home read says
  // which one the server holds, so a report that did not arrive goes again on the next read.
  useEffect(()=>{
    if(home && role && home.role!==role && holdsRole(role,isLead)) void api('role',{role}).catch(()=>{/* the next home read sends it again */});
  },[home,role,isLead]);
  function choose(next:Role) {if(dayId) phoneStorage.rememberRole(dayId,next);setRole(next);setRoleSheet(false);}
  // The toast sits over every screen, so it brings its own screen root (the design system's tokens), as the job sheet does.
  const withToast=(screen:ReactNode)=><ToastContext.Provider value={showToast}>{screen}
    {toast && <div className="rz-screen"><Toast key={toast.id} toast={toast} onOpen={(id,step)=>go({kind:'race',id,step})} onClose={()=>setToast(null)}/></div>}</ToastContext.Provider>;
  return withToast(screen());
  function screen() {
    if (!signedIn) return <SignIn onSignedIn={()=>setSignedIn(true)} />;
    if (!home) return <Opening words="Opening the Running Zone…" error={error} onRefresh={()=>void refresh()}/>;
    const name=home.phone.name,toRaces=()=>go({kind:'races'});
    // Every avatar opens this one menu. Log out asks nothing: the phone keeps its listed names.
    const menuLabel=`${name}: Log out`,openMenu=(anchor:HTMLElement)=>{
      const box=anchor.getBoundingClientRect();
      setMenu(menu?null:{top:box.bottom+6,right:document.documentElement.clientWidth-box.right});
    };
    const menuList=menu && <div className="rz-menu" role="menu" style={menu}>
      <button role="menuitem" type="button" disabled={logOut.busy} onClick={()=>void logOut.submit(async()=>{await api('sign-out',{});phoneStorage.signOut();})}>Log out</button>
      {logOut.error && <p role="alert" className="rz-note">{logOut.error}</p>}
    </div>;
    const avatar=<div style={{position:'relative'}}><Avatar name={name} label={menuLabel} onOpen={openMenu}/>{menuList}</div>;
    if(!role) return <JoinJob avatar={avatar} onChoose={choose} onLead={refresh}/>;
    const sheet=roleSheet && <RoleSheet role={role} lead={isLead} onChoose={choose} onLead={refresh} onClose={()=>setRoleSheet(false)}/>;
    const pickTab=(tab:HomeTab)=>{setHomeTab(tab);phoneStorage.rememberHomeTab(tab);};
    const toResults=(opening:ResultsTarget)=>go(resultsView(opening),{opening});
    if(view.kind==='races' || view.kind==='race') {
      const bar=<><HomeBar>{avatar}</HomeBar><JobBand role={role} onOpen={()=>setRoleSheet(true)}/></>;
      const toRace=(id:string,step?:Step)=>{setGone('');go({kind:'race',id,step});};
      if(view.kind==='race') return <Screen screen="Race"><RaceShell key={view.id} raceId={view.id} step={view.step} role={role} avatar={avatar} onRole={()=>setRoleSheet(true)} onBack={toRaces} onGone={line=>{setGone(line);toRaces();}}
        onRace={toRace} onSaved={saved=>{showToast({message:saved.message,saved});pickTab(saved.tab);toRaces();}} onResults={toResults} onOpen={next=>go(next)} onPage={code=>go({kind:'race-page',code,raceId:view.id},{replace:true})}/>{sheet}</Screen>;
      return <Screen screen="Races" wide>{bar}<RacesHome tab={homeTab} onTab={pickTab} role={role} gone={gone} onRace={toRace}
        onResults={toResults}/>{isLead && <LeadsBar current="Races" onOpen={next=>go(next)}/>}{sheet}</Screen>;
    }
    // Back goes where the lead came from; with no history, up a level. A non-lead goes back to Races. Two levels (after a
    // delete) goes back past the race too: to its entry first, then on from there as its own Back would.
    const up=(from:View)=>go(isLead?parentOf(from):{kind:'races'},{replace:true});
    const back=(levels:1|2=1)=>{
      if(levels===2) {if(entryBack()) {afterBack=()=>{if(entryBack()) history.back();else up(viewAt(location.pathname+location.search));};history.back();} else up(parentOf(view));return;}
      if(entryBack()) history.go(onSheetEntry()?-2:-1);else up(view);
    };
    // The job sheet sits beside the lead screen's root, so it brings its own.
    // Every lead screen has the lead's bar; someone with no lead access has none.
    return <LeadFrame.Provider value={{avatar,onBack:()=>back(),bar:isLead && <LeadsBar current={sectionOf(view)} onOpen={next=>go(next)}/>}}>
      {isLead?<Suspense fallback={<Opening words="Opening Lead…"/>}><Lead key={home.phone.dayId} view={view} target={target} onOpen={(next,options)=>go(next,options)} onBack={back} onChanged={()=>void refresh()}/></Suspense>
        :<LeadAccess onLead={async()=>{await refresh();choose('lead');}}/>}
      {sheet && <div className="rz-screen rz-zone-running">{sheet}</div>}
    </LeadFrame.Provider>;
  }
}
/** While the app (or Lead) opens: the app bar and a spinner, or the amber callout with Refresh when the read failed. */
function Opening({words,error,onRefresh}:{words:string;error?:unknown;onRefresh?:()=>void}) {
  return <Screen screen="Opening"><HomeBar>{null}</HomeBar>
    {error===undefined?<main className="rz-main rz-opening"><OpeningLine words={words}/></main>
      :<main className="rz-main"><Callout message={failureLine(error,'read')} actions={<button type="button" className="rz-btn rz-btn--small" onClick={onRefresh}>Refresh</button>}/></main>}
  </Screen>;
}
/** Lead access needed: someone without lead access at a lead screen's address types the lead code to open it. */
function LeadAccess({onLead}:{onLead:()=>Promise<void>}) {
  return <LeadHeader title="Lead access needed" up="Races" body={<LeadCode onLead={onLead} prompt={<div className="rz-prompt">
    <p className="rz-prompt__meta">Results and Day setup are for zone leads</p><h2 className="rz-prompt__q">Type the <em>lead code</em></h2>
    <p className="rz-prompt__help">Ask the zone lead who set up today.</p>
  </div>}/>}/>;
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
